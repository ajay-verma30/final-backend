const db = require('../../config/db');

// 1. List Groups
exports.listGroups = async (req, res) => {
  try {
    const { role, org_id } = req.user;
    let groups;

    if (role === 'SUPER') {
      // Super admin can see all groups or filter by org_id in query params
      const targetOrgId = req.query.orgId;
      if (targetOrgId) {
        [groups] = await db.query('SELECT * FROM user_groups WHERE org_id = ?', [targetOrgId]);
      } else {
        [groups] = await db.query('SELECT * FROM user_groups');
      }
    } else {
      // Admin can only see their own org's groups
      [groups] = await db.query('SELECT * FROM user_groups WHERE org_id = ?', [org_id]);
    }

    res.status(200).json({
      message: "Groups fetched successfully",
      data: groups
    });
  } catch (error) {
    console.error("List Groups Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 2. Create group
exports.createGroup = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Frontend Body se data lo (org_id bhi)
    const { name, description, userIds, org_id: bodyOrgId } = req.body;
    
    // 2. Auth Middleware (Token) se user info lo
    const { org_id: tokenOrgId, id: creatorId, role } = req.user;

    // 3. LOGIC: Agar SUPER hai toh body wala org_id use karo, warna token wala
    const finalOrgId = (role === 'SUPER') ? bodyOrgId : tokenOrgId;

    if (!name) {
      return res.status(400).json({ message: "Group name is required" });
    }

    // CHECK: Agar finalOrgId abhi bhi null hai, toh error throw karo
    if (!finalOrgId) {
      return res.status(400).json({ message: "Organization ID is missing" });
    }

    // Yahan finalOrgId pass karo
    const [groupResult] = await connection.query(
      `INSERT INTO user_groups (org_id, name, description, created_by) VALUES (?, ?, ?, ?)`,
      [finalOrgId, name, description, creatorId]
    );

    const groupId = groupResult.insertId;

    // 2. Members insert logic (same as before)
    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      const memberData = userIds.map(uId => [uId, groupId]);
      await connection.query(
        `INSERT INTO user_group_members (user_id, group_id) VALUES ?`,
        [memberData]
      );
    }

    await connection.commit(); 
    res.status(201).json({
      message: "Group created and members added successfully",
      data: { id: groupId, name }
    });
  } catch (error) {
    await connection.rollback(); 
    console.error("Create Group Error:", error);
    // ... rest of error handling
  } finally {
    connection.release();
  }
};

// 3. Add Members to Group
exports.addUsersToGroup = async (req, res) => {
  try {
    const { groupId, userIds } = req.body;
    const { org_id, role } = req.user;

    if (!groupId || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "Invalid group ID or user IDs" });
    }

    // Security Check: Ensure group belongs to admin's org
    if (role === 'ADMIN') {
      const [group] = await db.query('SELECT id FROM user_groups WHERE id = ? AND org_id = ?', [groupId, org_id]);
      if (group.length === 0) {
        return res.status(403).json({ message: "Unauthorized: Group does not belong to your organization" });
      }
    }

    await groupService.addUsersToGroup(groupId, userIds);

    res.status(200).json({ message: "Users added to group successfully" });
  } catch (error) {
    console.error("Add Members Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// 4. Get Group Members
exports.getGroupMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const { org_id, role } = req.user;

    // Security Check
    if (role === 'ADMIN') {
      const [group] = await db.query('SELECT id FROM user_groups WHERE id = ? AND org_id = ?', [id, org_id]);
      if (group.length === 0) {
        return res.status(403).json({ message: "Unauthorized" });
      }
    }

    const [members] = await db.query(`
      SELECT u.id, u.first_name, u.last_name, u.email, ugm.joined_at
      FROM users u
      JOIN user_group_members ugm ON u.id = ugm.user_id
      WHERE ugm.group_id = ? AND u.deleted_at IS NULL
    `, [id]);

    res.status(200).json({
      message: "Members fetched successfully",
      data: members
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 5. Delete Group
exports.deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { org_id, role } = req.user;

    // Security Check
    if (role === 'ADMIN') {
      const [group] = await db.query('SELECT id FROM user_groups WHERE id = ? AND org_id = ?', [id, org_id]);
      if (group.length === 0) {
        return res.status(403).json({ message: "Unauthorized to delete this group" });
      }
    }

    await db.query('DELETE FROM user_groups WHERE id = ?', [id]);

    res.status(200).json({ message: "Group deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// 6. Get Single Group Details (By ID)
exports.getGroupById = async (req, res) => {
  try {
    const { id } = req.params;
    const { org_id, role } = req.user;

    // Fetch group basic info
    const [group] = await db.query('SELECT * FROM user_groups WHERE id = ?', [id]);

    if (group.length === 0) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Security Check: ADMIN sirf apni org ka group dekh sake
    if (role === 'ADMIN' && group[0].org_id !== org_id) {
      return res.status(403).json({ message: "Unauthorized access to this group" });
    }

    res.status(200).json({
      message: "Group details fetched successfully",
      data: group[0]
    });
  } catch (error) {
    console.error("Get Group Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// 7. Remove Single Member from Group
exports.removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params; // id = groupId, userId = userId
    const { org_id, role } = req.user;

    // Security Check: Pehle dekho group admin ka hai ya nahi
    if (role === 'ADMIN') {
      const [group] = await db.query('SELECT id FROM user_groups WHERE id = ? AND org_id = ?', [id, org_id]);
      if (group.length === 0) {
        return res.status(403).json({ message: "Unauthorized: You cannot manage this group" });
      }
    }
    const [result] = await db.query(
      'DELETE FROM user_group_members WHERE group_id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Member not found in this group" });
    }

    res.status(200).json({ message: "Member removed from group successfully" });
  } catch (error) {
    console.error("Remove Member Error:", error);
    res.status(500).json({ message: error.message });
  }
};



// Naya Method: Existing group mein members add karna
exports.addMembersToExistingGroup = async (req, res) => {
  try {
    const { id } = req.params; // URL se Group ID
    const { userIds } = req.body; // Body se User IDs array [1, 2, 3]
    const { org_id, role } = req.user;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "No users selected to add" });
    }

    // 1. Security Check: ADMIN sirf apni org ke group mein add kar sake
    if (role === 'ADMIN') {
      const [group] = await db.query('SELECT id FROM user_groups WHERE id = ? AND org_id = ?', [id, org_id]);
      if (group.length === 0) {
        return res.status(403).json({ message: "Unauthorized: You cannot manage this group" });
      }
    }

    // 2. Insert Members (Duplicate entry handle karne ke liye INSERT IGNORE)
    // Isse agar koi user pehle se group mein hai toh error nahi aayega
    const memberData = userIds.map(uId => [uId, id]);
    
    await db.query(
      `INSERT IGNORE INTO user_group_members (user_id, group_id) VALUES ?`,
      [memberData]
    );

    res.status(200).json({ 
      message: `${userIds.length} members processed successfully`,
      data: { groupId: id }
    });

  } catch (error) {
    console.error("Add Members Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};