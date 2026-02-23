const express = require('express');
const router = express.Router();
const upload = require('../../middleware/upload.middleware');

const {
  createProduct,
  getProducts,
  getProductById,
  deleteProduct,
  addVariantPriceTier,
  addVariant,
  addVariantImage,
  updateProduct,
  // ✅ NEW: Size handlers
  addVariantSize,
  updateVariantSize,
  deleteVariantSize
} = require('./product.controller');

const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');


// ================= PRODUCTS =================

// Create product (SUPER & ADMIN)
router.post(
  '/create',
  authenticate,
  authorize('SUPER', 'ADMIN'),
  upload.array('images', 3),
  createProduct
);

// Get all products (all logged-in users)
router.get(
  '/all-products',
  authenticate,
  getProducts
);

// Get product by ID
router.get(
  '/:id',
  authenticate,
  getProductById
);

// Update product (SUPER & ADMIN)
router.put(
  '/:id',
  authenticate,
  authorize('SUPER', 'ADMIN'),
  upload.any(),
  updateProduct
);

// Delete product (SUPER & ADMIN)
router.delete(
  '/:id',
  authenticate,
  authorize('SUPER', 'ADMIN'),
  deleteProduct
);


// ================= VARIANTS =================

// Add variant
router.post(
  '/add-variants',
  authenticate,
  authorize('SUPER', 'ADMIN'),
  addVariant
);

// Add variant image
router.post(
  '/variants/images',
  authenticate,
  authorize('SUPER', 'ADMIN'),
  upload.array('images', 50),
  addVariantImage
);

// Add variant price tier
router.post(
  '/variants/price-tiers',
  authenticate,
  authorize('SUPER', 'ADMIN'),
  addVariantPriceTier
);


// ================= VARIANT SIZES ✅ NEW =================

// Add a size to a variant
router.post(
  '/variants/sizes',
  authenticate,
  authorize('SUPER', 'ADMIN'),
  addVariantSize
);

// Update a specific size
router.put(
  '/variants/sizes/:sizeId',
  authenticate,
  authorize('SUPER', 'ADMIN'),
  updateVariantSize
);

// Soft delete a specific size
router.delete(
  '/variants/sizes/:sizeId',
  authenticate,
  authorize('SUPER', 'ADMIN'),
  deleteVariantSize
);


module.exports = router;