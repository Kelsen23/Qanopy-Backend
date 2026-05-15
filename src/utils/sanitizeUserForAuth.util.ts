const sanitizeUserForAuth = (user: any) => ({
  id: user.id,
  tokenVersion: user.tokenVersion ?? 0,
  status: user.status,
  isVerified: user.isVerified,
  role: user.role,
  isDeleted: user.isDeleted ?? false,
});

export default sanitizeUserForAuth;
