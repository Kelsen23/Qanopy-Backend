import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import connectMongoDB from "../config/mongodb.config.js";

import UserInterest from "../models/userInterest.model.js";

import type { UserInterestAction } from "../utils/queueUserInterest.util.js";

const actionScores = {
  VIEW: 1,
  UPVOTE: 3,
  ANSWER: 5,
} as const;

function isUserInterestAction(action: string): action is UserInterestAction {
  return action in actionScores;
}

async function applyInterestScore(
  userId: string,
  tag: string,
  score: number,
) {
  const existingTagResult = await UserInterest.updateOne(
    { userId, "interests.tag": tag },
    {
      $inc: { "interests.$.score": score },
    },
  );

  if (existingTagResult.matchedCount > 0) return;

  await UserInterest.updateOne(
    { userId },
    {
      $setOnInsert: { userId },
      $push: {
        interests: {
          tag,
          score,
        },
      },
    },
    { upsert: true },
  );
}

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);

  const worker = new Worker(
    "userInterestQueue",
    async (job) => {
      const action = job.name;

      if (!isUserInterestAction(action))
        throw new Error(`Unsupported user interest action: ${action}`);

      const { userId, tags } = job.data as {
        userId: string;
        tags: string[];
      };
      const score = actionScores[action];
      const uniqueTags = [...new Set(tags)];

      for (const tag of uniqueTags) {
        await applyInterestScore(userId, tag, score);
      }
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 5,
      limiter: { max: 20, duration: 1000 },
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
}

startWorker().catch((error) => {
  console.error("Failed to start user interest worker:", error);
  process.exit(1);
});
