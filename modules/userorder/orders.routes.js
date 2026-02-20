const express = require('express');
const router  = express.Router();
const { authenticate } = require('../../middleware/auth.middleware');
const { getUserOrders } = require('./orders.controller');


router.get('/', authenticate, getUserOrders);

module.exports = router;