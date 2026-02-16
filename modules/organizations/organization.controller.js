const organizationService = require('./organization.service');

exports.createOrganization = async (req, res) => {
  try {
    const { name, phone, admin } = req.body;

    if (!name) {
      return res.status(400).json({
        message: 'Organization name is required'
      });
    }

    if (!admin || !admin.first_name || !admin.last_name || !admin.email || !admin.password) {
      return res.status(400).json({
        message: 'Admin details are required (first_name, last_name, email, password)'
      });
    }

    const result = await organizationService.createOrganization({
      name,
      phone,
      admin
    });

    return res.status(201).json({
      message: 'Organization and Admin created successfully',
      data: result
    });

  } catch (error) {

    if (error.message === 'INVALID_PHONE') {
      return res.status(400).json({
        message: 'Phone must be in format +1-XXX-XXX-XXXX'
      });
    }

    if (error.message === 'ORG_EXISTS') {
      return res.status(409).json({
        message: 'Organization already exists'
      });
    }

    if (error.message === 'EMAIL_EXISTS') {
      return res.status(409).json({
        message: 'Admin email already exists'
      });
    }

    console.error(error);
    return res.status(500).json({
      message: 'Internal server error'
    });
  }
};