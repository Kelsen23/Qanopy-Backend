import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import connectMongoDB from "../config/mongodb.config.js";

import mongoose from "mongoose";

import Question from "../models/question.model.js";

import queueNotification from "../utils/queueNotification.util.js";
import publishSocketEvent from "../utils/publishSocketEvent.util.js";

import { getQuestionSessionSockets } from "../services/redis/questionSession.service.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting similar questions worker...");

  const worker = new Worker(
    "similarQuestionsQueue",
    async (job) => {
      const { questionId, version } = job.data;
      const id = new mongoose.Types.ObjectId(questionId);

      const locked = await Question.findOneAndUpdate(
        {
          _id: id,
          currentVersion: version,
          topicStatus: "VALID",
          embeddingStatus: "READY",
          similarQuestionsStatus: "NONE",
        },
        { $set: { similarQuestionsStatus: "PROCESSING" } },
        { new: true },
      );

      if (!locked) return;

      const embedding = locked.embedding as number[];
      if (!Array.isArray(embedding) || embedding.length === 0) return;

      const results = await Question.aggregate([
        {
          $vectorSearch: {
            index: "semantic_search_vector_index",
            path: "embedding",
            queryVector: embedding,
            numCandidates: 150,
            limit: 20,
          },
        },

        {
          $project: {
            _id: 1,
            score: { $meta: "vectorSearchScore" },
            topicStatus: 1,
            isActive: 1,
            isDeleted: 1,
          },
        },
        
        {
          $match: {
            _id: { $ne: id },
            isActive: true,
            isDeleted: false,
            moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
            topicStatus: "VALID",
          },
        },
      ]);

      const similarQuestionIds = results
        .filter((r) => r.score >= 0.75)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((r) => r._id);

      await Question.updateOne(
        { _id: id, similarQuestionsStatus: "PROCESSING" },
        {
          $set: {
            similarQuestionIds,
            similarQuestionsStatus: "READY",
          },
        },
      );

      const sockets = await getQuestionSessionSockets(questionId);

      if (sockets.length) {
        await publishSocketEvent(
          locked.userId as string,
          "similarQuestionsReady",
          {
            questionId,
            version,
            similarQuestionIds,
          },
        );
      } else {
        await queueNotification({
          userId: locked.userId as string,
          type: "SIMILAR_QUESTIONS",
          referenceId: questionId,
          meta: {
            count: similarQuestionIds.length,
            previewIds: similarQuestionIds.slice(0, 3),
          },
        });
      }
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
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
  console.error("Failed to start similar questions worker:", error);
  process.exit(1);
});
