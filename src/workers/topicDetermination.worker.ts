import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import convertQuestionToEmbeddingText from "../utils/convertQuestionToEmbeddingText.util.js";
import normalizeText from "../utils/normalizeText.util.js";

import { makeJobId } from "../utils/makeJobId.util.js";

import QuestionVersion from "../models/questionVersion.model.js";
import Question from "../models/question.model.js";

import connectMongoDB from "../config/mongodb.config.js";

import determineTopicStatusService from "../services/question/topicDetermination.service.js";

import contentPipelineRouter from "../queues/contentPipelineRouter.queue.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting topic determination worker...");

  const worker = new Worker(
    "topicDeterminationQueue",
    async (job) => {
      const { questionId, version } = job.data;

      const foundQuestionVersion = await QuestionVersion.findOne({
        questionId,
        version,
      }).select("_id title body tags");

      if (!foundQuestionVersion) return;

      const foundQuestion = await Question.findOne({
        _id: questionId,
        currentVersion: version,
        isActive: true,
        isDeleted: false,
        moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
      }).select("_id");

      if (!foundQuestion) return;

      const tags = Array.isArray(foundQuestionVersion.tags)
        ? foundQuestionVersion.tags
        : [];

      const text = convertQuestionToEmbeddingText(
        normalizeText(foundQuestionVersion.title as string),
        normalizeText(foundQuestionVersion.body as string),
        tags,
      );

      const res = await determineTopicStatusService(text);

      const finalStatus = res === "VALID" ? "VALID" : "OFF_TOPIC";

      const updatedQuestion = await Question.updateOne(
        {
          _id: questionId,
          currentVersion: version,
        },
        { topicStatus: finalStatus },
      );

      if (!updatedQuestion) return;

      if (updatedQuestion.matchedCount === 0) return;

      if (finalStatus === "VALID") {
        await contentPipelineRouter.add(
          "QUESTION",
          {
            contentId: questionId,
            version,
          },
          {
            jobId: makeJobId("contentPipelineRoute", questionId, version),
            removeOnComplete: true,
            removeOnFail: false,
          },
        );
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
