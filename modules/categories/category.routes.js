const express = require('express');
const router = express.Router();
const { createCategory, getCategories, uploadCategorySizeChart, deleteCategory } = require('./category.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');
const upload = require('../../middleware/upload.middleware')

router.post(
  '/',
  authenticate,
  authorize('SUPER'),
  createCategory
);

router.post(
  '/size-chart',
  authenticate,
  authorize('SUPER','ADMIN'),
  upload.single('image'),
  uploadCategorySizeChart
);

router.get(
  '/',
  authenticate,
  authorize('SUPER', 'ADMIN'),
  getCategories
);


router.delete(
  '/:id',
  authenticate,
  authorize('SUPER','ADMIN'),
  deleteCategory
);

module.exports = router;