const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    return {
      folder: 'logos',
      resource_type: 'image',
      allowed_formats: ['png', 'svg'],
      transformation: []
    };
  }
});

const logoUpload = multer({
  storage,
  limits: {
    fileSize: 3 * 1024 * 1024
  }
});

module.exports = logoUpload;