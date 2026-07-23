import bcrypt from "bcrypt";

import type { Prisma } from "../../generated/prisma/client.js";

import {
  cacheUser,
  getDeviceIp,
  getRegisteredStage,
  handleExpiredUnverifiedUser,
  queueBadgeAwardSafely,
  type DeviceInfo,
} from "./auth.shared.js";
import {
  createUserDefaults,
  flattenUser,
  getFlattenedUserByEmail,
  getFlattenedUserByUsername,
  normalizedUserInclude,
} from "../user/userData.service.js";

import prisma from "../../config/prisma.config.js";

import HttpError from "../../utils/http/httpError.util.js";
import { makeUniqueJobId } from "../../utils/job/makeJobId.util.js";
import { verificationHtml } from "../../utils/email/renderTemplate.util.js";

import emailQueue from "../../queues/email.queue.js";

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
  const emailExists = await getFlattenedUserByEmail(email);

  if (emailExists) {
    if (!(await handleExpiredUnverifiedUser(emailExists))) {
      throw new HttpError("Email is already in use", 400);
    }
  }

  const usernameExists = await getFlattenedUserByUsername(username);

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

  const registeredStage = await getRegisteredStage();

  const newUser = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      return tx.user.create({
        data: {
          username,
          email,
          ...createUserDefaults({
            registeredStage,
            password: hashedPassword,
          }),
          auth: {
            create: {
              password: hashedPassword,
              otp: hashedOtp,
              otpExpireAt,
              otpResendAvailableAt,
            },
          },
        },
        include: normalizedUserInclude,
      });
    },
  );

  const flattenedUser = flattenUser(newUser);

  await cacheUser(flattenedUser);

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

  await queueBadgeAwardSafely(newUser.id);

  return {
    user: flattenedUser,
    otpExpireAt: flattenedUser.otpExpireAt,
    otpResendAvailableAt: flattenedUser.otpResendAvailableAt,
  };
};

export default register;
