const express = require('express');
const {
  register,
  login,
  logout,
  getMe,
  sendOTP,
  updateDetails,
  updateOnlineStatus,
} = require('../controllers/auth');

const router = express.Router();

const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/send-otp', sendOTP);
router.get('/logout', logout);
router.get('/me', protect, getMe);
router.put('/updatedetails', protect, updateDetails);
router.post('/status', protect, updateOnlineStatus);

module.exports = router;
