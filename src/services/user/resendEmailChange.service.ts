import bcrypt from "bcrypt";

import HttpError from "../../utils/httpError.util.js";
import { makeUniqueJobId } from "../../utils/makeJobId.util.js";
import { emailChangeHtml } from "../../utils/renderTemplate.util.js";

import prisma from "../../config/prisma.config.js";

import emailQueue from "../../queues/email.queue.js";

import {
  cacheUser,
  getDeviceIp,
  type DeviceInfo,
} from "../auth/auth.shared.js";

import {
  removeEmailChangeAttempts,
} from "./emailChange.shared.js";

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

  const hashedOtp = await bcrypt.hash(otp, 6);

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      emailChangeOtp: hashedOtp,
      emailChangeOtpExpireAt,
      emailChangeOtpResendAvailableAt,
    },
  });

  await removeEmailChangeAttempts(updatedUser.id);
  await cacheUser(updatedUser);

  const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;
  const htmlContent = emailChangeHtml(
    updatedUser.username,
    otp,
    deviceName,
    getDeviceIp(deviceInfo),
  );

  await emailQueue.add(
    "RESEND_EMAIL_CHANGE",
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
        "RESEND_EMAIL_CHANGE",
        updatedUser.id,
        updatedUser.emailChangePendingEmail,
      ),
    },
  );

  return {
    emailChangeOtpExpireAt: updatedUser.emailChangeOtpExpireAt,
    emailChangeOtpResendAvailableAt:
      updatedUser.emailChangeOtpResendAvailableAt,
    pendingEmail: updatedUser.emailChangePendingEmail,
  };
};

export default resendEmailChange;
