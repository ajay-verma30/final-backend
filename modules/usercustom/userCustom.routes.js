const express = require('express');
const router = express.Router();
const upload = require('../../middleware/upload.middleware'); 
const { authenticate } = require('../../middleware/auth.middleware');
const { saveCustomProduct, getUserCustomProducts } = require('./userCustom.controller');

router.post(
  '/save', 
  authenticate, 
  upload.single('custom_image'), 
  saveCustomProduct
);

router.get(
  '/my-customizations', 
  authenticate, 
  getUserCustomProducts
);

module.exports = router;