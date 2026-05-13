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

// Enable CORS (Must be at the very top)
app.use(cors({
  origin: true,
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
// app.use(mongoSanitize());

// Set security headers
app.use(helmet());

// Prevent XSS attacks
// app.use(xss());

// Rate limiting
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 mins
  max: 1000, // Increased from 100
});
app.use(limiter);

// Prevent http param pollution
app.use(hpp());

// Set static folder
app.use(express.static('public'));

// Define Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/shifts', require('./routes/shifts'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/ai', require('./routes/ai'));

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "*",
  }
});

// Make io accessible in controllers
app.set('io', io);


const User = require('./models/User');

// Socket.io integration
io.on('connection', (socket) => {
  socket.on('join', async (userId) => {
    try {
      socket.userId = userId;
      await User.findByIdAndUpdate(userId, { isOnline: true });
      io.emit('userStatusChanged', { userId, status: 'online' });
    } catch (err) {}
  });

  socket.on('updateLocation', (data) => {
    // data: { userId, latitude, longitude, address, totalDistance, isOutside }
    io.emit('locationUpdated', data);
  });

  socket.on('disconnect', async () => {
    try {
      if (socket.userId) {
        await User.findByIdAndUpdate(socket.userId, { isOnline: false });
        io.emit('userStatusChanged', { userId: socket.userId, status: 'offline' });
      }
    } catch (err) {}
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  // Close server & exit process
  server.close(() => process.exit(1));
});
