import { Worker } from "bullmq";

import { startKnowledgeBaseCrawlScheduleReconciliation } from "../../services/knowledgeBase/knowledgeBaseCrawlScheduleReconciliation.service.js";
import { crawlKnowledgeBaseSource } from "../../services/knowledgeBase/worker/knowledgeBaseCrawl.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

const startWorker = async () => {
  await connectMongoDB(process.env.MONGO_URI as string);
  await startKnowledgeBaseCrawlScheduleReconciliation();

  const handlers = createWorkerEventHandlers("knowledgeBaseCrawl");
  const worker = new Worker(
    "knowledgeBaseCrawlQueue",
    async (job) => {
      const sourceId = job.data?.sourceId;

      if (typeof sourceId !== "string" || !sourceId) {
        throw new Error("Knowledge Base crawl job requires a sourceId");
      }

      return crawlKnowledgeBaseSource(sourceId);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 1,
    },
  );

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);
};

startWorker().catch((error) => {
  console.error("Failed to start Knowledge Base crawl worker:", error);
  process.exit(1);
});
