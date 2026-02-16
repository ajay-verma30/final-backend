const express = require('express');
const router = express.Router();
const controller = require('./organization.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');
const ROLES = require('../../constants/roles');



router.post('/', authenticate, authorize(ROLES.SUPER), controller.createOrganization);


module.exports = router;