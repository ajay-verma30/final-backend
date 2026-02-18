const express = require('express');
const router = express.Router();
const { createSubCategory, getSubcategoriesByCategory, deleteSubCategory, getSubCategories } = require('./subcategory.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');

// Create subcategory (SUPER & ADMIN)
router.post('/', authenticate, authorize('SUPER', 'ADMIN'), createSubCategory);
router.get('/all-subcat', authenticate, authorize('SUPER', 'ADMIN'), getSubCategories)
router.get('/:categoryId', authenticate, getSubcategoriesByCategory);

router.delete(
  '/sub/:id',
  authenticate,
  authorize('SUPER','ADMIN'),
  deleteSubCategory
);

module.exports = router;