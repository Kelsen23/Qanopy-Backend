import bcrypt from "bcrypt";

import HttpError from "../../utils/httpError.util.js";
import { makeUniqueJobId } from "../../utils/makeJobId.util.js";
import { resetPasswordHtml } from "../../utils/renderTemplate.util.js";

import prisma from "../../config/prisma.config.js";

import emailQueue from "../../queues/email.queue.js";

import {
  getDeviceIp,
  handleExpiredUnverifiedUser,
  type DeviceInfo,
} from "./auth.shared.js";

type SendResetPasswordEmailInput = {
  email: string;
  deviceInfo: DeviceInfo;
};

const sendResetPasswordEmail = async ({
  email,
  deviceInfo,
}: SendResetPasswordEmailInput) => {
  const foundUser = await prisma.user.findFirst({
    where: { email, isDeleted: false },
    select: {
      id: true,
      authProvider: true,
      isVerified: true,
      createdAt: true,
      email: true,
      username: true,
      resetPasswordOtp: true,
      resetPasswordOtpExpireAt: true,
      resetPasswordOtpResendAvailableAt: true,
    },
  });

  if (!foundUser || foundUser.authProvider !== "LOCAL") {
    return { sent: true };
  }

  if (!foundUser.isVerified && (await handleExpiredUnverifiedUser(foundUser))) {
    return { sent: true };
  }

  if (foundUser.resetPasswordOtp && foundUser.resetPasswordOtpExpireAt)
    if (foundUser.resetPasswordOtpExpireAt > new Date(Date.now()))
      throw new HttpError("Reset password OTP already sent", 400);

  const resetPasswordOtp = Math.floor(
    100000 + Math.random() * 900000,
  ).toString();
  const resetPasswordOtpExpireAt = new Date(Date.now() + 2 * 60 * 1000);
  const resetPasswordOtpResendAvailableAt = new Date(Date.now() + 30 * 1000);

  const hashedResetPasswordOtp = await bcrypt.hash(resetPasswordOtp, 6);

  const updatedUser = await prisma.user.update({
    where: { email },
    data: {
      resetPasswordOtp: hashedResetPasswordOtp,
      resetPasswordOtpExpireAt,
      resetPasswordOtpResendAvailableAt,
      resetPasswordOtpVerified: false,
    },
  });

  if (!updatedUser.resetPasswordOtp) throw new HttpError("OTP not set", 400);

  const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;

  const htmlContent = resetPasswordHtml(
    updatedUser.username,
    resetPasswordOtp,
    deviceName,
    getDeviceIp(deviceInfo),
  );

  await emailQueue.add(
    "SEND_RESET_PASSWORD_EMAIL",
    {
      email: updatedUser.email,
      userId: updatedUser.id,
      purpose: "RESET_PASSWORD",
      subject: "Reset Password Request",
      htmlContent,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeUniqueJobId(
        "email",
        "SEND_RESET_PASSWORD_EMAIL",
        updatedUser.id,
        updatedUser.email,
      ),
    },
  );

  return { sent: true };
};

export default sendResetPasswordEmail;
