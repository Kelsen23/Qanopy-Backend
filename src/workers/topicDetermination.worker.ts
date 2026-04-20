import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import connectMongoDB from "../config/mongodb.config.js";

import convertQuestionToEmbeddingText from "../utils/convertQuestionToEmbeddingText.util.js";
import normalizeText from "../utils/normalizeText.util.js";

import { makeJobId } from "../utils/makeJobId.util.js";

import QuestionVersion from "../models/questionVersion.model.js";
import Question from "../models/question.model.js";

import determineTopicStatusService from "../services/question/topicDetermination.service.js";
import routeNotification from "../services/notification/routeNotification.service.js";

import contentPipelineRouter from "../queues/contentPipelineRouter.queue.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);

  const worker = new Worker(
    "topicDeterminationQueue",
    async (job) => {
      const { questionId, version } = job.data;

      const qv = await QuestionVersion.findOne({ questionId, version })
        .select("title body tags")
        .lean();

      if (!qv) return;

      const locked = await Question.findOneAndUpdate(
        {
          _id: questionId,
          currentVersion: version,
          topicStatus: "PENDING",
        },
        { $set: { topicStatus: "PROCESSING" } },
        { new: true },
      );

      if (!locked) return;

      const text = convertQuestionToEmbeddingText(
        normalizeText(qv.title as string),
        normalizeText(qv.body as string),
        Array.isArray(qv.tags) ? qv.tags : [],
      );

      let finalStatus: "VALID" | "OFF_TOPIC";

      try {
        const res = await determineTopicStatusService(text);
        finalStatus = res === "VALID" ? "VALID" : "OFF_TOPIC";
      } catch (err) {
        await Question.updateOne(
          { _id: questionId, currentVersion: version },
          { $set: { topicStatus: "PENDING" } },
        );
        throw err;
      }

      const updated = await Question.updateOne(
        {
          _id: questionId,
          currentVersion: version,
          topicStatus: "PROCESSING",
        },
        {
          $set: {
            topicStatus: finalStatus,
            embeddingStatus: "NONE",
            similarQuestionsStatus: "NONE",
          },
        },
      );

      if (updated.modifiedCount === 0) return;

      if (finalStatus === "VALID") {
        await contentPipelineRouter.add(
          "QUESTION",
          { contentId: questionId, version },
          {
            jobId: makeJobId("contentPipelineRoute", questionId, version),
            removeOnComplete: true,
            removeOnFail: false,
          },
        );

        await routeNotification({
          recipientId: locked.userId as string,
          event: "AI_SUGGESTION_UNLOCKED",
          target: {
            entityType: "QUESTION",
            entityId: questionId,
          },
          meta: {
            topicStatus: finalStatus,
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
  console.error("Failed to start topic determination worker:", error);
  process.exit(1);
});
