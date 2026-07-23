import bcrypt from "bcrypt";

import { getDeviceIp, type DeviceInfo } from "../auth/auth.shared.js";
import { getFlattenedUserById } from "./userData.service.js";

import { removeEmailChangeAttempts } from "./emailChange.shared.js";

import prisma from "../../config/prisma.config.js";
import { getRedisCacheClient } from "../../config/redis.config.js";

import { emailChangeHtml } from "../../utils/email/renderTemplate.util.js";
import HttpError from "../../utils/http/httpError.util.js";
import { makeUniqueJobId } from "../../utils/job/makeJobId.util.js";

import emailQueue from "../../queues/email.queue.js";

type ResendEmailChangeInput = {
  userId: string;
  deviceInfo: DeviceInfo;
};

const resendEmailChange = async ({
  userId,
  deviceInfo,
}: ResendEmailChangeInput) => {
  const foundUser = await getFlattenedUserById(userId);

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

  const updatedUser = await prisma.userEmailChange.update({
    where: { userId },
    data: {
      otp: hashedOtp,
      otpExpireAt: emailChangeOtpExpireAt,
      otpResendAvailableAt: emailChangeOtpResendAvailableAt,
    },
  });

  const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;
  const htmlContent = emailChangeHtml(
    foundUser.username,
    otp,
    deviceName,
    getDeviceIp(deviceInfo),
  );

  try {
    await emailQueue.add(
      "RESEND_EMAIL_CHANGE",
      {
        email: updatedUser.pendingEmail,
        userId,
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
          userId,
          updatedUser.pendingEmail,
        ),
      },
    );
  } catch (error) {
    await prisma.userEmailChange.update({
      where: { userId },
      data: {
        otp: previousOtp,
        otpExpireAt: previousOtpExpireAt,
        otpResendAvailableAt: previousOtpResendAvailableAt,
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
    await removeEmailChangeAttempts(userId);
  } catch (error) {
    console.error("[resendEmailChange] Failed to clear OTP attempts", {
      userId,
      error,
    });
  }

  return {
    emailChangeOtpExpireAt: updatedUser.otpExpireAt,
    emailChangeOtpResendAvailableAt: updatedUser.otpResendAvailableAt,
    pendingEmail: updatedUser.pendingEmail,
  };
};

export default resendEmailChange;
