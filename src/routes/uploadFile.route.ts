import express from "express";
import multer from "multer";

import { changeProfilePicture } from "../controllers/uploadFile.controller.js";

import isAuthenticated, {
  requireActiveUser,
  isVerified,
} from "../middlewares/auth.middleware.js";

import { uploadProfilePictureLimiterMiddleware } from "../middlewares/rate-limiters/uploadFile.rate-limiters.js";

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router
  .route("/profilePicture")
  .post(
    uploadProfilePictureLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    upload.single("profilePicture"),
    changeProfilePicture,
  );

export default router;
