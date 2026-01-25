import { Worker } from "bullmq";
import {
  getRedisCacheClient,
  redisMessagingClientConnection,
} from "../config/redis.config.js";

import connectMongoDB from "../config/mongodb.config.js";

import QuestionVersion from "../models/questionVersion.model.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting question versioning worker...");

  new Worker(
    "questionVersioningQueue",
    async (job) => {
      const { questionId, title, body, tags, editorId } = job.data;
      let { basedOnVersion } = job.data;

      const latestVersion = await QuestionVersion.findOne({ questionId }).sort({
        version: -1,
      }).lean();

      const nextVersion = latestVersion ? Number(latestVersion.version) + 1 : 1;

      if (!basedOnVersion)
        basedOnVersion = latestVersion ? Number(latestVersion.version) : 1;

      const activeVersion = await QuestionVersion.findOne(
        { questionId, isActive: true },
        { version: 1 },
      ).lean();

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
        version: nextVersion,
        basedOnVersion,
        isActive: true,
      });

      if (activeVersion) {
        await getRedisCacheClient().del(
          `question:${questionId}`,
          `v:${activeVersion.version}:question:${questionId}`,
        );
      }
    },
    { connection: redisMessagingClientConnection, concurrency: 5 },
  );
}

startWorker().catch((error) => {
  console.error("Failed to start question versioning worker:", error);
  process.exit(1);
});
