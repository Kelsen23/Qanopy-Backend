import { Worker } from "bullmq";
import { fileURLToPath } from "node:url";

import { isExpiredUnverifiedLocalUser } from "../services/auth/unverifiedAccountCleanup.service.js";

import { redisMessagingClientConnection } from "../config/redis.config.js";
import prisma from "../config/prisma.config.js";
import transporter from "../config/nodemailer.config.js";

const workerFilePath = fileURLToPath(import.meta.url);

type EmailJobPurpose =
  | "VERIFY_EMAIL"
  | "RESET_PASSWORD"
  | "CHANGE_EMAIL"
  | "PASSWORD_RESET_COMPLETED"
  | "PASSWORD_CHANGED"
  | "EMAIL_CHANGED";

type EmailJobData = {
  email: string;
  subject: string;
  htmlContent: string;
  userId?: string;
  purpose?: EmailJobPurpose;
  otpHash?: string;
};

type EmailWorkerUser = {
  id: string;
  email: string;
  createdAt: Date;
  authProvider: "LOCAL" | "GOOGLE" | "GITHUB";
  isVerified: boolean;
  isDeleted: boolean;
  otpExpireAt: Date | null;
  resetPasswordOtpExpireAt: Date | null;
  emailChangePendingEmail: string | null;
  emailChangeOtpExpireAt: Date | null;
  emailChangeOtp: string | null;
};

const shouldSkipForPurpose = async (
  user: EmailWorkerUser,
  purpose?: EmailJobPurpose,
  email?: string,
  otpHash?: string,
) => {
  if (user.isDeleted) return true;

  if (
    purpose === "PASSWORD_RESET_COMPLETED" ||
    purpose === "PASSWORD_CHANGED" ||
    purpose === "EMAIL_CHANGED"
  ) {
    return false;
  }

  if (purpose === "VERIFY_EMAIL") {
    if (user.authProvider !== "LOCAL") return true;

    return (
      user.isVerified ||
      isExpiredUnverifiedLocalUser(user) ||
      !user.otpExpireAt ||
      user.otpExpireAt < new Date(Date.now())
    );
  }

  if (purpose === "RESET_PASSWORD") {
    if (user.authProvider !== "LOCAL") return true;

    return (
      !user.resetPasswordOtpExpireAt ||
      user.resetPasswordOtpExpireAt < new Date(Date.now())
    );
  }

  if (purpose === "CHANGE_EMAIL") {
    if (
      !user.emailChangePendingEmail ||
      !user.emailChangeOtpExpireAt ||
      !user.emailChangeOtp
    ) {
      return true;
    }

    if (user.emailChangePendingEmail !== email) {
      return true;
    }

    if (user.emailChangeOtpExpireAt < new Date(Date.now())) {
      return true;
    }

    return otpHash !== user.emailChangeOtp;
  }

  return false;
};

async function startEmailWorker() {
  const worker = new Worker(
    "emailQueue",
    async (job) => {
      const { email, subject, htmlContent, userId, purpose, otpHash } =
        job.data as EmailJobData;

      if (userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            createdAt: true,
            authProvider: true,
            isVerified: true,
            isDeleted: true,
            otpExpireAt: true,
            resetPasswordOtpExpireAt: true,
            emailChangePendingEmail: true,
            emailChangeOtpExpireAt: true,
            emailChangeOtp: true,
          },
        });

        if (!user) return;

        if (await shouldSkipForPurpose(user, purpose, email, otpHash)) return;
      }

      await transporter.sendMail({
        from: `'Qanopy' <${process.env.QANOPY_EMAIL}>`,
        to: email,
        subject,
        html: htmlContent,
      });
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 20,
      limiter: {
        max: 20,
        duration: 1000,
      },
    },
  );

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  worker.on("error", (err) => {
    console.error("Worker crashed:", err);
  });

  return worker;
}

const isDirectRun = process.argv[1] === workerFilePath;

if (isDirectRun) {
  void startEmailWorker().catch((error) => {
    console.error("Failed to start email worker:", error);
    process.exit(1);
  });
}

export { startEmailWorker };
