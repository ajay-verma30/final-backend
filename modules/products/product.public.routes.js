const express = require('express');
const router = express.Router();
const optionalAuth = require('../../middleware/optionalAuth');

const {
  getPublicProducts
} = require('./product.public.controller');

router.get('/public-products', optionalAuth, getPublicProducts);

module.exports = router;