const express = require('express');
const router = express.Router();
const optionalAuth  = require('../../middleware/optionalAuth');
const cartController = require('./cart.controller');

router.post('/', optionalAuth, cartController.addToCart);
router.get('/', optionalAuth, cartController.getCart);
router.put('/item/:itemId', optionalAuth, cartController.updateCartItem);
router.delete('/item/:itemId', optionalAuth, cartController.removeCartItem);
router.delete('/clear', optionalAuth, cartController.clearCart);

module.exports = router;