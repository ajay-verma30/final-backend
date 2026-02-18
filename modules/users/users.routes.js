const express = require('express');
const router = express.Router();
const { 
    createUser, 
    getUsers, 
    updateUser, 
    deleteUser, 
    changePassword,
    myProfile,
    updateMyProfile,
    addAddress,
    updateAddress,
    deleteAddress
} = require('./users.controller');

const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/role.middleware');

// ================= USER ROUTES =================

// 1. Create User
router.post(
  '/',
  authenticate,
  authorize('SUPER', 'ADMIN'),
  createUser
);

// change self password
router.post(
  '/change-password', 
  authenticate, 
  changePassword
);

//address creation
router.post(
  '/new-address', 
  authenticate, 
  addAddress
);


router.get('/my-profile', authenticate, myProfile);


// 2. Get Users
router.get(
  '/all-users',
  authenticate,
  getUsers
);

// 3. Update User details (First/Last Name)
router.put(
  '/:id',
  authenticate,
  updateUser
);

router.put(
  '/:id',
  authenticate,
  updateMyProfile
);


router.put(
  '/address/:id',
  authenticate,
  updateAddress
);

// 4. Delete User (Soft Delete)
router.delete(
  '/:id',
  authenticate,
  authorize('SUPER', 'ADMIN'),
  deleteUser
);

router.delete(
  '/address/:id',
  authenticate,
  authorize('SUPER', 'ADMIN'),
  deleteAddress
);



module.exports = router;