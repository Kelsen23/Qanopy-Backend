import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import transporter from "../config/nodemailer.config.js";

new Worker(
  "emailQueue",
  async (job) => {
    const { email, subject, htmlContent } = job.data;

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
