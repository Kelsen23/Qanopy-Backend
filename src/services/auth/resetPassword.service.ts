import bcrypt from "bcrypt";

import HttpError from "../../utils/httpError.util.js";
import publishSocketDisconnect from "../../utils/publishSocketDisconnect.util.js";

import prisma from "../../config/prisma.config.js";
import { getRedisCacheClient } from "../../config/redis.config.js";

import { handleExpiredUnverifiedUser, removeResetPasswordAttempts } from "./auth.shared.js";

type ResetPasswordInput = {
  email: string;
  newPassword: string;
};

const resetPassword = async ({ email, newPassword }: ResetPasswordInput) => {
  const foundUser = await prisma.user.findFirst({
    where: { email, isDeleted: false },
    select: {
      id: true,
      password: true,
      authProvider: true,
      isVerified: true,
      createdAt: true,
      email: true,
      username: true,
      resetPasswordOtpVerified: true,
    },
  });

  if (!foundUser) throw new HttpError("Invalid credentials", 404);

  if (await handleExpiredUnverifiedUser(foundUser)) {
    throw new HttpError("Email verification expired, please sign up again", 410);
  }

  if (foundUser.authProvider !== "LOCAL")
    throw new HttpError("Password reset not applicable", 400);

  if (!foundUser.resetPasswordOtpVerified)
    throw new HttpError("OTP not verified", 400);

  const isSamePassword = await bcrypt.compare(
    newPassword,
    foundUser.password as string,
  );

  if (isSamePassword)
    throw new HttpError("New password must be different from the old password", 400);

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const updatedUser = await prisma.user.update({
    where: { email },
    data: {
      password: hashedPassword,
      tokenVersion: { increment: 1 },
      resetPasswordOtp: null,
      resetPasswordOtpExpireAt: null,
      resetPasswordOtpResendAvailableAt: null,
      resetPasswordOtpVerified: null,
    },
  });

  await getRedisCacheClient().del(`auth:user:${updatedUser.id}`);
  await getRedisCacheClient().del(`user:${updatedUser.id}`);
  await removeResetPasswordAttempts(updatedUser.id);

  await publishSocketDisconnect(updatedUser.id);

  return { user: updatedUser };
};

export default resetPassword;
