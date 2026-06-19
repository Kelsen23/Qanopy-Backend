import bcrypt from "bcrypt";

import HttpError from "../../utils/http/httpError.util.js";
import { makeUniqueJobId } from "../../utils/job/makeJobId.util.js";
import { securityNoticeHtml } from "../../utils/email/renderTemplate.util.js";
import publishSocketDisconnect from "../../utils/socket/publishSocketDisconnect.util.js";

import {
  cacheAuthUser,
  cacheUser,
  getDeviceIp,
  removeResetPasswordAttempts,
  type DeviceInfo,
} from "./auth.shared.js";

import prisma from "../../config/prisma.config.js";
import emailQueue from "../../queues/email.queue.js";

type ChangePasswordInput = {
  userId: string;
  currentPassword: string;
  newPassword: string;
  deviceInfo: DeviceInfo;
};

const changePassword = async ({
  userId,
  currentPassword,
  newPassword,
  deviceInfo,
}: ChangePasswordInput) => {
  const foundUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      username: true,
      password: true,
      authProvider: true,
    },
  });

  if (!foundUser) throw new HttpError("Invalid credentials", 404);

  if (foundUser.authProvider !== "LOCAL")
    throw new HttpError("Password change not applicable", 400);

  if (!foundUser.password)
    throw new HttpError("Password change not applicable", 400);

  const isCurrentPasswordValid = await bcrypt.compare(
    currentPassword,
    foundUser.password,
  );

  if (!isCurrentPasswordValid)
    throw new HttpError("Invalid current password", 401);

  const isSamePassword = await bcrypt.compare(newPassword, foundUser.password);
  if (isSamePassword)
    throw new HttpError(
      "New password must be different from the old password",
      400,
    );

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashedPassword,
      tokenVersion: { increment: 1 },
      resetPasswordOtp: null,
      resetPasswordOtpVerified: null,
      resetPasswordOtpResendAvailableAt: null,
      resetPasswordOtpExpireAt: null,
    },
  });

  await removeResetPasswordAttempts(updatedUser.id);
  await cacheAuthUser(updatedUser);
  await cacheUser(updatedUser);
  await publishSocketDisconnect(updatedUser.id);

  const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;
  const htmlContent = securityNoticeHtml(
    foundUser.username,
    "Password changed",
    "Your password has been changed successfully.",
    deviceName,
    getDeviceIp(deviceInfo),
  );

  try {
    await emailQueue.add(
      "SEND_PASSWORD_CHANGED_EMAIL",
      {
        email: updatedUser.email,
        userId: updatedUser.id,
        purpose: "PASSWORD_CHANGED",
        subject: "Password Changed",
        htmlContent,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeUniqueJobId(
          "email",
          "SEND_PASSWORD_CHANGED_EMAIL",
          updatedUser.id,
          updatedUser.email,
        ),
      },
    );
  } catch (error) {
    console.error("[changePassword] Failed to enqueue security notice", {
      userId: updatedUser.id,
      email: updatedUser.email,
      error,
    });
  }

  return { user: updatedUser };
};

export default changePassword;
