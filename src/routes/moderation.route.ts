import express from "express";

import {
  createReport,
  getBan,
  moderate,
  removeBan,
} from "../controllers/moderation.controller.js";

import isAuthenticated, {
  isAdmin,
  isVerified,
  requireActiveUser,
} from "../middlewares/auth.middleware.js";

import { createReportLimiterMiddleware } from "../middlewares/rate-limiters/moderation.rate-limiters.js";

import validate from "../middlewares/validate.middleware.js";

import {
  moderateSchema,
  removeBanSchema,
  reportSchema,
} from "../validations/moderation.schema.js";

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

router
  .route("/ban/remove")
  .patch(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    isAdmin,
    validate(removeBanSchema),
    removeBan,
  );

router.route("/ban/active").get(isAuthenticated, getBan);

export default router;
