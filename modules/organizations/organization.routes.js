const express = require('express');
const router = express.Router();
const controller = require('./organization.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');
const ROLES = require('../../constants/roles');
const upload = require('../../middleware/upload.middleware');

// SUPER only — create
router.post('/', authenticate, authorize(ROLES.SUPER), controller.createOrganization);

// SUPER only — stats
router.get('/stats', authenticate, authorize(ROLES.SUPER), controller.getStats);

// SUPER only — list all
router.get('/', authenticate, authorize(ROLES.SUPER), controller.getAllOrganizations);

// SUPER only — get by id
router.get('/:id', authenticate, authorize(ROLES.SUPER), controller.getOrganizationById);

// SUPER + ADMIN — update (service layer enforces ADMIN can only edit their own org)
router.put('/update/:id', authenticate, authorize(ROLES.SUPER, ROLES.ADMIN), upload.single('logo'), controller.updateOrganization);

// SUPER only — delete
router.delete('/:id', authenticate, authorize(ROLES.SUPER), controller.deleteOrganization);

module.exports = router;