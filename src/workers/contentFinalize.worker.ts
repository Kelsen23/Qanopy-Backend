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

import questionVersioningQueue from "../queues/questionVersioning.queue.js";
import contentModerationQueue from "../queues/contentModeration.queue.js";

import publishSocketEvent from "../utils/publishSocketEvent.util.js";
import { makeJobId } from "../utils/makeJobId.util.js";

import crypto from "crypto";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting content image finalization worker...");

  const worker = new Worker(
    "contentFinalizeQueue",
    async (job) => {
      const entityType = job.name;
      const { userId, entityId } = job.data;

      let entity;
      if (entityType === "QUESTION") {
        entity = await Question.findById(entityId);
      } else if (entityType === "ANSWER") {
        entity = await Answer.findById(entityId).select("body");
      } else {
        throw new HttpError("Invalid job type", 500);
      }

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
          `Your freshly created ${entityType.toLowerCase()} exceeds the image limit of ${IMAGE_LIMIT}. Some temporary images may soon be removed. Please reduce image count.`,
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

        const newKey = `content/${entityType.toLowerCase()}s/${userId}/${entityId}/${crypto.randomUUID()}.png`;

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

      if (entityType === "QUESTION") {
        await getRedisCacheClient().del(`question:${entity._id}`);

        await questionVersioningQueue.add(
          "CREATE_NEW_QUESTION_VERSION",
          {
            questionId: entity._id,
            userId: entity.userId,
            title: entity.title,
            body: newBody,
            tags: entity.tags,
            moderationStatus: entity.moderationStatus,
            moderationUpdatedAt: entity.moderationUpdatedAt,
            topicStatus: entity.topicStatus,
            embeddingStatus: entity.embeddingStatus,
            basedOnVersion: null,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId(
              "questionVersioning",
              "CREATE_NEW_QUESTION_VERSION",
              job.id,
            ),
          },
        );
      } else {
        await contentModerationQueue.add(
          "ANSWER",
          { contentId: entityId },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId("contentModeration", "ANSWER", entityId),
          },
        );

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
