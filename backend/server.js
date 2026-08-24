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
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

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
const { tenantContext, sanitizeTenantPayload } = require('./middleware/tenantMiddleware');

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
app.use('/api', protect, tenantContext, sanitizeTenantPayload);
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/leave/admin', require('./routes/leaveAdmin'));
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
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/products', require('./routes/products'));
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
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/products', require('./routes/products'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/visits', require('./routes/customerVisits'));
app.use('/api/permissions', require('./routes/permissions'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/admin/console', require('./routes/adminConsole'));
app.use('/api/admin-console', require('./routes/adminConsole'));

// Material Management Module Routes
const materialModuleRoutes = require('./modules/material/routes');
app.use('/api/material', materialModuleRoutes);

// Material direct endpoints for backward compatibility
app.use('/api/transactions', require('./modules/material/routes/transaction.routes'));
app.use('/api/barcodes', require('./modules/material/routes/barcode.routes'));
app.use('/api/chat', require('./modules/material/routes/chat.routes'));
app.use('/api/receiving', require('./modules/material/routes/receiving.routes'));
app.use('/api/tally', require('./modules/material/routes/tally.routes'));
app.use('/api/audit-logs', require('./modules/material/routes/audit.routes'));
app.use('/api/search', require('./modules/material/routes/search.routes'));

// Expense Management Module (HR module - combined multi-employee claims)
app.use('/api/expense', require('./modules/hr/expense/routes'));

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// ─── Socket.IO Setup with Authentication ───
const io = socketio(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (/^https?:\/\/(192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|10\.)/.test(origin)) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
      if (process.env.NODE_ENV !== 'production') return callback(null, true);
      return callback(null, true);
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// ─── Socket.IO JWT Authentication Middleware ───
const jwt = require('jsonwebtoken');
io.use(async (socket, next) => {
  try {
    let token = socket.handshake.auth?.token;
    if (token && token.startsWith('Bearer ')) {
      token = token.split(' ')[1];
    }
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const User = require('./models/User');
      const user = await User.findById(decoded.id || decoded.userId).select('_id name email role roleCode companyId company scope');
      if (user) {
        const compId = user.companyId || user.company || decoded.companyId || null;
        socket.user = {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          roleCode: user.roleCode,
          companyId: compId ? compId.toString() : null,
          scope: user.scope
        };
      }
    }
    next();
  } catch (err) {
    next();
  }
});

// Make io accessible in controllers & set global socket singleton
app.set('io', io);
const globalSocket = require('./config/socket');
globalSocket.setIO(io);

// Start background notification scheduler service
const { startScheduler } = require('./services/notificationSchedulerService');
startScheduler(io);

const User = require('./models/User');

// Socket.io integration
io.on('connection', (socket) => {
  socket.on('join', async () => {
    try {
      if (!socket.user) return;
      const resolvedUserId = socket.user.id;
      socket.userId = resolvedUserId;
      socket.join(resolvedUserId);
      socket.join(`user:${resolvedUserId}`);
      
      const compId = socket.user?.companyId;
      if (compId) {
        socket.join(`company:${compId}`);
        socket.join(`company:${compId}:notifications`);
        socket.join(`company:${compId}:tracking`);
      }

      const role = (socket.user?.role || '').toLowerCase();
      if (role !== 'employee') {
        socket.join(`company:${compId}:admin`);
        if (compId) {
          socket.join(`company:${compId}:admin`);
        }
      }
      
      await User.findByIdAndUpdate(resolvedUserId, { isOnline: true });
      if (compId) {
        io.to(`company:${compId}`).emit('userStatusChanged', { userId: resolvedUserId, status: 'online' });
      } else {
        io.emit('userStatusChanged', { userId: resolvedUserId, status: 'online' });
      }
    } catch (err) { }
  });

  // Material module transaction chat rooms
  socket.on('join_transaction', (transactionId) => {
    if (socket.user?.companyId && transactionId) socket.join(`company:${socket.user.companyId}:txn:${transactionId}`);
  });

  socket.on('leave_transaction', (transactionId) => {
    if (socket.user?.companyId && transactionId) socket.leave(`company:${socket.user.companyId}:txn:${transactionId}`);
  });

  socket.on('typing', ({ transactionId, userName }) => {
    if (socket.user?.companyId) socket.to(`company:${socket.user.companyId}:txn:${transactionId}`).emit('user_typing', { userId: socket.userId, userName });
  });

  socket.on('stop_typing', ({ transactionId }) => {
    if (socket.user?.companyId) socket.to(`company:${socket.user.companyId}:txn:${transactionId}`).emit('user_stop_typing', { userId: socket.userId });
  });

  socket.on('updateLocation', (data) => {
    // Company-isolated live geo-location tracking stream
    const compId = socket.user?.companyId;
    if (compId) {
      io.to(`company:${compId}:tracking`).emit('locationUpdated', data);
    } else {
      io.emit('locationUpdated', data);
    }
  });

  // Enterprise Tracking Batch (with acknowledgment)
  const enterpriseTracking = require('./services/enterpriseTrackingService');
  socket.on('trackingBatch', async (payload, ack) => {
    try {
      // Use authenticated user ID, fallback to payload for backward compat (#11 fix)
      const userId = socket.user?.id || payload?.userId;
      const { batch } = payload;
      if (userId && batch) {
        const result = await enterpriseTracking.processTrackingBatch(userId, batch, io);
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

  // Tracking Health Monitoring: Heartbeat socket handler
  socket.on('heartbeat', async (data) => {
    try {
      const trackingHealthService = require('./services/trackingHealthService');
      const userId = socket.user?.id || data?.userId;
      if (userId) {
        await trackingHealthService.processHeartbeat(userId, data, socket.user?.companyId || null);
      }
    } catch (err) {
      console.error('Socket heartbeat error:', err);
    }
  });

  // Tracking Health Monitoring: Custom health update socket handler
  socket.on('trackingHealthUpdate', async (data) => {
    try {
      const trackingHealthService = require('./services/trackingHealthService');
      const userId = socket.user?.id || data?.userId;
      if (userId) {
        await trackingHealthService.processHealthUpdate(userId, data, socket.user?.companyId || null);
      }
    } catch (err) {
      console.error('Socket trackingHealthUpdate error:', err);
    }
  });

  socket.on('disconnect', async () => {
    try {
      if (socket.userId) {
        await User.findByIdAndUpdate(socket.userId, { isOnline: false });
        if (socket.user?.companyId) io.to(`company:${socket.user.companyId}`).emit('userStatusChanged', { userId: socket.userId, status: 'offline' });
      }
    } catch (err) { }
  });
});

// Start tracking health watchdog cycle for punched-in users (runs every 30 seconds)
const trackingHealthService = require('./services/trackingHealthService');
setInterval(async () => {
  await trackingHealthService.runWatchdogCycle(io);
}, 30000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  // Close server & exit process
  server.close(() => process.exit(1));
});
