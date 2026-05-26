import { Response } from "express";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import {
  deleteAccount as deleteAccountService,
  deleteProfilePicture as deleteProfilePictureService,
  getNotificationSettings as getNotificationSettingsService,
  markNotificationsAsSeen as markNotificationsAsSeenService,
  updateNotificationSettings as updateNotificationSettingsService,
  updateProfile as updateProfileService,
  updateProfilePicture as updateProfilePictureService,
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

export {
  updateProfilePicture,
  deleteProfilePicture,
  updateProfile,
  deleteAccount,
  getNotificationSettings,
  updateNotificationSettings,
  markNotificationsAsSeen,
};
