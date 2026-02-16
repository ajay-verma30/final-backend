const express = require('express');
const router = express.Router();
const optionalAuth = require('../../middleware/optionalAuth');

const { getPublicLogos } = require('./logo.public.controller');

router.get('/public-logos', optionalAuth, getPublicLogos);

module.exports = router;