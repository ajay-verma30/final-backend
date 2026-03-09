const express = require('express');
const router = express.Router();
const { submitQuoteRequest } = require('./contact.controller');

router.post('/quote', submitQuoteRequest);

module.exports = router;