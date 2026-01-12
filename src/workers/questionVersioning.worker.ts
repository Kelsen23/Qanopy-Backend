import { Worker } from "bullmq";
import {
  redisCacheClient,
  redisMessagingClientConnection,
} from "../config/redis.config.js";

import connectMongoDB from "../config/mongodb.config.js";

import QuestionVersion from "../models/questionVersion.model.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting moderation worker...");

  new Worker(
    "questionVersioningQueue",
    async (job) => {
      const {
        questionId,
        title,
        body,
        tags,
        editorId,
        version,
        basedOnVersion,
      } = job.data;

      const activeVersion = await QuestionVersion.findOne(
        { questionId, isActive: true },
        { version: 1 },
      );

      await QuestionVersion.updateMany(
        { questionId, isActive: true },
        { $set: { isActive: false } },
      );

      await QuestionVersion.create({
        questionId,
        title,
        body,
        tags,
        editedBy: "USER",
        editorId,
        version,
        basedOnVersion,
        isActive: true,
      });

      if (activeVersion) {
        await redisCacheClient.del(
          `question:${questionId}`,
          `v:${activeVersion.version}:question:${questionId}`,
        );
      }
    },
    { connection: redisMessagingClientConnection, concurrency: 5 },
  );
}

startWorker().catch((error) => {
  console.error("Failed to start moderation worker:", error);
  process.exit(1);
});
