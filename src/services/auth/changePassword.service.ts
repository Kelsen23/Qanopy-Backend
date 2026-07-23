import bcrypt from "bcrypt";

import {
  cacheAuthUser,
  cacheUser,
  getDeviceIp,
  removeResetPasswordAttempts,
  type DeviceInfo,
} from "./auth.shared.js";
import {
  flattenUser,
  normalizedUserInclude,
} from "../user/userData.service.js";

import prisma from "../../config/prisma.config.js";

import { securityNoticeHtml } from "../../utils/email/renderTemplate.util.js";
import HttpError from "../../utils/http/httpError.util.js";
import { makeUniqueJobId } from "../../utils/job/makeJobId.util.js";
import publishSocketDisconnect from "../../utils/socket/publishSocketDisconnect.util.js";

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
      auth: {
        select: {
          password: true,
          authProvider: true,
        },
      },
    },
  });

  if (!foundUser) throw new HttpError("Invalid credentials", 404);

  if (foundUser.auth?.authProvider !== "LOCAL")
    throw new HttpError("Password change not applicable", 400);

  if (!foundUser.auth.password)
    throw new HttpError("Password change not applicable", 400);

  const isCurrentPasswordValid = await bcrypt.compare(
    currentPassword,
    foundUser.auth.password,
  );

  if (!isCurrentPasswordValid)
    throw new HttpError("Invalid current password", 401);

  const isSamePassword = await bcrypt.compare(
    newPassword,
    foundUser.auth.password,
  );
  if (isSamePassword)
    throw new HttpError(
      "New password must be different from the old password",
      400,
    );

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.userAuth.update({
    where: { userId },
    data: {
      password: hashedPassword,
      tokenVersion: { increment: 1 },
      resetPasswordOtp: null,
      resetPasswordOtpVerified: null,
      resetPasswordOtpResendAvailableAt: null,
      resetPasswordOtpExpireAt: null,
    },
  });

  const updatedUser = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: normalizedUserInclude,
  });
  const flattenedUser = flattenUser(updatedUser);

  await removeResetPasswordAttempts(flattenedUser.id);
  await cacheAuthUser(flattenedUser);
  await cacheUser(flattenedUser);
  await publishSocketDisconnect(flattenedUser.id);

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
        email: flattenedUser.email,
        userId: flattenedUser.id,
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
          flattenedUser.id,
          flattenedUser.email,
        ),
      },
    );
  } catch (error) {
    console.error("[changePassword] Failed to enqueue security notice", {
      userId: flattenedUser.id,
      email: flattenedUser.email,
      error,
    });
  }

  return { user: flattenedUser };
};

export default changePassword;
