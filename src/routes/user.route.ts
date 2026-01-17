import express from "express";

import {
  getInterests,
  saveInterests,
  updateProfile,
  updateProfilePicture,
} from "../controllers/user.controller.js";

import isAuthenticated, {
  requireActiveUser,
  isVerified,
} from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import { updateProfileSchema } from "../validations/user.schema.js";
import { saveInterestsSchema } from "../validations/user.schema.js";

import {
  updateProfileLimiterMiddleware,
  updateProfilePictureLimiterMiddleware,
  getInterestsLimiterMiddleware,
  saveInterestsLimiterMiddleware,
} from "../middlewares/rate-limiters/user.rate-limiters.js";

const router = express.Router();

router
  .route("/profilePicture")
  .put(
    updateProfilePictureLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    updateProfilePicture,
  );

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

export default router;
