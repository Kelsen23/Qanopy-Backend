import express from "express";

import {
  createReport,
  moderate,
  getBan,
  activateAccount,
  moderateContentImage,
} from "../controllers/moderation.controller.js";

import {
  moderateSchema,
  reportSchema,
  moderateContentImageSchema,
} from "../validations/moderation.schema.js";

import {
  createReportLimiterMiddleware,
  moderateContentImageLimiterMiddleware,
} from "../middlewares/rate-limiters/moderation.rate-limiters.js";

import isAuthenticated, {
  requireActiveUser,
  isVerified,
  isAdmin,
} from "../middlewares/auth.middleware.js";

import validate from "../middlewares/validate.middleware.js";

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
  .route("/report/:id/moderate")
  .patch(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    isAdmin,
    validate(moderateSchema),
    moderate,
  );

router.route("/ban").get(isAuthenticated, getBan);

router.route("/account/activate").patch(isAuthenticated, activateAccount);

router
  .route("/content/moderate/image")
  .post(
    moderateContentImageLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    validate(moderateContentImageSchema),
    moderateContentImage,
  );

export default router;
