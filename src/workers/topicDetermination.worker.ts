import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import convertQuestionToEmbeddingText from "../utils/convertQuestionToEmbeddingText.util.js";
import normalizeText from "../utils/normalizeText.util.js";

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

      const versionDoc = await QuestionVersion.findOne({
        questionId,
        version,
      }).select("_id title body tags topicStatus isActive");

      if (!versionDoc) return;

      const locked = await QuestionVersion.findOneAndUpdate(
        {
          _id: versionDoc._id,
          topicStatus: "PENDING",
        },
        {
          topicStatus: "PROCESSING",
        },
        { new: true },
      );

      if (!locked) return;

      const tags = Array.isArray(versionDoc.tags) ? versionDoc.tags : [];

      const text = convertQuestionToEmbeddingText(
        normalizeText(versionDoc.title as string),
        normalizeText(versionDoc.body as string),
        tags,
      );

      const res = await determineTopicStatusService(text);

      const finalStatus = res === "VALID" ? "VALID" : "OFF_TOPIC";

      const updated = await QuestionVersion.findOneAndUpdate(
        {
          _id: versionDoc._id,
          topicStatus: "PROCESSING",
        },
        {
          topicStatus: finalStatus,
        },
        { new: true },
      );

      if (!updated) return;

      const result = await Question.updateOne(
        { _id: questionId, currentVersion: version },
        { topicStatus: finalStatus },
      );

      if (result.matchedCount === 0) return;

      if (finalStatus === "VALID") {
        await contentPipelineRouter.add(
          "CONTENT_PIPELINE_ROUTE",
          {
            questionId,
            version,
          },
          {
            jobId: `route:${questionId}:${version}`,
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
