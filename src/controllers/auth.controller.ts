import { Request, Response, NextFunction } from "express";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import bcrypt from "bcrypt";

import generateToken from "../utils/generateToken.util.js";
import getDeviceInfo from "../utils/getDeviceInfo.util.js";
import generateOAuthUsername from "../utils/generateOAuthUsername.util.js";

import verifyGoogleToken from "../utils/verifyGoogleToken.util.js";

import {
  resetPasswordHtml,
  verificationHtml,
} from "../utils/renderTemplate.util.js";

import HttpError from "../utils/httpError.util.js";

import prisma from "../config/prisma.config.js";
import { redisCacheClient } from "../config/redis.config.js";

import emailQueue from "../queues/email.queue.js";

const register = asyncHandler(async (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  const emailExists = await prisma.user.findUnique({ where: { email } });
  if (emailExists) throw new HttpError("Email is already in use", 400);

  const usernameExists = await prisma.user.findUnique({ where: { username } });
  if (usernameExists) throw new HttpError("Username is taken", 400);

  const passwordSalt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, passwordSalt);

  const newUser = await prisma.user.create({
    data: { username, email, password: hashedPassword },
  });
  generateToken(res, newUser.id);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpireAt = new Date(Date.now() + 2 * 60 * 1000);
  const otpResendAvailableAt = new Date(Date.now() + 30 * 1000);

  const otpSalt = await bcrypt.genSalt(8);
  const hashedOtp = await bcrypt.hash(otp, otpSalt);

  const updatedUser = await prisma.user.update({
    where: { email },
    data: { otp: hashedOtp, otpExpireAt, otpResendAvailableAt },
  });

  const deviceInfo = getDeviceInfo(req);
  const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;
  const htmlContent = verificationHtml(
    username,
    otp,
    deviceName,
    deviceInfo.ip || "Unknown IP",
  );

  await emailQueue.add(
    "sendVerificationEmail",
    {
      email: updatedUser.email,
      subject: "Verify Email",
      htmlContent,
    },
    { removeOnComplete: true, removeOnFail: true },
  );

  return res.status(200).json({
    message: "Successfully registered",
    user: {
      username: updatedUser.username,
      email: updatedUser.email,
      otpExpireAt: updatedUser.otpExpireAt,
      otpResendAvailableAt: updatedUser.otpResendAvailableAt,
      isVerified: updatedUser.isVerified,
    },
  });
});

const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const foundUser = await prisma.user.findUnique({ where: { email } });

  if (!foundUser) throw new HttpError("Invalid credentials", 400);

  if (!foundUser.password) throw new HttpError("Invalid credentials", 400);

  const isPasswordCorrect = await bcrypt.compare(password, foundUser.password);
  if (!isPasswordCorrect) throw new HttpError("Invalid password", 401);

  generateToken(res, foundUser.id);

  const {
    password: _,
    profilePictureKey,
    otp,
    otpResendAvailableAt,
    otpExpireAt,
    resetPasswordOtp,
    resetPasswordOtpVerified,
    resetPasswordOtpResendAvailableAt,
    resetPasswordOtpExpireAt,
    ...userWithoutSensitiveInfo
  } = foundUser;

  await redisCacheClient.set(
    `user:${foundUser.id}`,
    JSON.stringify(userWithoutSensitiveInfo),
    "EX",
    60 * 20,
  );

  return res.json({
    message: "Successfully logged in",
    user: {
      username: foundUser.username,
      email: foundUser.email,
      otpExpireAt: foundUser.otpExpireAt,
      otpResendAvailableAt: foundUser.otpResendAvailableAt,
      isVerified: foundUser.isVerified,
    },
  });
});

