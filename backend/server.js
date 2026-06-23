const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const helmet = require('helmet');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const http = require('http');
const socketio = require('socket.io');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Trust Railway Proxy for Rate Limiting
app.set('trust proxy', 1);

// Enable CORS (Must be at the very top)
const allowedOrigins = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5174'];
app.use(cors({
  origin: function (origin, callback) {
    // Always allow requests with no origin (mobile apps, Expo Go, curl, Postman)
    if (!origin) return callback(null, true);
    // Allow local network IPs (mobile dev on same WiFi)
    if (/^https?:\/\/(192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|10\.)/.test(origin)) return callback(null, true);
    // Allow registered origins
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    // In development, allow everything
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    // In production, still allow (change this to restrict if needed)
    return callback(null, true);
  },
  credentials: true,
}));

// Disable ETag to prevent 304 Not Modified statuses
app.disable('etag');

const { protect } = require('./middleware/auth');

// Global middleware to prevent caching and resolve 304 issues
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Cookie parser
app.use(cookieParser());

// Dev logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Sanitize data
app.use(mongoSanitize());

// Set security headers
app.use(helmet());

// Prevent XSS attacks
app.use(xss());

// Rate limiting
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 mins
  max: 500, // Reduced from 1000 for better security
});
app.use(limiter);

// Prevent http param pollution
app.use(hpp());

// Set static folder
app.use(express.static('public'));

// Define Routes
app.get('/', (req, res) => {
  res.status(200).json({ success: true, message: 'Geo-Attendance HRMS System Server is running.' });
});

app.get('/api', (req, res) => {
  res.status(200).json({ success: true, message: 'Geo-Attendance HRMS API is online.' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/shifts', require('./routes/shifts'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/designations', require('./routes/designations'));
app.use('/api/holidays', require('./routes/holidays'));
app.use('/api/leave-types', require('./routes/leaveTypes'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/visits', require('./routes/customerVisits'));

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false
  }
});

// Make io accessible in controllers
app.set('io', io);

// Start background notification scheduler service
const { startScheduler } = require('./services/notificationSchedulerService');
startScheduler(io);

const User = require('./models/User');

// Socket.io integration
io.on('connection', (socket) => {
  socket.on('join', async (userId) => {
    try {
      socket.userId = userId;
      await User.findByIdAndUpdate(userId, { isOnline: true });
      io.emit('userStatusChanged', { userId, status: 'online' });
    } catch (err) { }
  });

  socket.on('updateLocation', (data) => {
    // data: { userId, latitude, longitude, address, totalDistance, isOutside }
    io.emit('locationUpdated', data);
  });

  // Enterprise Tracking Batch (with acknowledgment)
  const enterpriseTracking = require('./services/enterpriseTrackingService');
  socket.on('trackingBatch', async (payload, ack) => {
    try {
      const { userId, batch } = payload;
      if (userId && batch) {
        const result = await enterpriseTracking.processTrackingBatch(userId, batch, io);
        // Send acknowledgment back to the mobile app
        if (typeof ack === 'function') {
          ack(result || { success: true });
        }
      } else {
        if (typeof ack === 'function') {
          ack({ success: false, error: 'Missing userId or batch' });
        }
      }
    } catch (err) {
      console.error('Socket trackingBatch error:', err);
      if (typeof ack === 'function') {
        ack({ success: false, error: err.message });
      }
    }
  });

  socket.on('disconnect', async () => {
    try {
      if (socket.userId) {
        await User.findByIdAndUpdate(socket.userId, { isOnline: false });
        io.emit('userStatusChanged', { userId: socket.userId, status: 'offline' });
      }
    } catch (err) { }
  });
});

// Start telemetry health check monitor for punched-in users (log error if no coordinates sent for > 5 mins)
setInterval(async () => {
  try {
    const cutoffTime = new Date(Date.now() - 300000);
    const Attendance = require('./models/Attendance');
    const { LiveEmployeeStatus } = require('./models/Tracking');

    const activeAttendances = await Attendance.find({
      "punchIn.time": { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      "punchOut.time": { $exists: false }
    }).populate('user');

    for (const att of activeAttendances) {
      if (!att.user) continue;
      let liveStatus = await LiveEmployeeStatus.findOne({ userId: att.user._id });
      if (!liveStatus) {
        liveStatus = new LiveEmployeeStatus({ userId: att.user._id });
      }
      const lastUpdateTime = liveStatus.lastUpdate ? new Date(liveStatus.lastUpdate) : new Date(att.punchIn.time);

      if (lastUpdateTime < cutoffTime) {
        const minutesDiff = ((Date.now() - lastUpdateTime.getTime()) / 60000).toFixed(1);
        console.error(`[TelemetryAlert] ERROR: Employee "${att.user.email}" (${att.user.name}) is punched in but background tracking has not sent coordinates for ${minutesDiff} minutes. Last update was at ${lastUpdateTime.toLocaleTimeString()}`);

        if (liveStatus.currentStatus !== 'offline') {
          liveStatus.currentStatus = 'offline';
          liveStatus.signalQuality = 'lost';
          await liveStatus.save();

          try {
            const notificationService = require('./services/notificationService');
            await notificationService.createAndSendNotification({
              title: 'Location Service Disabled 🚨',
              description: `Employee ${att.user.name} (${att.user.email}) has turned off their device location service or background tracking is unresponsive (no coordinates for ${minutesDiff} minutes).`,
              type: 'emergancy notification',
              frequency: 'Instant',
              targetType: 'Role-based Employees',
              targetRole: 'admin',
              isAuto: false
            }, io);
          } catch (notifErr) {
            console.error('[Telemetry Notif Error]:', notifErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error in telemetry monitor interval:', err.message);
  }
}, 60000);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  // Close server & exit process
  server.close(() => process.exit(1));
});
