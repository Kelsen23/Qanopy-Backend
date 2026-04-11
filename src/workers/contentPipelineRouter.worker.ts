import { Worker } from "bullmq";

import { redisMessagingClientConnection } from "../config/redis.config.js";
import connectMongoDB from "../config/mongodb.config.js";

import QuestionVersion from "../models/questionVersion.model.js";

import contentModerationQueue from "../queues/contentModeration.queue.js";
import topicDeterminationQueue from "../queues/topicDetermination.queue.js";
import questionEmbeddingQueue from "../queues/questionEmbedding.queue.js";
import similarQuestionsQueue from "../queues/similarQuestions.queue.js";

import { makeJobId } from "../utils/makeJobId.util.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Content pipeline router worker started...");

  const worker = new Worker(
    "contentPipelineRouter",
    async (job) => {
      const { questionId, version } = job.data;

      const foundQuestionVersion = await QuestionVersion.findOne({
        questionId,
        version,
      }).select(
        "moderationStatus topicStatus embeddingStatus similarQuestionIds",
      );

      if (!foundQuestionVersion) return;

      if (foundQuestionVersion.moderationStatus === "PENDING") {
        return await contentModerationQueue.add(
          "QUESTION",
          {
            contentId: questionId,
            version,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId(
              "contentModeration",
              "QUESTION",
              questionId,
              version,
            ),
          },
        );
      } else if (foundQuestionVersion.moderationStatus === "REJECTED") {
        return;
      } else if (foundQuestionVersion.topicStatus === "PENDING") {
        return await topicDeterminationQueue.add(
          "QUESTION",
          {
            questionId,
            version,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId(
              "topicDetermination",
              "QUESTION",
              questionId,
              version,
            ),
          },
        );
      } else if (
        foundQuestionVersion.topicStatus === "VALID" &&
        ["NONE", "PENDING"].includes(String(foundQuestionVersion.embeddingStatus))
      ) {
        return await questionEmbeddingQueue.add(
          "EMBED_QUESTION",
          {
            questionId,
            version,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId(
              "questionEmbedding",
              "EMBED_QUESTION",
              questionId,
              version,
            ),
          },
        );
      } else if (
        foundQuestionVersion.topicStatus === "VALID" &&
        foundQuestionVersion.embeddingStatus === "READY" &&
        Array.isArray(foundQuestionVersion.similarQuestionIds) &&
        (foundQuestionVersion.similarQuestionIds as Array<string>).length === 0
      ) {
        return await similarQuestionsQueue.add(
          "SEARCH_SIMILAR_QUESTIONS",
          {
            questionId,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId("similarQuestions", questionId),
          },
        );
      }
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 25,
      limiter: { max: 25, duration: 5000 },
    },
  );

  worker.on("completed", (job) => {
    console.log(`Router job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Router job ${job?.id} failed:`, err);
  });

  worker.on("error", (err) => {
    console.error("Router worker crashed:", err);
  });
}

startWorker().catch((err) => {
  console.error("Failed to start router worker:", err);
  process.exit(1);
});
