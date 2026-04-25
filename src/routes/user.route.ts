import express from "express";

import {
  deleteProfilePicture,
  getInterests,
  saveInterests,
  updateProfile,
  updateProfilePicture,
  getNotificationSettings,
  updateNotificationSettings,
  markNotificationsAsSeen,
} from "../controllers/user.controller.js";

import isAuthenticated, {
  requireActiveUser,
  isVerified,
} from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
  updateProfilePictureSchema,
  updateProfileSchema,
  saveInterestsSchema,
  updateNotificationSettingsSchema,
  markNotificationsAsSeenSchema,
} from "../validations/user.schema.js";

import {
  updateProfileLimiterMiddleware,
  updateProfilePictureLimiterMiddleware,
  getInterestsLimiterMiddleware,
  saveInterestsLimiterMiddleware,
} from "../middlewares/rate-limiters/user.rate-limiters.js";

const router = express.Router();

router
  .route("/update/profile/picture")
  .put(
    updateProfilePictureLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    validate(updateProfilePictureSchema),
    updateProfilePicture,
  );

router
  .route("/profile/picture")
  .delete(isAuthenticated, isVerified, requireActiveUser, deleteProfilePicture);

router
  .route("/update/profile")
  .patch(
    updateProfileLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    validate(updateProfileSchema),
    updateProfile,
  );

router
  .route("/interests")
  .get(
    getInterestsLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    getInterests,
  );
router
  .route("/save/interests")
  .patch(
    saveInterestsLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    validate(saveInterestsSchema),
    saveInterests,
  );

router
  .route("/settings/notifications")
  .get(isAuthenticated, isVerified, requireActiveUser, getNotificationSettings);

router
  .route("/settings/notifications")
  .put(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    validate(updateNotificationSettingsSchema),
    updateNotificationSettings,
  );

router
  .route("/notifications/seen")
  .patch(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    validate(markNotificationsAsSeenSchema),
    markNotificationsAsSeen,
  );

export default router;
