import { Worker } from "bullmq";
import {
  getRedisCacheClient,
  redisMessagingClientConnection,
} from "../config/redis.config.js";

import { clearAnswerCache } from "../utils/clearCache.util.js";

import { cloudfrontDomain } from "../config/s3.config.js";

import HttpError from "../utils/httpError.util.js";

import getObjectKeyFromUrl from "../utils/getObjectKeyFromUrl.util.js";
import moveS3Object from "../utils/moveS3Object.util.js";

import connectMongoDB from "../config/mongodb.config.js";

import Question from "../models/question.model.js";
import Answer from "../models/answer.model.js";

import crypto from "crypto";

import questionVersioningQueue from "../queues/questionVersioning.queue.js";

import publishSocketEvent from "../utils/publishSocketEvent.util.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting content image finalization worker...");

  const worker = new Worker(
    "contentImageFinalizeQueue",
    async (job) => {
      const { userId, entityType, entityId } = job.data;

      const entity =
        entityType === "question"
          ? await Question.findById(entityId)
          : await Answer.findById(entityId).select("body");

      if (!entity) throw new HttpError("Content not found", 404);

      let newBody = entity.body as string;

      const domainWithoutProtocol = (cloudfrontDomain as string)
        .replace(/^https?:\/\//, "")
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const TEMP_IMAGE_REGEX = new RegExp(
        `!\\[[^\\]]*\\]\\((https?:\\/\\/${domainWithoutProtocol}/temp/content/${userId}/[a-zA-Z0-9/_\\-]+\\.png)\\)`,
        "gi",
      );

      const markdownReplacements = new Map<string, string>();
      const tempImageUrls: string[] = [];

      let match: RegExpExecArray | null;
      while ((match = TEMP_IMAGE_REGEX.exec(newBody)) !== null) {
        const url = match[1];
        tempImageUrls.push(url);
      }

      const IMAGE_LIMIT = 10;
      if (tempImageUrls.length > IMAGE_LIMIT) {
        await publishSocketEvent(
          userId,
          `Your freshly created ${entityType} exceeds the image limit of ${IMAGE_LIMIT}. Some temporary images may soon be removed. Please reduce image count.`,
          { entityId, entityType },
        );
      }

      const urlsToProcess = tempImageUrls.slice(0, IMAGE_LIMIT);

      for (const url of urlsToProcess) {
        const fullMarkdownMatch = newBody.match(
          new RegExp(
            `!\\[[^\\]]*\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`,
          ),
        )?.[0];

        if (!fullMarkdownMatch) continue;

        const fromKey = getObjectKeyFromUrl(url);
        if (!fromKey) continue;

        const newKey = `content/${entityType}s/${userId}/${entityId}/${crypto.randomUUID()}.png`;

        await moveS3Object(fromKey, newKey);

        const newUrl = `${cloudfrontDomain}/${newKey}`;
        const newMarkdown = fullMarkdownMatch.replace(url, newUrl);

        markdownReplacements.set(fullMarkdownMatch, newMarkdown);
      }

      for (const [oldMarkdown, newMarkdown] of markdownReplacements) {
        newBody = newBody.replaceAll(oldMarkdown, newMarkdown);
      }

      if (newBody !== entity.body) {
        entity.body = newBody;
        await entity.save();
      }

      if (entityType === "question") {
        await getRedisCacheClient().del(`question:${entity._id}`);

        await questionVersioningQueue.add(
          "createNewQuestionVersion",
          {
            questionId: entity._id,
            title: entity.title,
            body: newBody,
            tags: entity.tags,
            editorId: entity.userId,
            basedOnVersion: null,
          },
          { removeOnComplete: true, removeOnFail: false },
        );
      } else {
        await clearAnswerCache(entity.questionId as string);
      }
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 5,
      limiter: {
        max: 20,
        duration: 1000,
      },
    },
  );

  worker.on("completed", (job) => console.log(`Job ${job.id} completed`));
  worker.on("failed", (job, err) =>
    console.error(`Job ${job?.id} failed:`, err),
  );
  worker.on("error", (err) => console.error("Worker crashed:", err));
}

startWorker().catch((error) => {
  console.error("Failed to start content image finalization worker:", error);
  process.exit(1);
});
