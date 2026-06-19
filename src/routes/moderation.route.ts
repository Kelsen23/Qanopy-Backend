import express from "express";

import {
  createReport,
  moderate,
  getBan,
} from "../controllers/moderation.controller.js";

import {
  moderateSchema,
  reportSchema,
} from "../validations/moderation.schema.js";

import { createReportLimiterMiddleware } from "../middlewares/rate-limiters/moderation.rate-limiters.js";

import isAuthenticated, {
  requireActiveUser,
  isVerified,
  isAdmin,
} from "../middlewares/auth.middleware.js";

import validate from "../middlewares/validate.middleware.js";

const router = express.Router();

router
  .route("/report")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    createReportLimiterMiddleware,
    validate(reportSchema),
    createReport,
  );

router
  .route("/review")
  .patch(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    isAdmin,
    validate(moderateSchema),
    moderate,
  );

router.route("/ban/active").get(isAuthenticated, getBan);

export default router;
