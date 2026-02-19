const express = require('express');
const router = express.Router();
const controller = require('./groups.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');
const ROLES = require('../../constants/roles');

router.use(authenticate);

router.get('/', authorize(ROLES.SUPER, ROLES.ADMIN), controller.listGroups);

router.post('/add', authorize(ROLES.SUPER, ROLES.ADMIN), controller.createGroup);

router.post('/add-members', authorize(ROLES.SUPER, ROLES.ADMIN), controller.addUsersToGroup);
// Existing group mein members add karne ke liye
router.post('/:id/members', authorize(ROLES.SUPER, ROLES.ADMIN), controller.addMembersToExistingGroup);

router.get('/:id/members', authorize(ROLES.SUPER, ROLES.ADMIN), controller.getGroupMembers);

// Ye line controller.getGroupById ke liye honi chahiye
router.get('/:id', authorize(ROLES.SUPER, ROLES.ADMIN), controller.getGroupById);

// Ye line removeMember ke liye
router.delete('/:id/members/:userId', authorize(ROLES.SUPER, ROLES.ADMIN), controller.removeMember);

router.delete('/:id', authorize(ROLES.SUPER, ROLES.ADMIN), controller.deleteGroup);

module.exports = router;