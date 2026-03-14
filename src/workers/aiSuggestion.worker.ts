import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import connectMongoDB from "../config/mongodb.config.js";

import generateQuestionSuggestion from "../services/question/generateQuestionSuggestion.service.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting ai suggestion worker...");

  new Worker(
    "aiSuggestionQueue",
    async (job) => {
      try {
        await generateQuestionSuggestion(job.data);
      } catch (error) {
        console.error("Failed to process ai suggestion job:", error);
        throw error;
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
