const express = require('express');
const router = express.Router();
const statsController = require('./stats.controller');
const { authenticate } = require('../../middleware/auth.middleware');

router.get('/dashboard-stats', authenticate, statsController.getDashboardStats);

module.exports = router;