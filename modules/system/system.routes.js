const express = require('express');
const router = express.Router();
const controller = require('./system.controller');

router.post('/bootstrap-super', controller.bootstrapSuper);

module.exports = router;