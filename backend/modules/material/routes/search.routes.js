const express = require('express');
const router = express.Router();
const { protect } = require('../../../middleware/auth');
const { globalSearch } = require('../controllers/search.controller');

router.use(protect);
router.get('/', globalSearch);

module.exports = router;
