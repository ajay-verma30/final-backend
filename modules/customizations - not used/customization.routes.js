const express = require('express');
const router = express.Router();
const { savePlacements, getPlacements } = require('./customization.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');

router.post('/save', authenticate, authorize('SUPER', 'ADMIN'), savePlacements);
router.get('/:product_id', authenticate, getPlacements);

module.exports = router;