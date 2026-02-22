const express = require('express');
const router = express.Router();
const { getShopFilters } = require('./shopfilters.controller');

// Public route — no auth middleware
router.get('/shop-filters', getShopFilters);

module.exports = router;