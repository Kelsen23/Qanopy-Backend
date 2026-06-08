type MockAuthUser = {
  id: string;
  tokenVersion: number;
  status: string;
  isVerified: boolean;
  role: string;
  isDeleted: boolean;
};

type MockAuthError = {
  status: number;
  message: string;
};

type MockAuthContextState = {
  authenticated: boolean;
  authError: MockAuthError;
  user: MockAuthUser;
};

const defaultUser: MockAuthUser = {
  id: "user_1",
  tokenVersion: 0,
  status: "ACTIVE",
  isVerified: true,
  role: "USER",
  isDeleted: false,
};

export const mockAuthContextState: MockAuthContextState = {
  authenticated: true,
  authError: {
    status: 400,
    message: "Not authenticated, no token",
  },
  user: { ...defaultUser },
};

export const resetMockAuthContextState = () => {
  mockAuthContextState.authenticated = true;
  mockAuthContextState.authError = {
    status: 400,
    message: "Not authenticated, no token",
  };
  mockAuthContextState.user = { ...defaultUser };
};

export const createMockAuthMiddlewareModule = () => ({
  default: (req: any, res: any, next: () => void) => {
    if (!mockAuthContextState.authenticated) {
      return res
        .status(mockAuthContextState.authError.status)
        .json({ message: mockAuthContextState.authError.message });
    }

    if (mockAuthContextState.user.isDeleted) {
      return res.status(403).json({ message: "User not active" });
    }

    req.user = { ...mockAuthContextState.user };
    return next();
  },
  requireLoggedOut: (_req: any, res: any, next: () => void) => {
    if (mockAuthContextState.authenticated) {
      return res
        .status(400)
        .json({ message: "This action is only available when logged out" });
    }

    return next();
  },
  isVerified: (req: any, res: any, next: () => void) => {
    if (!req.user?.isVerified) {
      return res.status(403).json({ message: "User not verified" });
    }

    return next();
  },
  requireActiveUser: (req: any, res: any, next: () => void) => {
    if (req.user?.status !== "ACTIVE") {
      return res.status(403).json({ message: "User not active" });
    }

    return next();
  },
  isAdmin: (req: any, res: any, next: () => void) => {
    if (req.user?.role !== "ADMIN") {
      return res
        .status(403)
        .json({ message: "User forbidden accessing this route" });
    }

    return next();
  },
});
