import { Worker } from "bullmq";

import { redisMessagingClientConnection } from "../config/redis.config.js";
import connectMongoDB from "../config/mongodb.config.js";

import questionPipelineRouterService from "../services/question/pipelineRouters/questionPipelineRouter.service.js";
import answerPipelineRouterService from "../services/question/pipelineRouters/answerPipelineRouter.service.js";
import replyPipelineRouterService from "../services/question/pipelineRouters/replyPipelineRouter.service.js";
import aiAnswerFeedbackPipelineRouterService from "../services/question/pipelineRouters/aiAnswerFeedbackPipelineRouter.service.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Content pipeline router worker started...");

  const worker = new Worker(
    "contentPipelineRouter",
    async (job) => {
      const contentType = job.name as
        | "QUESTION"
        | "ANSWER"
        | "REPLY"
        | "AI_ANSWER_FEEDBACK";
      const { contentId, version } = job.data;

      switch (contentType) {
        case "QUESTION":
          await questionPipelineRouterService(contentId, version);
          break;
        case "ANSWER":
          await answerPipelineRouterService(contentId);
          break;
        case "REPLY":
          await replyPipelineRouterService(contentId);
          break;
        case "AI_ANSWER_FEEDBACK":
          await aiAnswerFeedbackPipelineRouterService(contentId);
          break;
        default:
          break;
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
