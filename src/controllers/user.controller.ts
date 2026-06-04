import { Response } from "express";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import getDeviceInfo from "../utils/getDeviceInfo.util.js";

import {
  deleteAccount as deleteAccountService,
  deleteProfilePicture as deleteProfilePictureService,
  getNotificationSettings as getNotificationSettingsService,
  markNotificationsAsSeen as markNotificationsAsSeenService,
  resendEmailChange as resendEmailChangeService,
  sendEmailChange as sendEmailChangeService,
  updateNotificationSettings as updateNotificationSettingsService,
  updateProfile as updateProfileService,
  updateProfilePicture as updateProfilePictureService,
  verifyEmailChange as verifyEmailChangeService,
} from "../services/user/user.service.js";

const updateProfilePicture = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { objectKey } = req.body;

    const { message } = await updateProfilePictureService({
      userId,
      objectKey,
    });

    return res.status(202).json({ message });
  },
);

const deleteProfilePicture = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;

    const { profilePictureKey, profilePictureUrl } =
      await deleteProfilePictureService(userId);

    return res.status(202).json({
      message: "Successfully deleted profile picture",
      profilePictureKey,
      profilePictureUrl,
    });
  },
);

const updateProfile = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { displayName, bio } = req.body;

    const { user } = await updateProfileService({
      userId,
      displayName,
      bio,
    });

    return res.status(200).json({
      message: "Successfully updated profile",
      user,
    });
  },
);

const deleteAccount = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;

    const { message } = await deleteAccountService({ userId });

    return res.status(202).json({ message });
  },
);

const getNotificationSettings = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;

    const { settings } = await getNotificationSettingsService({ userId });

    return res.status(200).json({
      message: "Successfully received notification settings",
      settings,
    });
  },
);

const updateNotificationSettings = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;

    const { settings } = await updateNotificationSettingsService({
      userId,
      settings: req.body,
    });

    return res.status(200).json({
      message: "Notification settings updated successfully",
      settings,
    });
  },
);

const markNotificationsAsSeen = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { notificationIds } = req.body;

    const { message } = await markNotificationsAsSeenService({
      userId,
      notificationIds,
    });

    return res.status(200).json({ message });
  },
);

const sendEmailChange = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { newEmail } = req.body;
    const deviceInfo = getDeviceInfo(req);

    const {
      emailChangeOtpExpireAt,
      emailChangeOtpResendAvailableAt,
      pendingEmail,
    } = await sendEmailChangeService({
      userId,
      newEmail,
      deviceInfo,
    });

    return res.status(202).json({
      message: "Email change OTP sent",
      pendingEmail,
      emailChangeOtpExpireAt,
      emailChangeOtpResendAvailableAt,
    });
  },
);

const resendEmailChange = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const deviceInfo = getDeviceInfo(req);

    const {
      emailChangeOtpExpireAt,
      emailChangeOtpResendAvailableAt,
      pendingEmail,
    } = await resendEmailChangeService({
      userId,
      deviceInfo,
    });

    return res.status(202).json({
      message: "Successfully sent another OTP to your new email address",
      pendingEmail,
      emailChangeOtpExpireAt,
      emailChangeOtpResendAvailableAt,
    });
  },
);

const verifyEmailChange = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { otp } = req.body;
    const deviceInfo = getDeviceInfo(req);

    const { user } = await verifyEmailChangeService({
      userId,
      otp,
      deviceInfo,
    });

    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    });

    return res.status(200).json({
      message: "Successfully changed email, please sign in again",
      user,
    });
  },
);

export {
  updateProfilePicture,
  deleteProfilePicture,
  updateProfile,
  deleteAccount,
  getNotificationSettings,
  updateNotificationSettings,
  markNotificationsAsSeen,
  sendEmailChange,
  resendEmailChange,
  verifyEmailChange,
};
