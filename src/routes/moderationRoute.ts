import express from "express";

import {
  createReport,
  getReports,
  moderateReport,
  getBan,
  activateAccount,
  getWarnings,
  acknowledgeWarning,
} from "../controllers/moderationController.js";

import {
  moderateReportSchema,
  reportSchema,
} from "../validations/moderation.schema.js";

import { createReportLimiterMiddleware } from "../middlewares/rateLimiters/moderationRateLimiters.js";

import isAuthenticated, {
  requireActiveUser,
  isVerified,
  isAdmin,
} from "../middlewares/authMiddleware.js";

import validate from "../middlewares/validateMiddleware.js";

const router = express.Router();

router
  .route("/report/create")
  .post(
    createReportLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    validate(reportSchema),
    createReport,
  );

router
  .route("/reports")
  .get(isAuthenticated, isVerified, requireActiveUser, isAdmin, getReports);

router.route("/ban").get(isAuthenticated, getBan);
router.route("/warnings").get(isAuthenticated, requireActiveUser, getWarnings);

router.route("/account/activate").patch(isAuthenticated, activateAccount);

router
  .route("/warnings/:id/seen")
  .patch(isAuthenticated, requireActiveUser, acknowledgeWarning);

router
  .route("/report/:id/moderate")
  .patch(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    isAdmin,
    validate(moderateReportSchema),
    moderateReport,
  );

export default router;
