const express = require('express');
const {
  register,
  login,
  logout,
  getMe,
  sendOTP,
} = require('../controllers/auth');

const router = express.Router();

const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/send-otp', sendOTP);
router.get('/logout', logout);
router.get('/me', protect, getMe);

module.exports = router;
