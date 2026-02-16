const express = require('express');
const router = express.Router();
const { createSubcategory, getSubcategories } = require('./subcategory.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');

// Create subcategory (SUPER & ADMIN)
router.post('/', authenticate, authorize('SUPER', 'ADMIN'), createSubcategory);

// Get subcategories (all users)
router.get('/', authenticate, getSubcategories);

module.exports = router;