const registerOrLogin = asyncHandler(async (req: Request, res: Response) => {
  const { provider } = req.body;

  if (provider === "google") {
    const { id_token } = req.body;

    const { email, name, picture, email_verified } =
      await verifyGoogleToken(id_token);

    if (!email_verified)
      throw new HttpError("Email not verified, couldn't register", 400);

    const foundUser = await prisma.user.findUnique({ where: { email } });

    if (!foundUser) {
      const uniqueUsername = await generateOAuthUsername(name);

      const newUser = await prisma.user.create({
        data: {
          username: uniqueUsername,
          email,
          profilePictureUrl: picture,
          isVerified: true,
          authProvider: "GOOGLE",
        },
      });
      generateToken(res, newUser.id);

      return res.status(200).json({
        message: "Successfully registered",
        user: {
          username: newUser.username,
          email: newUser.email,
        },
      });
    } else {
      if (foundUser.authProvider !== "GOOGLE")
        throw new HttpError(
          "User is already registered with other method",
          400,
        );

      generateToken(res, foundUser.id);

      return res.status(200).json({
        message: "Successfully logged in",
        user: {
          username: foundUser.username,
          email: foundUser.email,
        },
      });
    }
  }

  if (provider === "github") {
    const { access_token } = req.body;

    const githubRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { email, name, avatar_url } = await githubRes.json();

    if (!email || !name)
      throw new HttpError("Invalid Github access token", 400);

    const foundUser = await prisma.user.findUnique({ where: { email } });

    if (!foundUser) {
      const uniqueUsername = await generateOAuthUsername(name);

      const newUser = await prisma.user.create({
        data: {
          username: uniqueUsername,
          email,
          profilePictureUrl: avatar_url,
          isVerified: true,
          authProvider: "GITHUB",
        },
      });

      generateToken(res, newUser.id);

      return res.status(200).json({
        message: "Successfully registered",
        user: { username: newUser.username, email: newUser.email },
      });
    } else {
      if (foundUser.authProvider !== "GITHUB")
        throw new HttpError(
          "User is already registered with other method",
          400,
        );

      generateToken(res, foundUser.id);

      return res.status(200).json({
        message: "Successfully logged in",
        user: { username: foundUser.username, email: foundUser.email },
      });
    }
  }
});

const verifyEmail = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { otp: inputOtp } = req.body;

    const foundUser = await prisma.user.findUnique({ where: { id: userId } });

    if (!foundUser) throw new HttpError("Invalid credentials", 404);

    if (foundUser.authProvider !== "LOCAL")
      throw new HttpError("Email verification not applicable", 400);

    if (foundUser.isVerified) throw new HttpError("User already verified", 400);

    if (
      !foundUser.otpExpireAt ||
      !foundUser.otpResendAvailableAt ||
      !foundUser.otp
    ) {
      throw new HttpError("OTP not set", 400);
    }

    const attempts = await redisCacheClient.get(
      `auth:verify-email:attempts:${foundUser.id}`,
    );

    if (attempts && Number(attempts) >= 5)
      throw new HttpError(`Too many invalid attempts, OTP locked`, 400);

    if (foundUser.otpExpireAt < new Date(Date.now()))
      throw new HttpError("OTP expired", 400);

    const isValidOtp = await bcrypt.compare(inputOtp, foundUser.otp);

    if (!isValidOtp) {
      await redisCacheClient
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

    const {
      password,
      profilePictureKey,
      otp,
      otpResendAvailableAt,
      otpExpireAt,
      resetPasswordOtp,
      resetPasswordOtpVerified,
      resetPasswordOtpResendAvailableAt,
      resetPasswordOtpExpireAt,
      ...userWithoutSensitiveInfo
    } = verifiedUser;

    await redisCacheClient.set(
      `user:${verifiedUser.id}`,
      JSON.stringify(userWithoutSensitiveInfo),
      "EX",
      60 * 20,
    );

    await redisCacheClient.del(`auth:verify-email:attempts:${foundUser.id}`);

    res.status(200).json({
      message: "Successfully verified",
      user: {
        username: verifiedUser.username,
        email: verifiedUser.email,
        isVerified: verifiedUser.isVerified,
      },
    });
  },
);

