import bcrypt from "bcrypt";

import HttpError from "../../utils/http/httpError.util.js";
import { makeUniqueJobId } from "../../utils/job/makeJobId.util.js";
import { securityNoticeHtml } from "../../utils/email/renderTemplate.util.js";
import publishSocketDisconnect from "../../utils/socket/publishSocketDisconnect.util.js";
import sanitizeUser from "../../utils/auth/sanitizeUser.util.js";

import {
  cacheAuthUser,
  cacheUser,
  getDeviceIp,
  handleExpiredUnverifiedUser,
  type DeviceInfo,
} from "../auth/auth.shared.js";

import {
  EMAIL_CHANGE_OTP_ATTEMPTS_TTL_SECONDS,
  getEmailChangeAttemptsKey,
  removeEmailChangeAttempts,
} from "./emailChange.shared.js";

import { Prisma } from "../../generated/prisma/index.js";

import prisma from "../../config/prisma.config.js";
import { getRedisCacheClient } from "../../config/redis.config.js";

import emailQueue from "../../queues/email.queue.js";

type VerifyEmailChangeInput = {
  userId: string;
  otp: string;
  deviceInfo: DeviceInfo;
};

const verifyEmailChange = async ({
  userId,
  otp,
  deviceInfo,
}: VerifyEmailChangeInput) => {
  const foundUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      isVerified: true,
      tokenVersion: true,
      authProvider: true,
      createdAt: true,
      emailChangePendingEmail: true,
      emailChangeOtp: true,
      emailChangeOtpExpireAt: true,
      emailChangeOtpResendAvailableAt: true,
    },
  });

  if (!foundUser) throw new HttpError("Invalid credentials", 404);

  if (await handleExpiredUnverifiedUser(foundUser)) {
    throw new HttpError(
      "Email verification expired, please sign up again",
      410,
    );
  }

  const previousEmail = foundUser.email;

  if (
    !foundUser.emailChangePendingEmail ||
    !foundUser.emailChangeOtp ||
    !foundUser.emailChangeOtpExpireAt ||
    !foundUser.emailChangeOtpResendAvailableAt
  ) {
    throw new HttpError("Email change OTP not set", 400);
  }

  const attemptsKey = getEmailChangeAttemptsKey(foundUser.id);
  const attempts = await getRedisCacheClient().get(attemptsKey);

  if (attempts && Number(attempts) >= 5)
    throw new HttpError(`Too many invalid attempts, OTP locked`, 400);

  if (foundUser.emailChangeOtpExpireAt < new Date(Date.now())) {
    throw new HttpError("Email change OTP expired", 400);
  }

  const isValidOtp = await bcrypt.compare(otp, foundUser.emailChangeOtp);

  if (!isValidOtp) {
    await getRedisCacheClient()
      .multi()
      .incr(attemptsKey)
      .expire(attemptsKey, EMAIL_CHANGE_OTP_ATTEMPTS_TTL_SECONDS)
      .exec();

    throw new HttpError("Invalid email change OTP", 400);
  }

  const conflictingUser = await prisma.user.findFirst({
    where: { email: foundUser.emailChangePendingEmail, isDeleted: false },
    select: { id: true, createdAt: true, authProvider: true, isVerified: true },
  });

  if (conflictingUser && conflictingUser.id !== foundUser.id) {
    if (!(await handleExpiredUnverifiedUser(conflictingUser))) {
      throw new HttpError("Email is already in use", 400);
    }
  }

  let updatedUser;

  try {
    updatedUser = await prisma.user.update({
      where: { id: foundUser.id },
      data: {
        email: foundUser.emailChangePendingEmail,
        isVerified: true,
        otp: null,
        otpExpireAt: null,
        otpResendAvailableAt: null,
        emailChangePendingEmail: null,
        emailChangeOtp: null,
        emailChangeOtpExpireAt: null,
        emailChangeOtpResendAvailableAt: null,
        resetPasswordOtp: null,
        resetPasswordOtpVerified: null,
        resetPasswordOtpExpireAt: null,
        resetPasswordOtpResendAvailableAt: null,
        tokenVersion: { increment: 1 },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new HttpError("Email is already in use", 400);
    }

    throw error;
  }

  try {
    await cacheUser(updatedUser);
  } catch (error) {
    console.error("[verifyEmailChange] Failed to refresh user cache", {
      userId: updatedUser.id,
      error,
    });
  }

  try {
    await cacheAuthUser(updatedUser);
  } catch (error) {
    console.error("[verifyEmailChange] Failed to refresh auth cache", {
      userId: updatedUser.id,
      error,
    });
  }

  try {
    await removeEmailChangeAttempts(foundUser.id);
  } catch (error) {
    console.error("[verifyEmailChange] Failed to clear OTP attempts", {
      userId: updatedUser.id,
      error,
    });
  }

  try {
    await publishSocketDisconnect(updatedUser.id);
  } catch (error) {
    console.error("[verifyEmailChange] Failed to disconnect sessions", {
      userId: updatedUser.id,
      error,
    });
  }

  const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;
  const htmlContent = securityNoticeHtml(
    foundUser.username,
    "Email changed",
    "Your account email has been changed successfully.",
    deviceName,
    getDeviceIp(deviceInfo),
  );

  try {
    await emailQueue.add(
      "SEND_EMAIL_CHANGED_EMAIL",
      {
        email: previousEmail,
        userId: updatedUser.id,
        purpose: "EMAIL_CHANGED",
        subject: "Email Changed",
        htmlContent,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeUniqueJobId(
          "email",
          "SEND_EMAIL_CHANGED_EMAIL",
          updatedUser.id,
          previousEmail,
        ),
      },
    );
  } catch (error) {
    console.error("[verifyEmailChange] Failed to enqueue security notice", {
      userId: updatedUser.id,
      email: previousEmail,
      error,
    });
  }

  return { user: sanitizeUser(updatedUser) };
};

export default verifyEmailChange;
