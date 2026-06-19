import bcrypt from "bcrypt";

import HttpError from "../../utils/http/httpError.util.js";
import { makeUniqueJobId } from "../../utils/job/makeJobId.util.js";
import { emailChangeHtml } from "../../utils/email/renderTemplate.util.js";

import prisma from "../../config/prisma.config.js";
import { getRedisCacheClient } from "../../config/redis.config.js";

import emailQueue from "../../queues/email.queue.js";

import { getDeviceIp, type DeviceInfo } from "../auth/auth.shared.js";

import { removeEmailChangeAttempts } from "./emailChange.shared.js";

type ResendEmailChangeInput = {
  userId: string;
  deviceInfo: DeviceInfo;
};

const resendEmailChange = async ({
  userId,
  deviceInfo,
}: ResendEmailChangeInput) => {
  const foundUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      emailChangePendingEmail: true,
      emailChangeOtp: true,
      emailChangeOtpExpireAt: true,
      emailChangeOtpResendAvailableAt: true,
    },
  });

  if (!foundUser) throw new HttpError("Invalid credentials", 404);

  if (
    !foundUser.emailChangePendingEmail ||
    !foundUser.emailChangeOtp ||
    !foundUser.emailChangeOtpExpireAt ||
    !foundUser.emailChangeOtpResendAvailableAt
  ) {
    throw new HttpError("Email change OTP not set", 400);
  }

  if (foundUser.emailChangeOtpResendAvailableAt > new Date(Date.now())) {
    throw new HttpError("OTP resend will soon be available, please wait", 400);
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const emailChangeOtpExpireAt = new Date(Date.now() + 2 * 60 * 1000);
  const emailChangeOtpResendAvailableAt = new Date(Date.now() + 30 * 1000);
  const previousOtp = foundUser.emailChangeOtp;
  const previousOtpExpireAt = foundUser.emailChangeOtpExpireAt;
  const previousOtpResendAvailableAt =
    foundUser.emailChangeOtpResendAvailableAt;

  const hashedOtp = await bcrypt.hash(otp, 6);

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      emailChangeOtp: hashedOtp,
      emailChangeOtpExpireAt,
      emailChangeOtpResendAvailableAt,
    },
  });

  const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;
  const htmlContent = emailChangeHtml(
    updatedUser.username,
    otp,
    deviceName,
    getDeviceIp(deviceInfo),
  );

  try {
    await emailQueue.add(
      "RESEND_EMAIL_CHANGE",
      {
        email: updatedUser.emailChangePendingEmail,
        userId: updatedUser.id,
        purpose: "CHANGE_EMAIL",
        subject: "Change Email Request",
        htmlContent,
        otpHash: hashedOtp,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeUniqueJobId(
          "email",
          "RESEND_EMAIL_CHANGE",
          updatedUser.id,
          updatedUser.emailChangePendingEmail,
        ),
      },
    );
  } catch (error) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        emailChangeOtp: previousOtp,
        emailChangeOtpExpireAt: previousOtpExpireAt,
        emailChangeOtpResendAvailableAt: previousOtpResendAvailableAt,
      },
    });

    await getRedisCacheClient().del(`user:${userId}`);

    console.error("[resendEmailChange] Failed to enqueue email change OTP", {
      userId,
      error,
    });

    throw new HttpError("Failed to send email change OTP", 503);
  }

  try {
    await removeEmailChangeAttempts(updatedUser.id);
  } catch (error) {
    console.error("[resendEmailChange] Failed to clear OTP attempts", {
      userId,
      error,
    });
  }

  return {
    emailChangeOtpExpireAt: updatedUser.emailChangeOtpExpireAt,
    emailChangeOtpResendAvailableAt:
      updatedUser.emailChangeOtpResendAvailableAt,
    pendingEmail: updatedUser.emailChangePendingEmail,
  };
};

export default resendEmailChange;
