import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import prisma from "../config/prisma.config.js";

import transporter from "../config/nodemailer.config.js";

import { isExpiredUnverifiedLocalUser } from "../services/auth/unverifiedAccountCleanup.service.js";

const worker = new Worker(
  "emailQueue",
  async (job) => {
    const { email, subject, htmlContent, userId, purpose } = job.data;

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
        },
      });

      if (!user) return;

      if (user.isDeleted || user.authProvider !== "LOCAL") return;

      if (
        purpose === "VERIFY_EMAIL" &&
        (user.isVerified || isExpiredUnverifiedLocalUser(user))
      ) {
        return;
      }
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