const resendVerificationEmail = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    const foundUser = await prisma.user.findUnique({ where: { id: userId } });

    if (!foundUser) throw new HttpError("Invalid credentials", 404);

    if (foundUser.authProvider !== "LOCAL")
      throw new HttpError("Email verification not applicable", 400);

    if (foundUser.isVerified) throw new HttpError("User already verified", 400);

    if (
      !foundUser.otpExpireAt ||
      !foundUser.otpResendAvailableAt ||
      !foundUser.otp
    )
      throw new HttpError("OTP not set", 400);

    if (foundUser.otpResendAvailableAt > new Date(Date.now()))
      throw new HttpError(
        "OTP resend will soon be available, please wait",
        400,
      );

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpireAt = new Date(Date.now() + 2 * 60 * 1000);
    const otpResendAvailableAt = new Date(Date.now() + 30 * 1000);

    const salt = await bcrypt.genSalt(8);
    const hashedOtp = await bcrypt.hash(otp, salt);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { otp: hashedOtp, otpExpireAt, otpResendAvailableAt },
    });

    if (!updatedUser.otp) throw new HttpError("OTP not set", 400);

    const deviceInfo = getDeviceInfo(req);
    const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;
    const htmlContent = verificationHtml(
      updatedUser.username,
      otp,
      deviceName,
      deviceInfo.ip || "Unknown IP",
    );

    await emailQueue.add(
      "resendVerificationEmail",
      {
        email: updatedUser.email,
        subject: "Verify Email",
        htmlContent,
      },
      { removeOnComplete: true, removeOnFail: true },
    );

    return res.status(200).json({
      message: "Successfully sent another OTP to your email address",
    });
  },
);

const sendResetPasswordEmail = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = req.body;

    const foundUser = await prisma.user.findUnique({ where: { email } });

    if (!foundUser || foundUser.authProvider !== "LOCAL") {
      return res
        .status(200)
        .json({ message: "If account exists, an email was sent" });
    }

    if (foundUser.resetPasswordOtp && foundUser.resetPasswordOtpExpireAt)
      if (foundUser.resetPasswordOtpExpireAt > new Date(Date.now()))
        throw new HttpError("Reset password OTP already sent", 400);

    const resetPasswordOtp = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();
    const resetPasswordOtpExpireAt = new Date(Date.now() + 2 * 60 * 1000);
    const resetPasswordOtpResendAvailableAt = new Date(Date.now() + 30 * 1000);

    const salt = await bcrypt.genSalt(8);
    const hashedResetPasswordOtp = await bcrypt.hash(resetPasswordOtp, salt);

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

    const deviceInfo = getDeviceInfo(req);
    const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;

    const htmlContent = resetPasswordHtml(
      updatedUser.username,
      resetPasswordOtp,
      deviceName,
      deviceInfo.ip || "Unknown IP",
    );

    await emailQueue.add(
      "sendResetPasswordEmail",
      {
        email: updatedUser.email,
        subject: "Reset Password Request",
        htmlContent,
      },
      { removeOnComplete: true, removeOnFail: true },
    );

    return res
      .status(200)
      .json({ message: "If account exists, an email was sent" });
  },
);

const resendResetPasswordEmail = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = req.body;

    const foundUser = await prisma.user.findUnique({ where: { email } });

    if (!foundUser) throw new HttpError("Invalid credentials", 404);

    if (foundUser.authProvider !== "LOCAL")
      throw new HttpError("Password reset not applicable", 400);

    if (
      !foundUser.resetPasswordOtp ||
      !foundUser.resetPasswordOtpExpireAt ||
      !foundUser.resetPasswordOtpResendAvailableAt
    )
      throw new HttpError("Reset password OTP not set", 400);

    if (foundUser.resetPasswordOtpResendAvailableAt > new Date(Date.now()))
      throw new HttpError(
        "OTP resend will soon be available, please wait",
        400,
      );

    const resetPasswordOtp = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();
    const resetPasswordOtpExpireAt = new Date(Date.now() + 2 * 60 * 1000);
    const resetPasswordOtpResendAvailableAt = new Date(Date.now() + 30 * 1000);

    const salt = await bcrypt.genSalt(8);
    const hashedResetPasswordOtp = await bcrypt.hash(resetPasswordOtp, salt);

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

    const deviceInfo = getDeviceInfo(req);
    const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;

    const htmlContent = resetPasswordHtml(
      updatedUser.username,
      resetPasswordOtp,
      deviceName,
      deviceInfo.ip || "Unknown IP",
    );

    await emailQueue.add(
      "resendResetPasswordEmail",
      {
        email: updatedUser.email,
        subject: "Reset Password Request",
        htmlContent,
      },
      { removeOnComplete: true, removeOnFail: true },
    );

    return res
      .status(200)
      .json({ message: "Successfully sent reset password OTP" });
  },
);

