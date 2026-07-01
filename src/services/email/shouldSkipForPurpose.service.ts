import { isExpiredUnverifiedLocalUser } from "../auth/unverifiedAccountCleanup.service.js";

type EmailJobPurpose =
  | "VERIFY_EMAIL"
  | "RESET_PASSWORD"
  | "CHANGE_EMAIL"
  | "PASSWORD_RESET_COMPLETED"
  | "PASSWORD_CHANGED"
  | "EMAIL_CHANGED"
  | "BAN_TEMP"
  | "BAN_PERM";

type EmailWorkerUser = {
  id: string;
  email: string;
  createdAt: Date;
  authProvider: "LOCAL" | "GOOGLE" | "GITHUB";
  isVerified: boolean;
  isDeleted: boolean;
  otpExpireAt: Date | null;
  resetPasswordOtpExpireAt: Date | null;
  emailChangePendingEmail: string | null;
  emailChangeOtpExpireAt: Date | null;
  emailChangeOtp: string | null;
};

const shouldSkipForPurpose = async (
  user: EmailWorkerUser,
  purpose?: EmailJobPurpose,
  email?: string,
  otpHash?: string,
) => {
  if (user.isDeleted) return true;

  if (
    purpose === "PASSWORD_RESET_COMPLETED" ||
    purpose === "PASSWORD_CHANGED" ||
    purpose === "EMAIL_CHANGED"
  ) {
    return false;
  }

  if (purpose === "VERIFY_EMAIL") {
    if (user.authProvider !== "LOCAL") return true;

    return (
      user.isVerified ||
      isExpiredUnverifiedLocalUser(user) ||
      !user.otpExpireAt ||
      user.otpExpireAt < new Date(Date.now())
    );
  }

  if (purpose === "RESET_PASSWORD") {
    if (user.authProvider !== "LOCAL") return true;

    return (
      !user.resetPasswordOtpExpireAt ||
      user.resetPasswordOtpExpireAt < new Date(Date.now())
    );
  }

  if (purpose === "CHANGE_EMAIL") {
    if (
      !user.emailChangePendingEmail ||
      !user.emailChangeOtpExpireAt ||
      !user.emailChangeOtp
    ) {
      return true;
    }

    if (user.emailChangePendingEmail !== email) {
      return true;
    }

    if (user.emailChangeOtpExpireAt < new Date(Date.now())) {
      return true;
    }

    return otpHash !== user.emailChangeOtp;
  }

  return false;
};

export default shouldSkipForPurpose;

export type { EmailJobPurpose, EmailWorkerUser };
