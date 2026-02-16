exports.canManageProduct = (currentUser, product) => {
  if (currentUser.role === 'SUPER') return true;

  if (currentUser.role === 'ADMIN') {
    return (
      product.org_id !== null &&
      product.org_id === currentUser.org_id
    );
  }

  return false;
};