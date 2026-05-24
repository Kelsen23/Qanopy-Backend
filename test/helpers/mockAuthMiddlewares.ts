const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();

export const mockAuthMiddlewares = {
  default: passThrough,
  requireLoggedOut: passThrough,
  isVerified: passThrough,
  requireActiveUser: passThrough,
  isAdmin: passThrough,
};
