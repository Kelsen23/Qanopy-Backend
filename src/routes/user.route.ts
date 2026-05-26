import express from "express";

import {
  deleteAccount,
  deleteProfilePicture,
  getNotificationSettings,
  markNotificationsAsSeen,
  updateProfile,
  updateProfilePicture,
  updateNotificationSettings,
} from "../controllers/user.controller.js";

import isAuthenticated, {
  isVerified,
  requireActiveUser,
} from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
  userAccountDeletionLimiterMiddleware,
  userNotificationSettingsLimiterMiddleware,
  userNotificationsSeenLimiterMiddleware,
  userProfilePictureDeleteLimiterMiddleware,
  userProfilePictureUpdateLimiterMiddleware,
  userProfileUpdateLimiterMiddleware,
} from "../middlewares/rate-limiters/user.rate-limiters.js";

import {
  markNotificationsAsSeenSchema,
  updateNotificationSettingsSchema,
  updateProfilePictureSchema,
  updateProfileSchema,
} from "../validations/user.schema.js";

const router = express.Router();

router
  .route("/picture")
  .put(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    userProfilePictureUpdateLimiterMiddleware,
    validate(updateProfilePictureSchema),
    updateProfilePicture,
  )
  .delete(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    userProfilePictureDeleteLimiterMiddleware,
    deleteProfilePicture,
  );

router
  .route("/profile")
  .patch(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    userProfileUpdateLimiterMiddleware,
    validate(updateProfileSchema),
    updateProfile,
  );

router
  .route("/account")
  .delete(
    isAuthenticated,
    isVerified,
    userAccountDeletionLimiterMiddleware,
    deleteAccount,
  );

router
  .route("/notifications/settings")
  .get(isAuthenticated, isVerified, requireActiveUser, getNotificationSettings)
  .put(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    userNotificationSettingsLimiterMiddleware,
    validate(updateNotificationSettingsSchema),
    updateNotificationSettings,
  );

router
  .route("/notifications/seen")
  .patch(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    userNotificationsSeenLimiterMiddleware,
    validate(markNotificationsAsSeenSchema),
    markNotificationsAsSeen,
  );

export default router;
