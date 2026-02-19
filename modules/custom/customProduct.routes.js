const express = require('express');
const router = express.Router();
const customCtrl = require('./customProduct.controller');

const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');


// Apply authentication to all routes
router.use(authenticate);

// Create: Admin or Super
router.post('/add', authorize('SUPER', 'ADMIN'), customCtrl.createCustomization);

router.get('/', authorize('SUPER', 'ADMIN'), customCtrl.getCustomizations);
router.get('/:id', authorize('SUPER', 'ADMIN'), customCtrl.getCustomizations);


// Update: Admin or Super
router.put('/:id', authorize('SUPER', 'ADMIN'), customCtrl.updateCustomization);

// Delete: Admin or Super
router.delete('/delete/:id', authorize('SUPER', 'ADMIN'), customCtrl.deleteCustomization);

module.exports = router;