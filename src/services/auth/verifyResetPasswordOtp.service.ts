import bcrypt from "bcrypt";

import {
  handleExpiredUnverifiedUser,
  removeResetPasswordAttempts,
} from "./auth.shared.js";
import { getFlattenedUserByEmail } from "../user/userData.service.js";

import prisma from "../../config/prisma.config.js";
import { getRedisCacheClient } from "../../config/redis.config.js";

import HttpError from "../../utils/http/httpError.util.js";

type VerifyResetPasswordOtpInput = {
  email: string;
  otp: string;
};

const verifyResetPasswordOtp = async ({
  email,
  otp,
}: VerifyResetPasswordOtpInput) => {
  const foundUser = await getFlattenedUserByEmail(email);

  if (!foundUser) throw new HttpError("Invalid credentials", 404);

  if (await handleExpiredUnverifiedUser(foundUser)) {
    throw new HttpError(
      "Email verification expired, please sign up again",
      410,
    );
  }

  if (foundUser.authProvider !== "LOCAL")
    throw new HttpError("Password reset not applicable", 400);

  if (
    !foundUser.resetPasswordOtp ||
    !foundUser.resetPasswordOtpExpireAt ||
    !foundUser.resetPasswordOtpResendAvailableAt
  )
    throw new HttpError("Reset password OTP not set", 400);

  const attempts = await getRedisCacheClient().get(
    `auth:reset-password:attempts:${foundUser.id}`,
  );

  if (attempts && Number(attempts) >= 5)
    throw new HttpError(`Too many invalid attempts, OTP locked`, 400);

  if (foundUser.resetPasswordOtpExpireAt < new Date(Date.now()))
    throw new HttpError("Reset password OTP expired", 400);

  const isValidOtp = await bcrypt.compare(otp, foundUser.resetPasswordOtp);

  if (!isValidOtp) {
    await getRedisCacheClient()
      .multi()
      .incr(`auth:reset-password:attempts:${foundUser.id}`)
      .expire(`auth:reset-password:attempts:${foundUser.id}`, 120)
      .exec();

    throw new HttpError("Invalid reset password OTP", 400);
  }

  await prisma.userAuth.update({
    where: { userId: foundUser.id },
    data: {
      resetPasswordOtpVerified: true,
      resetPasswordOtp: null,
      resetPasswordOtpExpireAt: null,
      resetPasswordOtpResendAvailableAt: null,
    },
  });

  await removeResetPasswordAttempts(foundUser.id);

  return { verified: true };
};

export default verifyResetPasswordOtp;
