exports.canManageUser = (currentUser, targetUser) => {
  if (currentUser.role === 'SUPER') return true;

  if (currentUser.role === 'ADMIN') {
    return currentUser.org_id === targetUser.org_id;
  }

  if (currentUser.role === 'ENDUSER') {
    return currentUser.id === targetUser.id;
  }

  return false;
};