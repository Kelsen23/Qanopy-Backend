import bcrypt from "bcrypt";

import {
  getDeviceIp,
  handleExpiredUnverifiedUser,
  type DeviceInfo,
} from "./auth.shared.js";
import { getFlattenedUserByEmail } from "../user/userData.service.js";

import prisma from "../../config/prisma.config.js";

import { otpEmailHtml } from "../../utils/email/renderTemplate.util.js";
import HttpError from "../../utils/http/httpError.util.js";
import { makeUniqueJobId } from "../../utils/job/makeJobId.util.js";

import emailQueue from "../../queues/email.queue.js";

type SendResetPasswordEmailInput = {
  email: string;
  deviceInfo: DeviceInfo;
};

const sendResetPasswordEmail = async ({
  email,
  deviceInfo,
}: SendResetPasswordEmailInput) => {
  const foundUser = await getFlattenedUserByEmail(email);

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

  const updatedUser = await prisma.userAuth.update({
    where: { userId: foundUser.id },
    data: {
      resetPasswordOtp: hashedResetPasswordOtp,
      resetPasswordOtpExpireAt,
      resetPasswordOtpResendAvailableAt,
      resetPasswordOtpVerified: false,
    },
  });

  if (!updatedUser.resetPasswordOtp) throw new HttpError("OTP not set", 400);

  const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;

  const htmlContent = otpEmailHtml({
    purpose: "resetPassword",
    username: foundUser.username,
    otp: resetPasswordOtp,
    deviceName,
    deviceIp: getDeviceIp(deviceInfo),
  });

  await emailQueue.add(
    "SEND_RESET_PASSWORD_EMAIL",
    {
      email: foundUser.email,
      userId: foundUser.id,
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
        foundUser.id,
        foundUser.email,
      ),
    },
  );

  return { sent: true };
};

export default sendResetPasswordEmail;
