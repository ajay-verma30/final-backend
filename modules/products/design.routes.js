const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');

const { 
    saveBulkLogoPlacements, 
    getProductPlacements, 
    deletePlacement,
    updatePlacementCoordinates 
} = require('./design.controller');


router.post('/customize', authenticate, authorize('SUPER', 'ADMIN'), saveBulkLogoPlacements);

router.patch('/customize/:id/coords', authenticate, authorize('SUPER', 'ADMIN'), updatePlacementCoordinates);

router.delete('/customize/:id', authenticate, authorize('SUPER', 'ADMIN'), deletePlacement);

router.get('/product/:productId', getProductPlacements);

module.exports = router;