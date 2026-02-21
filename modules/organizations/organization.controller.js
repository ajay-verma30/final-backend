const organizationService = require('./organization.service');

// ✅ CREATE ORGANIZATION (SUPER ONLY)
exports.createOrganization = async (req, res) => {
  try {
    const { name, phone, admin } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Organization name is required' });
    }

    if (!admin || !admin.first_name || !admin.last_name || !admin.email || !admin.password) {
      return res.status(400).json({
        message: 'Admin details are required (first_name, last_name, email, password)'
      });
    }

    const result = await organizationService.createOrganization({ name, phone, admin });

    return res.status(201).json({
      message: 'Organization and Admin created successfully',
      data: result
    });

  } catch (error) {
    if (error.message === 'INVALID_PHONE')
      return res.status(400).json({ message: 'Phone must be in format +1-XXX-XXX-XXXX' });

    if (error.message === 'ORG_EXISTS')
      return res.status(409).json({ message: `Organization with name "${req.body.name}" already exists in the database` });

    if (error.message === 'PHONE_EXISTS')
      return res.status(409).json({ message: `Phone number "${req.body.phone}" is already used by another organization` });

    if (error.message === 'EMAIL_EXISTS')
      return res.status(409).json({ message: `Email "${req.body.admin?.email}" already exists in the database` });

    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ✅ GET ORGANIZATION STATS (SUPER ONLY)
exports.getStats = async (req, res) => {
  try {
    if (req.user.role !== 'SUPER') {
      return res.status(403).json({ message: 'Access denied. Super Admin only.' });
    }

    const totalOrgs = await organizationService.getOrganizationCount();

    return res.status(200).json({
      message: 'Stats fetched successfully',
      data: { totalOrganizations: totalOrgs }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ✅ GET ALL ORGANIZATIONS (SUPER ONLY)
exports.getAllOrganizations = async (req, res) => {
  try {
    if (req.user.role !== 'SUPER') {
      return res.status(403).json({ message: 'Access denied. Super Admin only.' });
    }

    const { limit = 50, offset = 0 } = req.query;

    const result = await organizationService.getAllOrganizations(Number(limit), Number(offset));

    return res.status(200).json({
      message: 'Organizations fetched successfully',
      data: result
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ✅ GET ORGANIZATION BY ID (SUPER ONLY)
exports.getOrganizationById = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role === 'ADMIN') {
      if (String(req.user.org_id) !== id) {  // ✅ cast to string
        return res.status(403).json({
          message: 'Access denied. You can only view your own organization.'
        });
      }
    }
    const result = await organizationService.getOrganizationById(id);
    return res.status(200).json({
      message: 'Organization fetched successfully',
      data: result
    });
  } catch (error) {
    if (error.message === 'ORG_NOT_FOUND')
      return res.status(404).json({ message: 'Organization not found' });
    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ✅ UPDATE ORGANIZATION + BRANDING (SUPER & ADMIN)
exports.updateOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await organizationService.updateOrganization(id, req.body, req.user, req.file);
    return res.status(200).json(result);

  } catch (error) {
    if (error.message === 'UNAUTHORIZED')
      return res.status(403).json({ message: 'Unauthorized access' });

    if (error.message === 'FORBIDDEN')
      return res.status(403).json({ message: 'You can only update your own organization' });

    if (error.message === 'INVALID_PHONE')
      return res.status(400).json({ message: 'Phone must be in format +1-XXX-XXX-XXXX' });

    if (error.message === 'PHONE_EXISTS')
      return res.status(409).json({ message: `Phone number "${req.body.phone}" is already used by another organization` });

    if (error.message === 'ORG_NOT_FOUND')
      return res.status(404).json({ message: 'Organization not found' });

    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ✅ DELETE ORGANIZATION (SUPER ONLY)
exports.deleteOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await organizationService.deleteOrganization(id, req.user);
    return res.status(200).json(result);

  } catch (error) {
    if (error.message === 'UNAUTHORIZED')
      return res.status(403).json({ message: 'Only Super Admin can delete organizations' });

    if (error.message === 'ORG_NOT_FOUND')
      return res.status(404).json({ message: 'Organization not found' });

    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};