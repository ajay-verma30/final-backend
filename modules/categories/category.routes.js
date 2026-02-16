const express = require('express');
const router = express.Router();
const { createCategory, getCategories } = require('./category.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');

// Create category (SUPER & ADMIN)
router.post('/', authenticate, authorize('SUPER', 'ADMIN'), createCategory);

// Get categories (all users)
router.get('/', authenticate, getCategories);

module.exports = router;