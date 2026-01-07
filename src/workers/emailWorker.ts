import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.js";

import transporter from "../config/nodemailer.js";

new Worker(
  "emailQueue",
  async (job) => {
    const { email, subject, htmlContent } = job.data;

    await transporter.sendMail({
      from: `'QANOPY' <${process.env.QANOPY_EMAIL}>`,
      to: email,
      subject,
      html: htmlContent,
    });
  },
  { connection: redisMessagingClientConnection, concurrency: 20 },
);
