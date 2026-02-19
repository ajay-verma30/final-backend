const express = require('express');
const router = express.Router();
const upload = require('../../middleware/logoUpload.middleware');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');
const {
  createLogo,
  getLogos,
  updateLogo,
  deleteLogo,
  addLogoVariant,
  getLogoById,
  deleteLogoVariant
} = require('./logo.controller');

// CRUD for Logos
router.post('/logo', authenticate, authorize('SUPER', 'ADMIN'), createLogo);
router.get('/all', authenticate, getLogos);
router.get('/:id', authenticate, getLogoById);
router.put('/logo/:id', authenticate, authorize('SUPER', 'ADMIN'), updateLogo);
router.delete('/logo/:id', authenticate, authorize('SUPER', 'ADMIN'), deleteLogo);

router.post('/logo/variants', authenticate, authorize('SUPER', 'ADMIN'), upload.single('image'), addLogoVariant);
// Add this line
router.delete('/variant/:variantId', authenticate, authorize('SUPER', 'ADMIN'), deleteLogoVariant);

module.exports = router;