import { vi } from "vitest";

type AuthServiceModuleMockOverrides = Partial<{
  register: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  registerOrLogin: ReturnType<typeof vi.fn>;
  verifyEmail: ReturnType<typeof vi.fn>;
  resendVerificationEmail: ReturnType<typeof vi.fn>;
  sendResetPasswordEmail: ReturnType<typeof vi.fn>;
  resendResetPasswordEmail: ReturnType<typeof vi.fn>;
  verifyResetPasswordOtp: ReturnType<typeof vi.fn>;
  resetPassword: ReturnType<typeof vi.fn>;
  changePassword: ReturnType<typeof vi.fn>;
  isAuth: ReturnType<typeof vi.fn>;
}>;

export const createAuthServiceModuleMock = (
  overrides: AuthServiceModuleMockOverrides = {},
) => ({
  register: overrides.register ?? vi.fn(),
  login: overrides.login ?? vi.fn(),
  registerOrLogin: overrides.registerOrLogin ?? vi.fn(),
  verifyEmail: overrides.verifyEmail ?? vi.fn(),
  resendVerificationEmail: overrides.resendVerificationEmail ?? vi.fn(),
  sendResetPasswordEmail: overrides.sendResetPasswordEmail ?? vi.fn(),
  resendResetPasswordEmail: overrides.resendResetPasswordEmail ?? vi.fn(),
  verifyResetPasswordOtp: overrides.verifyResetPasswordOtp ?? vi.fn(),
  resetPassword: overrides.resetPassword ?? vi.fn(),
  changePassword: overrides.changePassword ?? vi.fn(),
  isAuth: overrides.isAuth ?? vi.fn(),
});
