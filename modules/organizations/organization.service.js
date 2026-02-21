const pool = require('../../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const emailService = require('../../src/services/email.service');

// ✅ GENERATE SLUG FROM NAME
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ✅ VALIDATE PHONE FORMAT
function validatePhone(phone) {
  const regex = /^\+1-[0-9]{3}-[0-9]{3}-[0-9]{4}$/;
  return regex.test(phone);
}

// ✅ GENERATE PASSWORD RESET TOKEN
function generatePasswordResetToken(userId) {
  return jwt.sign(
    { userId, type: 'password-reset' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// ✅ CREATE ORGANIZATION WITH EMAIL NOTIFICATION
exports.createOrganization = async ({ name, phone, admin }) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1️⃣ VALIDATE PHONE FORMAT
    if (phone && !validatePhone(phone)) {
      throw new Error('INVALID_PHONE');
    }

    // 2️⃣ CHECK IF ORG NAME ALREADY EXISTS
    const [existingName] = await connection.query(
      'SELECT id FROM organizations WHERE name = ? AND deleted_at IS NULL',
      [name]
    );
    if (existingName.length > 0) throw new Error('ORG_EXISTS');

    // 3️⃣ CHECK IF PHONE ALREADY USED BY ANOTHER ORG
    if (phone) {
      const [existingPhone] = await connection.query(
        'SELECT id FROM organizations WHERE phone = ? AND deleted_at IS NULL',
        [phone]
      );
      if (existingPhone.length > 0) throw new Error('PHONE_EXISTS');
    }

    // 4️⃣ GENERATE AND VALIDATE SLUG
    let slug = generateSlug(name);
    const [existingSlug] = await connection.query(
      'SELECT id FROM organizations WHERE slug = ?',
      [slug]
    );
    if (existingSlug.length > 0) {
      slug = `${slug}-${Date.now()}`;
    }

    // 5️⃣ CREATE ORGANIZATION
    const [orgResult] = await connection.query(
      `INSERT INTO organizations (name, slug, phone) VALUES (?, ?, ?)`,
      [name, slug, phone || null]
    );
    const orgId = orgResult.insertId;

    // 6️⃣ CHECK IF EMAIL ALREADY EXISTS IN USERS TABLE
    const [existingEmail] = await connection.query(
      'SELECT id FROM users WHERE email = ? AND deleted_at IS NULL',
      [admin.email]
    );
    if (existingEmail.length > 0) throw new Error('EMAIL_EXISTS');

    // 7️⃣ HASH PASSWORD
    const hashedPassword = await bcrypt.hash(admin.password, 10);

    // 8️⃣ CREATE ADMIN USER
    const [userResult] = await connection.query(
      `INSERT INTO users 
      (org_id, first_name, last_name, email, password, role, is_active, email_verified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [orgId, admin.first_name, admin.last_name, admin.email, hashedPassword, 'ADMIN', 0]
    );
    const userId = userResult.insertId;

    // 9️⃣ COMMIT TRANSACTION
    await connection.commit();

    // 🔟 SEND ORGANIZATION CREATION EMAIL (non-blocking — failure won't rollback)
    try {
      const resetToken = generatePasswordResetToken(userId);
      const resetLink = `${process.env.FRONTEND_URL}/set-password?token=${resetToken}`;
      await emailService.sendOrganizationCreatedEmail(
        admin.email, admin.first_name, name, slug, resetLink
      );
      console.log(`✅ Organization creation email sent to ${admin.email}`);
    } catch (emailError) {
      console.error(`⚠️ Failed to send organization creation email: ${emailError.message}`);
    }

    return {
      organization_id: orgId,
      organization_slug: slug,
      admin_user_id: userId,
      email_sent: true
    };

  } catch (error) {
    await connection.rollback();
    console.error("Create Organization Error:", error.message);
    throw error;
  } finally {
    connection.release();
  }
};

// ✅ GET ORGANIZATION COUNT
exports.getOrganizationCount = async () => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) as total FROM organizations WHERE deleted_at IS NULL');
    return rows[0].total;
  } catch (error) {
    console.error("SQL Error in getOrganizationCount:", error.message);
    throw new Error('DATABASE_ERROR');
  }
};

// ✅ GET ORGANIZATION BY ID (with branding details)
exports.getOrganizationById = async (orgId) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
        o.id, o.name, o.slug, o.phone, o.is_active, o.created_at, o.updated_at,
        b.logo_url, b.favicon_url, b.primary_color, b.secondary_color, 
        b.sidebar_color, b.navbar_color, b.font_family
      FROM organizations o
      LEFT JOIN organization_branding b ON o.id = b.org_id
      WHERE o.id = ? AND o.deleted_at IS NULL`,
      [orgId]
    );
    if (rows.length === 0) throw new Error('ORG_NOT_FOUND');
    return rows[0];
  } catch (error) {
    console.error("Get Organization Error:", error.message);
    throw error;
  }
};

// ✅ GET ORGANIZATION BY SLUG
exports.getOrganizationBySlug = async (slug) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, slug, phone, created_at, updated_at
       FROM organizations WHERE slug = ? AND deleted_at IS NULL`,
      [slug]
    );
    if (rows.length === 0) throw new Error('ORG_NOT_FOUND');
    return rows[0];
  } catch (error) {
    console.error("Get Organization by Slug Error:", error.message);
    throw error;
  }
};

// ✅ UPDATE ORGANIZATION + BRANDING (SUPER & ADMIN)
exports.updateOrganization = async (orgId, data, currentUser, file) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 🔐 Role check
    if (!['SUPER', 'ADMIN'].includes(currentUser.role)) throw new Error('UNAUTHORIZED');

    // 🛡 ADMIN can only update their own org
    if (currentUser.role === 'ADMIN' && currentUser.org_id !== Number(orgId)) {
      throw new Error('FORBIDDEN');
    }

    // 🔍 Check org exists
    const [existing] = await connection.query(
      'SELECT id FROM organizations WHERE id = ? AND deleted_at IS NULL',
      [orgId]
    );
    if (existing.length === 0) throw new Error('ORG_NOT_FOUND');

    const { name, phone, is_active } = data;

    // Validate phone format
    if (phone && !validatePhone(phone)) throw new Error('INVALID_PHONE');

    // Check phone not already used by a DIFFERENT org
    if (phone) {
      const [phoneConflict] = await connection.query(
        'SELECT id FROM organizations WHERE phone = ? AND id != ? AND deleted_at IS NULL',
        [phone, orgId]
      );
      if (phoneConflict.length > 0) throw new Error('PHONE_EXISTS');
    }

    // Update organization fields
    let updateFields = [];
    let updateParams = [];
    if (name)                             { updateFields.push('name = ?');      updateParams.push(name); }
    if (phone)                            { updateFields.push('phone = ?');     updateParams.push(phone); }
    if (typeof is_active !== 'undefined') {
      updateFields.push('is_active = ?');
      updateParams.push(is_active === 'true' || is_active === 1 ? 1 : 0);
    }

    if (updateFields.length > 0) {
      updateFields.push('updated_at = NOW()');
      await connection.query(
        `UPDATE organizations SET ${updateFields.join(', ')} WHERE id = ?`,
        [...updateParams, orgId]
      );
    }

    // Update branding
    const branding = typeof data.branding === 'string'
      ? JSON.parse(data.branding)
      : (data.branding || {});

    const finalLogoUrl    = file ? file.path : (branding.logo_url    || data.logo_url    || null);
    const favicon_url     = branding.favicon_url     || data.favicon_url     || null;
    const primary_color   = branding.primary_color   || data.primary_color   || null;
    const secondary_color = branding.secondary_color || data.secondary_color || null;
    const sidebar_color   = branding.sidebar_color   || data.sidebar_color   || null;
    const navbar_color    = branding.navbar_color    || data.navbar_color    || null;
    const font_family     = branding.font_family     || data.font_family     || null;

    const [existingBranding] = await connection.query(
      'SELECT id FROM organization_branding WHERE org_id = ?', [orgId]
    );

    if (existingBranding.length > 0) {
      await connection.query(
        `UPDATE organization_branding SET
          logo_url = IFNULL(?, logo_url),
          favicon_url = IFNULL(?, favicon_url),
          primary_color = IFNULL(?, primary_color),
          secondary_color = IFNULL(?, secondary_color),
          sidebar_color = IFNULL(?, sidebar_color),
          navbar_color = IFNULL(?, navbar_color),
          font_family = IFNULL(?, font_family),
          updated_at = NOW()
        WHERE org_id = ?`,
        [finalLogoUrl, favicon_url, primary_color, secondary_color, sidebar_color, navbar_color, font_family, orgId]
      );
    } else {
      await connection.query(
        `INSERT INTO organization_branding
         (org_id, logo_url, favicon_url, primary_color, secondary_color, sidebar_color, navbar_color, font_family)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orgId, finalLogoUrl, favicon_url, primary_color, secondary_color, sidebar_color, navbar_color, font_family]
      );
    }

    await connection.commit();

    return {
      success: true,
      message: 'Organization and branding updated successfully',
      logo_url: finalLogoUrl
    };

  } catch (error) {
    await connection.rollback();
    console.error("Update Organization Error:", error.message);
    throw error;
  } finally {
    connection.release();
  }
};

