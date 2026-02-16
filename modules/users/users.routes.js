const express = require('express');
const router = express.Router();
const { createUser } = require('./users.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');

router.post(
  '/',
  authenticate,
  authorize('SUPER', 'ADMIN'),
  createUser
);

module.exports = router;