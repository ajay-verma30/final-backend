const express = require('express');
const router  = express.Router();
const { authenticate } = require('../../middleware/auth.middleware');
const {
  addToCart,
  getCart,
  removeCartItem,
  updateCartItem,
} = require('./cart.controller');

// POST   /api/user/cart/add           — add plain or customized item
router.post('/add', authenticate, addToCart);

// GET    /api/user/cart               — fetch all items in the user's cart
router.get('/', authenticate, getCart);

// PATCH  /api/user/cart/item/:item_id — update quantity of a cart item
router.patch('/item/:item_id', authenticate, updateCartItem);

// DELETE /api/user/cart/item/:item_id — remove a cart item
router.delete('/item/:item_id', authenticate, removeCartItem);

module.exports = router;