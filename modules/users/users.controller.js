const db = require("../../config/db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { sendPasswordSetupEmail } = require("../../src/services/email.service");
const { canManageUser } = require("../../utils/permission");

// ================= CREATE USER =================
exports.createUser = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const currentUser = req.user;
    const { first_name, last_name, email, role, org_id } = req.body;

    await connection.beginTransaction();

    let targetOrgId = org_id;

    if (currentUser.role === "ADMIN") {
      if (role === "SUPER") {
        return res.status(403).json({ message: "Admin cannot create SUPER user" });
      }
      targetOrgId = currentUser.org_id; // ADMIN force to their org
    } else if (currentUser.role === "SUPER") {
      targetOrgId = (role === "SUPER") ? null : org_id; // SUPER can choose
    }

    if (currentUser.role === "ENDUSER") {
      return res.status(403).json({ message: "Not allowed to create users" });
    }

    if (targetOrgId) {
      const [org] = await connection.query(
        "SELECT id FROM organizations WHERE id = ? AND deleted_at IS NULL",
        [targetOrgId]
      );
      if (!org.length) return res.status(400).json({ message: "Invalid organization" });
    }

    const [existingUser] = await connection.query(
      "SELECT id FROM users WHERE email = ? AND deleted_at IS NULL",
      [email]
    );
    if (existingUser.length) return res.status(409).json({ message: "Email already exists" });

    const tempPassword = crypto.randomBytes(10).toString("hex");
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const [result] = await connection.query(
      `INSERT INTO users (org_id, first_name, last_name, email, password, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [targetOrgId || null, first_name, last_name, email, hashedPassword, role]
    );

    const userId = result.insertId;
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await connection.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
      [userId, tokenHash, expiresAt]
    );

    await connection.commit();

    const resetLink = `${process.env.FRONTEND_URL}/set-password?token=${rawToken}`;
    await sendPasswordSetupEmail(email, first_name, resetLink);

    return res.status(201).json({ message: "User created. Password setup email sent." });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};


// ================= CHANGE PASSWORD (Self) =================
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id; // Logged-in user ki ID
    const { currentPassword, newPassword } = req.body;

    // 1. Fetch user from DB
    const [users] = await db.query(
      "SELECT id, password FROM users WHERE id = ? AND deleted_at IS NULL",
      [userId]
    );

    if (!users.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = users[0];

    // 2. Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password galat hai" });
    }

    // 3. Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);

    // 4. Update DB
    await db.query("UPDATE users SET password = ? WHERE id = ?", [
      hashedNewPassword,
      userId,
    ]);

    return res.json({ message: "Password kamyabi se badal diya gaya hai" });
  } catch (err) {
    console.error("CHANGE PASSWORD ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


// ================= GET MY PROFILE =================
exports.myProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT 
        u.id, u.first_name, u.last_name, u.email, u.phone AS user_phone, 
        u.role, u.profile_pic_url, u.is_active AS user_status, 
        u.email_verified_at, u.created_at AS member_since,
        u.org_id,
        o.name AS org_name, o.slug AS org_slug, o.phone AS org_phone, 
        o.is_active AS org_status,
        -- Addresses ko ek JSON array mein convert kar rahe hain
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', a.id,
              'address_line1', a.address_line1,
              'address_line2', a.address_line2,
              'city', a.city,
              'state', a.state,
              'zip', a.zip,
              'country', a.country,
              'address_type', a.address_type,
              'is_default', a.is_default
            )
          )
          FROM addresses a 
          WHERE a.user_id = u.id
        ) AS saved_addresses
      FROM users u
      LEFT JOIN organizations o ON u.org_id = o.id
      WHERE u.id = ? AND u.deleted_at IS NULL
    `;

    const [users] = await db.query(query, [userId]);
    
    if (!users.length) return res.status(404).json({ message: "User not found" });

    // MySQL JSON string bhej sakta hai, isliye agar zaroorat ho toh parse kar lo
    const userData = users[0];
    if (typeof userData.saved_addresses === 'string') {
      userData.saved_addresses = JSON.parse(userData.saved_addresses);
    }

    return res.json(userData);
  } catch (err) {
    console.error("MY PROFILE ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ================= GET USERS WITH ORG NAME =================
exports.getUsers = async (req, res) => {
  try {
    const currentUser = req.user;
    const { orgId } = req.query; // Frontend se orgId query param uthao

    let query = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.org_id, o.name AS org_name 
      FROM users u
      LEFT JOIN organizations o ON u.org_id = o.id
      WHERE u.deleted_at IS NULL
    `;
    
    let params = [];

    if (currentUser.role === "SUPER") {
      // SUPER agar orgId bhej raha hai toh filter karo, warna sab dikhao
      if (orgId) {
        query += " AND u.org_id = ?";
        params.push(orgId);
      }
    } else if (currentUser.role === "ADMIN") {
      query += " AND u.org_id = ?";
      params.push(currentUser.org_id);
    } else {
      query += " AND u.id = ?";
      params.push(currentUser.id);
    }

    const [users] = await db.query(query, params);
    return res.json(users);
  } catch (err) {
    console.error("GET USERS ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ================= UPDATE USER  =================
exports.updateUser = async (req, res) => {
  try {
    const currentUser = req.user;
    const { id } = req.params;
    const { first_name, last_name } = req.body;

    const [users] = await db.query("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL", [id]);
    if (!users.length) return res.status(404).json({ message: "User not found" });

    const targetUser = users[0];

    // Check permissions
    if (!canManageUser(currentUser, targetUser)) {
      return res.status(403).json({ message: "Not authorized to update this user" });
    }

    await db.query(
      "UPDATE users SET first_name = ?, last_name = ? WHERE id = ?",
      [first_name, last_name, id]
    );

    return res.json({ message: "User updated successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};


// ================= UPDATE MY PROFILE (Self) =================
exports.updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { phone, profile_pic_url } = req.body;

    await db.query(
      "UPDATE users SET phone = ?, profile_pic_url = ? WHERE id = ?",
      [phone, profile_pic_url, userId]
    );

    return res.json({ message: "Profile updated successfully!" });
  } catch (err) {
    console.error("UPDATE PROFILE ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


// ================= ADD NEW ADDRESS =================
exports.addAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { address_line1, address_line2, city, state, country, zip, is_default, address_type } = req.body;
    if (is_default) {
      await db.query("UPDATE addresses SET is_default = 0 WHERE user_id = ?", [userId]);
    }
    await db.query(
      `INSERT INTO addresses (user_id, address_line1, address_line2, city, state, country, zip, address_type, is_default) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, address_line1, address_line2, city, state, country, zip, address_type || 'HOME', is_default || 0]
    );
    return res.status(201).json({ message: "Address saved successfully!" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error adding address" });
  }
};


// ================= UPDATE ADDRESS =================
exports.updateAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    const { 
      address_line1, address_line2, city, state, 
      country, zip, is_default, address_type 
    } = req.body;

    // 1. Pehle check karo ki address isi user ka hai ya nahi
    const [existing] = await db.query(
      "SELECT id FROM addresses WHERE id = ? AND user_id = ?", 
      [addressId, userId]
    );
    if (!existing.length) return res.status(404).json({ message: "Address not found" });

    // 2. Agar default toggle on kiya hai, toh baki sabko reset karo
    if (is_default) {
      await db.query("UPDATE addresses SET is_default = 0 WHERE user_id = ?", [userId]);
    }

    // 3. Update query
    const updateQuery = `
      UPDATE addresses 
      SET address_line1 = ?, address_line2 = ?, city = ?, 
          state = ?, country = ?, zip = ?, 
          address_type = ?, is_default = ?
      WHERE id = ? AND user_id = ?
    `;

    await db.query(updateQuery, [
      address_line1, address_line2, city, state, 
      country, zip, address_type, is_default, 
      addressId, userId
    ]);

    return res.json({ message: "Address updated successfully!" });
  } catch (err) {
    console.error("UPDATE ADDRESS ERROR:", err);
    return res.status(500).json({ message: "Error updating address" });
  }
};

// ================= DELETE ADDRESS =================
exports.deleteAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;

    // Sirf wahi address delete ho jo is user ka hai
    const [result] = await db.query(
      "DELETE FROM addresses WHERE id = ? AND user_id = ?", 
      [addressId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Address not found or unauthorized" });
    }

    return res.json({ message: "Address deleted successfully!" });
  } catch (err) {
    console.error("DELETE ADDRESS ERROR:", err);
    return res.status(500).json({ message: "Error deleting address" });
  }
};

// ================= DELETE USER =================
exports.deleteUser = async (req, res) => {
  try {
    const currentUser = req.user;
    const { id } = req.params;

    const [users] = await db.query("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL", [id]);
    if (!users.length) return res.status(404).json({ message: "User not found" });

    const targetUser = users[0];

    if (currentUser.id === targetUser.id && currentUser.role === "SUPER") {
      return res.status(400).json({ message: "SUPER cannot delete himself" });
    }

    // ADMIN constraint
    if (currentUser.role === "ADMIN" && targetUser.org_id !== currentUser.org_id) {
      return res.status(403).json({ message: "Not authorized to delete users from other organizations" });
    }

    if (!canManageUser(currentUser, targetUser)) {
      return res.status(403).json({ message: "Not authorized to delete this user" });
    }

    await db.query("UPDATE users SET deleted_at = NOW() WHERE id = ?", [id]);
    return res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};