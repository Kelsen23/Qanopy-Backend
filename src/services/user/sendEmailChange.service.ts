import bcrypt from "bcrypt";

import {
  getDeviceIp,
  handleExpiredUnverifiedUser,
  type DeviceInfo,
} from "../auth/auth.shared.js";
import {
  getFlattenedUserByEmail,
  getFlattenedUserById,
} from "./userData.service.js";

import { removeEmailChangeAttempts } from "./emailChange.shared.js";

import prisma from "../../config/prisma.config.js";
import { getRedisCacheClient } from "../../config/redis.config.js";

import { emailChangeHtml } from "../../utils/email/renderTemplate.util.js";
import HttpError from "../../utils/http/httpError.util.js";
import { makeUniqueJobId } from "../../utils/job/makeJobId.util.js";

import emailQueue from "../../queues/email.queue.js";

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
  const foundUser = await getFlattenedUserById(userId);

  if (!foundUser) throw new HttpError("User not found", 404);

  if (await handleExpiredUnverifiedUser(foundUser)) {
    throw new HttpError(
      "Email verification expired, please sign up again",
      410,
    );
  }

  if (foundUser.authProvider !== "LOCAL") {
    throw new HttpError("Email change not applicable", 400);
  }

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

  const conflictingUser = await getFlattenedUserByEmail(newEmail);

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

  const updatedUser = await prisma.userEmailChange.update({
    where: { userId },
    data: {
      pendingEmail: newEmail,
      otp: hashedOtp,
      otpExpireAt: emailChangeOtpExpireAt,
      otpResendAvailableAt: emailChangeOtpResendAvailableAt,
    },
  });

  try {
    await removeEmailChangeAttempts(userId);
  } catch (error) {
    console.error("[sendEmailChange] Failed to clear OTP attempts", {
      userId,
      newEmail,
      error,
    });
  }

  const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;
  const htmlContent = emailChangeHtml(
    foundUser.username,
    otp,
    deviceName,
    getDeviceIp(deviceInfo),
  );

  try {
    await emailQueue.add(
      "SEND_EMAIL_CHANGE",
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
          "SEND_EMAIL_CHANGE",
          userId,
          updatedUser.pendingEmail,
        ),
      },
    );
  } catch (error) {
    await prisma.userEmailChange.update({
      where: { userId },
      data: {
        pendingEmail: previousPendingEmail,
        otp: previousOtp,
        otpExpireAt: previousOtpExpireAt,
        otpResendAvailableAt: previousOtpResendAvailableAt,
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

  try {
    await removeEmailChangeAttempts(userId);
  } catch (error) {
    console.error("[sendEmailChange] Failed to clear OTP attempts", {
      userId,
      newEmail,
      error,
    });
  }

  return {
    emailChangeOtpExpireAt: updatedUser.otpExpireAt,
    emailChangeOtpResendAvailableAt: updatedUser.otpResendAvailableAt,
    pendingEmail: updatedUser.pendingEmail,
  };
};

export default sendEmailChange;
