import bcrypt from "bcrypt";

import HttpError from "../../utils/httpError.util.js";
import { makeUniqueJobId } from "../../utils/makeJobId.util.js";
import { emailChangeHtml } from "../../utils/renderTemplate.util.js";

import prisma from "../../config/prisma.config.js";
import { getRedisCacheClient } from "../../config/redis.config.js";

import emailQueue from "../../queues/email.queue.js";

import {
  getDeviceIp,
  handleExpiredUnverifiedUser,
  type DeviceInfo,
} from "../auth/auth.shared.js";

import { removeEmailChangeAttempts } from "./emailChange.shared.js";

type SendEmailChangeInput = {
  userId: string;
  newEmail: string;
  deviceInfo: DeviceInfo;
};

const sendEmailChange = async ({
  userId,
  newEmail,
  deviceInfo,
}: SendEmailChangeInput) => {
  const foundUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      authProvider: true,
      isVerified: true,
      createdAt: true,
      emailChangePendingEmail: true,
      emailChangeOtp: true,
      emailChangeOtpExpireAt: true,
      emailChangeOtpResendAvailableAt: true,
    },
  });

  if (!foundUser) throw new HttpError("User not found", 404);

  if (foundUser.email === newEmail) {
    throw new HttpError("New email must be different from current email", 400);
  }

  if (
    foundUser.emailChangePendingEmail &&
    foundUser.emailChangeOtpExpireAt &&
    foundUser.emailChangeOtpExpireAt > new Date(Date.now())
  ) {
    throw new HttpError("Email change OTP already sent", 400);
  }

  const conflictingUser = await prisma.user.findFirst({
    where: { email: newEmail, isDeleted: false },
    select: { id: true, createdAt: true, authProvider: true, isVerified: true },
  });

  if (conflictingUser) {
    if (!(await handleExpiredUnverifiedUser(conflictingUser))) {
      throw new HttpError("Email is already in use", 400);
    }
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const emailChangeOtpExpireAt = new Date(Date.now() + 2 * 60 * 1000);
  const emailChangeOtpResendAvailableAt = new Date(Date.now() + 30 * 1000);
  const previousPendingEmail = foundUser.emailChangePendingEmail;
  const previousOtp = foundUser.emailChangeOtp;
  const previousOtpExpireAt = foundUser.emailChangeOtpExpireAt;
  const previousOtpResendAvailableAt =
    foundUser.emailChangeOtpResendAvailableAt;

  const hashedOtp = await bcrypt.hash(otp, 6);

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      emailChangePendingEmail: newEmail,
      emailChangeOtp: hashedOtp,
      emailChangeOtpExpireAt,
      emailChangeOtpResendAvailableAt,
    },
  });

  await removeEmailChangeAttempts(updatedUser.id);

  const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;
  const htmlContent = emailChangeHtml(
    updatedUser.username,
    otp,
    deviceName,
    getDeviceIp(deviceInfo),
  );

  try {
    await emailQueue.add(
      "SEND_EMAIL_CHANGE",
      {
        email: updatedUser.emailChangePendingEmail,
        userId: updatedUser.id,
        purpose: "CHANGE_EMAIL",
        subject: "Change Email Request",
        htmlContent,
        otp,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeUniqueJobId(
          "email",
          "SEND_EMAIL_CHANGE",
          updatedUser.id,
          updatedUser.emailChangePendingEmail,
        ),
      },
    );
  } catch (error) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        emailChangePendingEmail: previousPendingEmail,
        emailChangeOtp: previousOtp,
        emailChangeOtpExpireAt: previousOtpExpireAt,
        emailChangeOtpResendAvailableAt: previousOtpResendAvailableAt,
      },
    });

    await getRedisCacheClient().del(`user:${userId}`);

    console.error("[sendEmailChange] Failed to enqueue email change OTP", {
      userId,
      newEmail,
      error,
    });

    throw new HttpError("Failed to send email change OTP", 503);
  }

  return {
    emailChangeOtpExpireAt: updatedUser.emailChangeOtpExpireAt,
    emailChangeOtpResendAvailableAt:
      updatedUser.emailChangeOtpResendAvailableAt,
    pendingEmail: updatedUser.emailChangePendingEmail,
  };
};

export default sendEmailChange;
