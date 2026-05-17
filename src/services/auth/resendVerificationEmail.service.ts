import bcrypt from "bcrypt";

import HttpError from "../../utils/httpError.util.js";
import { makeUniqueJobId } from "../../utils/makeJobId.util.js";
import { verificationHtml } from "../../utils/renderTemplate.util.js";

import prisma from "../../config/prisma.config.js";

import emailQueue from "../../queues/email.queue.js";

import {
  getDeviceIp,
  handleExpiredUnverifiedUser,
  type DeviceInfo,
} from "./auth.shared.js";

type ResendVerificationEmailInput = {
  userId: string;
  deviceInfo: DeviceInfo;
};

const resendVerificationEmail = async ({
  userId,
  deviceInfo,
}: ResendVerificationEmailInput) => {
  const foundUser = await prisma.user.findUnique({ where: { id: userId } });

  if (!foundUser) throw new HttpError("Invalid credentials", 404);

  if (await handleExpiredUnverifiedUser(foundUser)) {
    throw new HttpError("Email verification expired, please sign up again", 410);
  }

  if (foundUser.authProvider !== "LOCAL")
    throw new HttpError("Email verification not applicable", 400);

  if (foundUser.isVerified) throw new HttpError("User already verified", 400);

  if (!foundUser.otpExpireAt || !foundUser.otpResendAvailableAt || !foundUser.otp)
    throw new HttpError("OTP not set", 400);

  if (foundUser.otpResendAvailableAt > new Date(Date.now()))
    throw new HttpError("OTP resend will soon be available, please wait", 400);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpireAt = new Date(Date.now() + 2 * 60 * 1000);
  const otpResendAvailableAt = new Date(Date.now() + 30 * 1000);

  const hashedOtp = await bcrypt.hash(otp, 6);

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { otp: hashedOtp, otpExpireAt, otpResendAvailableAt },
  });

  if (!updatedUser.otp) throw new HttpError("OTP not set", 400);

  const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;
  const htmlContent = verificationHtml(
    updatedUser.username,
    otp,
    deviceName,
    getDeviceIp(deviceInfo),
  );

  await emailQueue.add(
    "RESEND_VERIFICATION_EMAIL",
    {
      email: updatedUser.email,
      userId: updatedUser.id,
      purpose: "VERIFY_EMAIL",
      subject: "Verify Email",
      htmlContent,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeUniqueJobId(
        "email",
        "RESEND_VERIFICATION_EMAIL",
        updatedUser.id,
        updatedUser.email,
      ),
    },
  );

  return { user: updatedUser };
};

export default resendVerificationEmail;
