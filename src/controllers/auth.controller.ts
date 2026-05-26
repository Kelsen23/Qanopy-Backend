import { Request, Response } from "express";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import generateToken from "../utils/generateToken.util.js";
import getDeviceInfo from "../utils/getDeviceInfo.util.js";
import sanitizeUser from "../utils/sanitizeUser.util.js";

import {
  changePassword as changePasswordService,
  isAuth as isAuthService,
  login as loginService,
  register as registerService,
  registerOrLogin as registerOrLoginService,
  resendResetPasswordEmail as resendResetPasswordEmailService,
  resendVerificationEmail as resendVerificationEmailService,
  resetPassword as resetPasswordService,
  sendResetPasswordEmail as sendResetPasswordEmailService,
  verifyEmail as verifyEmailService,
  verifyResetPasswordOtp as verifyResetPasswordOtpService,
} from "../services/auth/auth.service.js";

const register = asyncHandler(async (req: Request, res: Response) => {
  const { username, email, password } = req.body;
  const deviceInfo = getDeviceInfo(req);

  const { user, otpExpireAt, otpResendAvailableAt } = await registerService({
    username,
    email,
    password,
    deviceInfo,
  });

  generateToken(res, user.id, user.tokenVersion);

  return res.status(200).json({
    message: "Successfully registered",
    user: {
      username: user.username,
      email: user.email,
      otpExpireAt,
      otpResendAvailableAt,
      isVerified: user.isVerified,
    },
  });
});

const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const { user } = await loginService({ email, password });

  generateToken(res, user.id, user.tokenVersion);

  return res.json({
    message: "Successfully logged in",
    user: {
      username: user.username,
      email: user.email,
      otpExpireAt: user.otpExpireAt,
      otpResendAvailableAt: user.otpResendAvailableAt,
      isVerified: user.isVerified,
    },
  });
});

const registerOrLogin = asyncHandler(async (req: Request, res: Response) => {
  const { provider } = req.body;

  if (provider === "google") {
    const { id_token } = req.body;
    const { user, action } = await registerOrLoginService({
      provider: "google",
      idToken: id_token,
    });

    generateToken(res, user.id, user.tokenVersion);

    return res.status(200).json({
      message:
        action === "registered"
          ? "Successfully registered"
          : "Successfully logged in",
      user: {
        username: user.username,
        email: user.email,
      },
    });
  }

  if (provider === "github") {
    const { access_token } = req.body;
    const { user, action } = await registerOrLoginService({
      provider: "github",
      accessToken: access_token,
    });

    generateToken(res, user.id, user.tokenVersion);

    return res.status(200).json({
      message:
        action === "registered"
          ? "Successfully registered"
          : "Successfully logged in",
      user: {
        username: user.username,
        email: user.email,
      },
    });
  }
});

const verifyEmail = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { otp } = req.body;

    const { user } = await verifyEmailService({ userId, otp });

    return res.status(200).json({
      message: "Successfully verified",
      user: {
        username: user.username,
        email: user.email,
        isVerified: user.isVerified,
      },
    });
  },
);

const resendVerificationEmail = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const deviceInfo = getDeviceInfo(req);

    await resendVerificationEmailService({ userId, deviceInfo });

    return res.status(200).json({
      message: "Successfully sent another OTP to your email address",
    });
  },
);

const sendResetPasswordEmail = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = req.body;
    const deviceInfo = getDeviceInfo(req);

    await sendResetPasswordEmailService({ email, deviceInfo });

    return res
      .status(200)
      .json({ message: "If account exists, an email was sent" });
  },
);

const resendResetPasswordEmail = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = req.body;
    const deviceInfo = getDeviceInfo(req);

    await resendResetPasswordEmailService({ email, deviceInfo });

    return res
      .status(200)
      .json({ message: "Successfully sent reset password OTP" });
  },
);

const verifyResetPasswordOtp = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, otp } = req.body;

    await verifyResetPasswordOtpService({ email, otp });

    return res.status(200).json({ message: "Successfully verified OTP" });
  },
);

const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email, newPassword } = req.body;
  const deviceInfo = getDeviceInfo(req);

  await resetPasswordService({ email, newPassword, deviceInfo });

  return res
    .status(200)
    .json({ message: "Successfully updated your password" });
});

const changePassword = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    const deviceInfo = getDeviceInfo(req);

    const { user } = await changePasswordService({
      userId,
      currentPassword,
      newPassword,
      deviceInfo,
    });

    generateToken(res, user.id, user.tokenVersion);

    return res.status(200).json({
      message: "Successfully changed your password",
    });
  },
);

const isAuth = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    const { user } = await isAuthService({ userId });

    return res.status(200).json({
      message: "Successfully authenticated",
      user: sanitizeUser(user),
    });
  },
);

const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
  });

  return res.status(200).json({ message: "Logged Out" });
});

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
  changePassword,
  isAuth,
  logout,
};