const verifyResetPasswordOtp = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, otp } = req.body;

    const foundUser = await prisma.user.findUnique({ where: { email } });

    if (!foundUser) throw new HttpError("Invalid credentials", 404);

    if (foundUser.authProvider !== "LOCAL")
      throw new HttpError("Password reset not applicable", 400);

    if (
      !foundUser.resetPasswordOtp ||
      !foundUser.resetPasswordOtpExpireAt ||
      !foundUser.resetPasswordOtpResendAvailableAt
    )
      throw new HttpError("Reset password OTP not set", 400);

    const attempts = await redisCacheClient.get(
      `auth:reset-password:attempts:${foundUser.id}`,
    );

    if (attempts && Number(attempts) >= 5)
      throw new HttpError(`Too many invalid attempts, OTP locked`, 400);

    if (foundUser.resetPasswordOtpExpireAt < new Date(Date.now()))
      throw new HttpError("Reset password OTP expired", 400);

    const isValidOtp = await bcrypt.compare(otp, foundUser.resetPasswordOtp);

    if (!isValidOtp) {
      await redisCacheClient
        .multi()
        .incr(`auth:reset-password:attempts:${foundUser.id}`)
        .expire(`auth:reset-password:attempts:${foundUser.id}`, 120)
        .exec();

      throw new HttpError("Invalid reset password OTP", 400);
    }

    await prisma.user.update({
      where: { id: foundUser.id },
      data: {
        resetPasswordOtpVerified: true,
        resetPasswordOtp: null,
        resetPasswordOtpExpireAt: null,
        resetPasswordOtpResendAvailableAt: null,
      },
    });

    await redisCacheClient.del(`auth:reset-password:attempts:${foundUser.id}`);

    res.status(200).json({ message: "Successfully verified OTP" });
  },
);

const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email, newPassword } = req.body;

  const foundUser = await prisma.user.findUnique({ where: { email } });

  if (!foundUser) throw new HttpError("Invalid credentials", 404);

  if (foundUser.authProvider !== "LOCAL")
    throw new HttpError("Password reset not applicable", 400);

  if (!foundUser.resetPasswordOtpVerified)
    throw new HttpError("OTP not verified", 400);

  const isSamePassword = await bcrypt.compare(
    newPassword,
    foundUser.password as string,
  );

  if (isSamePassword)
    throw new HttpError(
      "New password must be different from the old password",
      400,
    );

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  await prisma.user.update({
    where: { email },
    data: {
      password: hashedPassword,
      resetPasswordOtp: null,
      resetPasswordOtpExpireAt: null,
      resetPasswordOtpResendAvailableAt: null,
      resetPasswordOtpVerified: null,
    },
  });

  res.status(200).json({ message: "Successfully updated your password" });
});

const isAuth = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    const cachedUser = await redisCacheClient.get(`user:${userId}`);
    const foundUser = cachedUser
      ? JSON.parse(cachedUser)
      : await prisma.user.findUnique({ where: { id: userId } });

    if (!foundUser) throw new HttpError("Invalid credentials", 404);

    const {
      password,
      profilePictureKey,
      otp,
      otpResendAvailableAt,
      otpExpireAt,
      resetPasswordOtp,
      resetPasswordOtpVerified,
      resetPasswordOtpResendAvailableAt,
      resetPasswordOtpExpireAt,
      ...userWithoutSensitiveInfo
    } = foundUser;

    await redisCacheClient.set(
      `user:${foundUser.id}`,
      JSON.stringify(userWithoutSensitiveInfo),
      "EX",
      60 * 20,
    );

    if (cachedUser) {
      return res.status(200).json({
        message: "Successfully authenticated",
        user: JSON.parse(cachedUser),
      });
    }

    return res.status(200).json({
      message: "Successfully authenticated",
      user: userWithoutSensitiveInfo,
    });
  },
);

const logout = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    await redisCacheClient.del(`user:${userId}`);

    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    });

    return res.status(200).json({ message: "Logged Out" });
  },
);

export {
  register,
  login,
  registerOrLogin,
  verifyEmail,
  resendVerificationEmail,
  sendResetPasswordEmail,
  resendResetPasswordEmail,
  verifyResetPasswordOtp,
  resetPassword,
  isAuth,
  logout,
};
