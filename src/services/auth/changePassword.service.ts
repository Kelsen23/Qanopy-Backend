import bcrypt from "bcrypt";

import HttpError from "../../utils/httpError.util.js";
import publishSocketDisconnect from "../../utils/publishSocketDisconnect.util.js";

import prisma from "../../config/prisma.config.js";

import {
  cacheAuthUser,
  cacheUser,
  removeResetPasswordAttempts,
} from "./auth.shared.js";

type ChangePasswordInput = {
  userId: string;
  currentPassword: string;
  newPassword: string;
};

const changePassword = async ({
  userId,
  currentPassword,
  newPassword,
}: ChangePasswordInput) => {
  const foundUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      password: true,
      authProvider: true,
    },
  });

  if (!foundUser) throw new HttpError("Invalid credentials", 404);

  if (foundUser.authProvider !== "LOCAL")
    throw new HttpError("Password change not applicable", 400);

  if (!foundUser.password)
    throw new HttpError("Password change not applicable", 400);

  const isCurrentPasswordValid = await bcrypt.compare(
    currentPassword,
    foundUser.password,
  );

  if (!isCurrentPasswordValid)
    throw new HttpError("Invalid current password", 401);

  const isSamePassword = await bcrypt.compare(newPassword, foundUser.password);
  if (isSamePassword)
    throw new HttpError(
      "New password must be different from the old password",
      400,
    );

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashedPassword,
      tokenVersion: { increment: 1 },
      resetPasswordOtp: null,
      resetPasswordOtpVerified: null,
      resetPasswordOtpResendAvailableAt: null,
      resetPasswordOtpExpireAt: null,
    },
  });

  await removeResetPasswordAttempts(updatedUser.id);
  await cacheAuthUser(updatedUser);
  await cacheUser(updatedUser);
  await publishSocketDisconnect(updatedUser.id);

  return { user: updatedUser };
};

export default changePassword;
