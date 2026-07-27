const express = require('express');
const {
  getMaterials,
  getMaterialById,
  createMaterial,
  updateMaterial,
  deleteMaterial,
} = require('../controllers/materials');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getMaterials)
  .post(createMaterial);

router.route('/:id')
  .get(getMaterialById)
  .put(updateMaterial)
  .delete(deleteMaterial);

module.exports = router;
