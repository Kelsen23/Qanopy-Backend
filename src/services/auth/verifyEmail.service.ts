import bcrypt from "bcrypt";

import HttpError from "../../utils/httpError.util.js";

import prisma from "../../config/prisma.config.js";
import { getRedisCacheClient } from "../../config/redis.config.js";

import { cacheUser, handleExpiredUnverifiedUser } from "./auth.shared.js";

type VerifyEmailInput = {
  userId: string;
  otp: string;
};

const verifyEmail = async ({ userId, otp: inputOtp }: VerifyEmailInput) => {
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

  const attempts = await getRedisCacheClient().get(
    `auth:verify-email:attempts:${foundUser.id}`,
  );

  if (attempts && Number(attempts) >= 5)
    throw new HttpError(`Too many invalid attempts, OTP locked`, 400);

  if (foundUser.otpExpireAt < new Date(Date.now()))
    throw new HttpError("OTP expired", 400);

  const isValidOtp = await bcrypt.compare(inputOtp, foundUser.otp);

  if (!isValidOtp) {
    await getRedisCacheClient()
      .multi()
      .incr(`auth:verify-email:attempts:${foundUser.id}`)
      .expire(`auth:verify-email:attempts:${foundUser.id}`, 120)
      .exec();

    throw new HttpError("Invalid OTP", 400);
  }

  const verifiedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      isVerified: true,
      otp: null,
      otpExpireAt: null,
      otpResendAvailableAt: null,
    },
  });

  await cacheUser(verifiedUser);
  await getRedisCacheClient().del(`auth:user:${verifiedUser.id}`);
  await getRedisCacheClient().del(`auth:verify-email:attempts:${foundUser.id}`);

  return { user: verifiedUser };
};

export default verifyEmail;
