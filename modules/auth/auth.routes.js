const express = require('express');
const router = express.Router();
const controller = require('./auth.controller');

router.post('/login', controller.login);
router.post('/set-password', controller.setPassword);

module.exports = router;