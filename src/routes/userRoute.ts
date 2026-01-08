import express from "express";

import {
  getInterests,
  saveInterests,
  updateProfile,
} from "../controllers/userController.js";

import isAuthenticated, {
  requireActiveUser,
  isVerified,
} from "../middlewares/authMiddleware.js";
import validate from "../middlewares/validateMiddleware.js";

import { updateProfileSchema } from "../validations/user.schema.js";
import { saveInterestsSchema } from "../validations/user.schema.js";

import { updateProfileLimiterMiddleware } from "../middlewares/rateLimiters/userRateLimiters.js";
import { getInterestsLimiterMiddleware } from "../middlewares/rateLimiters/userRateLimiters.js";
import { saveInterestsLimiterMiddleware } from "../middlewares/rateLimiters/userRateLimiters.js";

const router = express.Router();

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