// ✅ DELETE ORGANIZATION (SUPER ONLY - soft delete)
exports.deleteOrganization = async (orgId, currentUser) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (currentUser.role !== 'SUPER') throw new Error('UNAUTHORIZED');

    const [existing] = await connection.query(
      'SELECT id FROM organizations WHERE id = ? AND deleted_at IS NULL', [orgId]
    );
    if (existing.length === 0) throw new Error('ORG_NOT_FOUND');

    await connection.query(
      'UPDATE organizations SET deleted_at = NOW(), is_active = 0 WHERE id = ?', [orgId]
    );
    await connection.query(
      'UPDATE users SET deleted_at = NOW() WHERE org_id = ?', [orgId]
    );

    await connection.commit();

    return { success: true, message: 'Organization soft deleted successfully' };

  } catch (error) {
    await connection.rollback();
    console.error("Delete Organization Error:", error.message);
    throw error;
  } finally {
    connection.release();
  }
};

// ✅ GET ALL ORGANIZATIONS
exports.getAllOrganizations = async (limit = 50, offset = 0) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, slug, phone, created_at, updated_at
       FROM organizations 
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM organizations WHERE deleted_at IS NULL'
    );
    return { organizations: rows, total: countResult[0].total, limit, offset };
  } catch (error) {
    console.error("Get All Organizations Error:", error.message);
    throw error;
  }
};