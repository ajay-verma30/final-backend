const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');

const {
  createOrder,
  getMyOrders,
  getOrderDetails,
  updateOrderStatus
} = require('./order.controller');

router.post('/', authenticate, createOrder);
router.get('/my', authenticate, getMyOrders);
router.get('/:id', authenticate, getOrderDetails);
router.put('/:id/status', authenticate, authorize('SUPER','ADMIN'), updateOrderStatus);

module.exports = router;