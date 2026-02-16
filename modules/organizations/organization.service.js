const pool = require('../../config/db');
const bcrypt = require('bcrypt');

function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function validatePhone(phone) {
  const regex = /^\+1-[0-9]{3}-[0-9]{3}-[0-9]{4}$/;
  return regex.test(phone);
}

exports.createOrganization = async ({ name, phone, admin }) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (phone && !validatePhone(phone)) {
      throw new Error('INVALID_PHONE');
    }
    const [existingName] = await connection.query(
      'SELECT id FROM organizations WHERE name = ? AND deleted_at IS NULL',
      [name]
    );

    if (existingName.length > 0) {
      throw new Error('ORG_EXISTS');
    }
    let slug = generateSlug(name);

    const [existingSlug] = await connection.query(
      'SELECT id FROM organizations WHERE slug = ?',
      [slug]
    );

    if (existingSlug.length > 0) {
      slug = `${slug}-${Date.now()}`;
    }

    const [orgResult] = await connection.query(
      `INSERT INTO organizations (name, slug, phone)
       VALUES (?, ?, ?)`,
      [name, slug, phone || null]
    );

    const orgId = orgResult.insertId;

    const [existingEmail] = await connection.query(
      'SELECT id FROM users WHERE email = ? AND deleted_at IS NULL',
      [admin.email]
    );

    if (existingEmail.length > 0) {
      throw new Error('EMAIL_EXISTS');
    }

    const hashedPassword = await bcrypt.hash(admin.password, 10);

    const [userResult] = await connection.query(
      `INSERT INTO users 
      (org_id, first_name, last_name, email, password, role, is_active, email_verified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        orgId,
        admin.first_name,
        admin.last_name,
        admin.email,
        hashedPassword,
        'ADMIN',
        0
      ]
    );

    await connection.commit();

    return {
      organization_id: orgId,
      organization_slug: slug,
      admin_user_id: userResult.insertId
    };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};