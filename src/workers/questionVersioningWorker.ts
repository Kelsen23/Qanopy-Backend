import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.js";

import connectMongoDB from "../config/mongoDB.js";

import QuestionVersion from "../models/questionVersionModel.js";

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

      await QuestionVersion.updateMany(
        { questionId, isActive: true },
        { isActive: false },
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
    },
    { connection: redisMessagingClientConnection, concurrency: 5 },
  );
}

startWorker().catch((error) => {
  console.error("Failed to start moderation worker:", error);
  process.exit(1);
});
