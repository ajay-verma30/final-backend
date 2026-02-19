const express = require('express');
const router = express.Router();
const couponController = require('./coupons.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');
const ROLES = require('../../constants/roles');

// ✅ 1. Get All Batches (View History)
router.get(
  '/batches',
  authenticate,
  authorize(ROLES.SUPER, ROLES.ADMIN),
  couponController.getBatches
);

// ✅ 2. Initiate Payment — creates Stripe PaymentIntent + pending batch row
router.post(
  '/initiate-payment',
  authenticate,
  authorize(ROLES.SUPER, ROLES.ADMIN),
  couponController.initiateCouponPayment
);

router.get(
  '/my-coupons',
  authenticate,
  couponController.getUserCoupons
);

module.exports = router;