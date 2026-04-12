import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import convertQuestionToEmbeddingText from "../utils/convertQuestionToEmbeddingText.util.js";
import normalizeText from "../utils/normalizeText.util.js";

import { makeJobId } from "../utils/makeJobId.util.js";

import QuestionVersion from "../models/questionVersion.model.js";
import Question from "../models/question.model.js";

import connectMongoDB from "../config/mongodb.config.js";

import generateEmbedding from "../services/question/generateEmbedding.service.js";

import contentPipelineRouter from "../queues/contentPipelineRouter.queue.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting embedding worker...");

  const worker = new Worker(
    "questionEmbeddingQueue",
    async (job) => {
      const { questionId, version } = job.data;

      const versionDoc = await QuestionVersion.findOne({
        questionId,
        version,
      }).select("_id title body tags embeddingStatus topicStatus isActive");

      if (!versionDoc) return;

      if (!versionDoc.isActive) return;
      if (versionDoc.topicStatus !== "VALID") return;
      if (!["NONE", "PENDING"].includes(String(versionDoc.embeddingStatus)))
        return;

      const locked = await QuestionVersion.findOneAndUpdate(
        {
          _id: versionDoc._id,
          embeddingStatus: { $in: ["NONE", "PENDING"] },
          topicStatus: "VALID",
        },
        {
          $set: { embeddingStatus: "PROCESSING" },
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

      const embedding = await generateEmbedding(text);

      const updatedVersion = await QuestionVersion.findOneAndUpdate(
        {
          _id: versionDoc._id,
          embeddingStatus: "PROCESSING",
        },
        {
          $set: {
            embedding,
            embeddingStatus: "READY",
          },
        },
        { new: true },
      );

      if (!updatedVersion) return;

      const result = await Question.updateOne(
        {
          _id: questionId,
          currentVersion: version,
        },
        {
          embedding,
          embeddingStatus: "READY",
        },
      );

      if (result.matchedCount === 0) return;

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
	    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 10,
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
  console.error("Failed to start embedding worker:", error);
  process.exit(1);
});
