import { Worker } from "bullmq";
import {
  getRedisCacheClient,
  redisMessagingClientConnection,
} from "../config/redis.config.js";

import connectMongoDB from "../config/mongodb.config.js";

import generateQuestionSuggestionService from "../services/question/generateQuestionSuggestion.service.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting ai suggestion worker...");

  new Worker(
    "aiSuggestionQueue",
    async (job) => {
      const { userId, questionId, version } = job.data;
      try {
        await generateQuestionSuggestionService(job.data);
      } catch (error) {
        console.error("Failed to process ai suggestion job:", error);
        throw error;
      } finally {
        await getRedisCacheClient().del(
          `aiSuggestion:pending:${userId}:${questionId}:${version}`,
        );
      }
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 5,
      limiter: { max: 5, duration: 1000 },
    },
  );
}

startWorker().catch((error) => {
  console.error("Failed to start ai suggestion worker:", error);
  process.exit(1);
});
