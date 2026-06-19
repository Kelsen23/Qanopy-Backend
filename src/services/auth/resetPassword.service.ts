import bcrypt from "bcrypt";

import HttpError from "../../utils/http/httpError.util.js";
import { makeUniqueJobId } from "../../utils/job/makeJobId.util.js";
import { securityNoticeHtml } from "../../utils/email/renderTemplate.util.js";
import publishSocketDisconnect from "../../utils/socket/publishSocketDisconnect.util.js";

import {
  getDeviceIp,
  handleExpiredUnverifiedUser,
  type DeviceInfo,
  removeResetPasswordAttempts,
} from "./auth.shared.js";

import prisma from "../../config/prisma.config.js";
import { getRedisCacheClient } from "../../config/redis.config.js";
import emailQueue from "../../queues/email.queue.js";

type ResetPasswordInput = {
  email: string;
  newPassword: string;
  deviceInfo: DeviceInfo;
};

const resetPassword = async ({
  email,
  newPassword,
  deviceInfo,
}: ResetPasswordInput) => {
  const foundUser = await prisma.user.findFirst({
    where: { email, isDeleted: false },
    select: {
      id: true,
      password: true,
      authProvider: true,
      isVerified: true,
      createdAt: true,
      email: true,
      username: true,
      resetPasswordOtpVerified: true,
    },
  });

  if (!foundUser) throw new HttpError("Invalid credentials", 404);

  if (await handleExpiredUnverifiedUser(foundUser)) {
    throw new HttpError(
      "Email verification expired, please sign up again",
      410,
    );
  }

  if (foundUser.authProvider !== "LOCAL")
    throw new HttpError("Password reset not applicable", 400);

  if (!foundUser.resetPasswordOtpVerified)
    throw new HttpError("OTP not verified", 400);

  const isSamePassword = await bcrypt.compare(
    newPassword,
    foundUser.password as string,
  );

  if (isSamePassword)
    throw new HttpError(
      "New password must be different from the old password",
      400,
    );

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const updatedUser = await prisma.user.update({
    where: { email },
    data: {
      password: hashedPassword,
      tokenVersion: { increment: 1 },
      resetPasswordOtp: null,
      resetPasswordOtpExpireAt: null,
      resetPasswordOtpResendAvailableAt: null,
      resetPasswordOtpVerified: null,
    },
  });

  await getRedisCacheClient().del(`auth:user:${updatedUser.id}`);
  await getRedisCacheClient().del(`user:${updatedUser.id}`);
  await removeResetPasswordAttempts(updatedUser.id);

  await publishSocketDisconnect(updatedUser.id);

  const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;
  const htmlContent = securityNoticeHtml(
    updatedUser.username,
    "Password reset completed",
    "Your password reset has been completed successfully.",
    deviceName,
    getDeviceIp(deviceInfo),
  );

  try {
    await emailQueue.add(
      "SEND_PASSWORD_RESET_COMPLETED_EMAIL",
      {
        email: updatedUser.email,
        userId: updatedUser.id,
        purpose: "PASSWORD_RESET_COMPLETED",
        subject: "Password Reset Completed",
        htmlContent,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeUniqueJobId(
          "email",
          "SEND_PASSWORD_RESET_COMPLETED_EMAIL",
          updatedUser.id,
          updatedUser.email,
        ),
      },
    );
  } catch (error) {
    console.error("[resetPassword] Failed to enqueue security notice", {
      userId: updatedUser.id,
      email: updatedUser.email,
      error,
    });
  }

  return { user: updatedUser };
};

export default resetPassword;
