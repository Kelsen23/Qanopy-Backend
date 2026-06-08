import { vi } from "vitest";

type UserServiceModuleMockOverrides = Partial<{
  updateProfilePicture: ReturnType<typeof vi.fn>;
  deleteProfilePicture: ReturnType<typeof vi.fn>;
  updateProfile: ReturnType<typeof vi.fn>;
  deleteAccount: ReturnType<typeof vi.fn>;
  getNotificationSettings: ReturnType<typeof vi.fn>;
  updateNotificationSettings: ReturnType<typeof vi.fn>;
  markNotificationsAsSeen: ReturnType<typeof vi.fn>;
  sendEmailChange: ReturnType<typeof vi.fn>;
  resendEmailChange: ReturnType<typeof vi.fn>;
  verifyEmailChange: ReturnType<typeof vi.fn>;
}>;

export const createUserServiceModuleMock = (
  overrides: UserServiceModuleMockOverrides = {},
) => ({
  updateProfilePicture: overrides.updateProfilePicture ?? vi.fn(),
  deleteProfilePicture: overrides.deleteProfilePicture ?? vi.fn(),
  updateProfile: overrides.updateProfile ?? vi.fn(),
  deleteAccount: overrides.deleteAccount ?? vi.fn(),
  getNotificationSettings: overrides.getNotificationSettings ?? vi.fn(),
  updateNotificationSettings: overrides.updateNotificationSettings ?? vi.fn(),
  markNotificationsAsSeen: overrides.markNotificationsAsSeen ?? vi.fn(),
  sendEmailChange: overrides.sendEmailChange ?? vi.fn(),
  resendEmailChange: overrides.resendEmailChange ?? vi.fn(),
  verifyEmailChange: overrides.verifyEmailChange ?? vi.fn(),
});
