const express = require('express');
const router = express.Router();
const optionalAuth = require('../../middleware/optionalAuth');

const {
  getPublicProducts,
  getPublicProductDetail
} = require('./product.public.controller');

router.get('/public-products', optionalAuth, getPublicProducts);
router.get('/details/:slug', optionalAuth, getPublicProductDetail);

module.exports = router;