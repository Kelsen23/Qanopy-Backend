import express from "express";

import {
  getInterests,
  saveInterests,
  updateProfile,
} from "../controllers/user.controller.js";

import isAuthenticated, {
  requireActiveUser,
  isVerified,
} from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import { updateProfileSchema } from "../validations/user.schema.js";
import { saveInterestsSchema } from "../validations/user.schema.js";

import { updateProfileLimiterMiddleware } from "../middlewares/rate-limiters/user.rate-limiters.js";
import { getInterestsLimiterMiddleware } from "../middlewares/rate-limiters/user.rate-limiters.js";
import { saveInterestsLimiterMiddleware } from "../middlewares/rate-limiters/user.rate-limiters.js";

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
