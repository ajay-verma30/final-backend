const express = require('express');
const router = express.Router();
const controller = require('./auth.controller');
const rateLimit = require('express-rate-limit')

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message:{
    message: "Too many login attempts. Try again after 15 minutes."
  },
  standardHeaders: true,
  legacyHeaders: false  
})

router.post('/login', loginLimiter,controller.login);
router.post('/set-password', controller.setPassword);
router.post('/refresh', controller.refresh);
router.post('/forgot-password', controller.forgotPassword);

module.exports = router;