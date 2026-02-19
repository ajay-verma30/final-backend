const express = require('express');
const router = express.Router();
const controller = require('./organization.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');
const ROLES = require('../../constants/roles');
const upload = require('../../middleware/upload.middleware');

router.post(
  '/',
  authenticate,
  authorize(ROLES.SUPER),
  controller.createOrganization
);

router.get(
  '/stats',
  authenticate,
  authorize(ROLES.SUPER),
  controller.getStats
);

router.get(
  '/',
  authenticate,
  authorize(ROLES.SUPER),
  controller.getAllOrganizations
);

router.get(
  '/:id',
  authenticate,
  authorize(ROLES.SUPER),
  controller.getOrganizationById
);

router.put(
  '/update/:id',
  authenticate,
  upload.single('logo'),
  controller.updateOrganization 
);

router.delete(
  '/:id',
  authenticate,
  controller.deleteOrganization 
);

module.exports = router;