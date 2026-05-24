import bcrypt from "bcrypt";

import HttpError from "../../utils/httpError.util.js";
import generateOAuthUsername from "../../utils/generateOAuthUsername.util.js";
import { makeUniqueJobId } from "../../utils/makeJobId.util.js";
import { verificationHtml } from "../../utils/renderTemplate.util.js";

import prisma from "../../config/prisma.config.js";

import emailQueue from "../../queues/email.queue.js";

import {
  cacheUser,
  getDeviceIp,
  handleExpiredUnverifiedUser,
  type DeviceInfo,
} from "./auth.shared.js";

type RegisterInput = {
  username: string;
  email: string;
  password: string;
  deviceInfo: DeviceInfo;
};

const register = async ({
  username,
  email,
  password,
  deviceInfo,
}: RegisterInput) => {
  const emailExists = await prisma.user.findFirst({
    where: { email, isDeleted: false },
    select: { id: true, createdAt: true, authProvider: true, isVerified: true },
  });

  if (emailExists) {
    if (!(await handleExpiredUnverifiedUser(emailExists))) {
      throw new HttpError("Email is already in use", 400);
    }
  }

  const usernameExists = await prisma.user.findUnique({
    where: { username },
    select: { id: true, createdAt: true, authProvider: true, isVerified: true },
  });

  if (usernameExists) {
    if (!(await handleExpiredUnverifiedUser(usernameExists))) {
      throw new HttpError("Username is taken", 400);
    }
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpireAt = new Date(Date.now() + 2 * 60 * 1000);
  const otpResendAvailableAt = new Date(Date.now() + 30 * 1000);

  const hashedPassword = await bcrypt.hash(password, 10);
  const hashedOtp = await bcrypt.hash(otp, 6);

  const newUser = await prisma.$transaction(async (tx) => {
    return tx.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        otp: hashedOtp,
        otpExpireAt,
        otpResendAvailableAt,
        moderationStats: { create: {} },
        notificationSettings: { create: {} },
      },
    });
  });

  await cacheUser(newUser);

  const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;
  const htmlContent = verificationHtml(
    username,
    otp,
    deviceName,
    getDeviceIp(deviceInfo),
  );

  await emailQueue.add(
    "SEND_VERIFICATION_EMAIL",
    {
      email: newUser.email,
      userId: newUser.id,
      purpose: "VERIFY_EMAIL",
      subject: "Verify Email",
      htmlContent,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeUniqueJobId(
        "email",
        "SEND_VERIFICATION_EMAIL",
        newUser.id,
        newUser.email,
      ),
    },
  );

  return {
    user: newUser,
    otpExpireAt: newUser.otpExpireAt,
    otpResendAvailableAt: newUser.otpResendAvailableAt,
  };
};

export default register;
