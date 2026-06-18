import { Worker } from "bullmq";
import {
  getRedisCacheClient,
  redisMessagingClientConnection,
} from "../config/redis.config.js";

import connectMongoDB from "../config/mongodb.config.js";

import { cloudfrontDomain } from "../config/s3.config.js";

import publishSocketEvent from "../utils/publishSocketEvent.util.js";

import { makeJobId } from "../utils/makeJobId.util.js";

import getObjectKeyFromUrl from "../utils/getObjectKeyFromUrl.util.js";
import moveS3Object from "../utils/moveS3Object.util.js";

import Question from "../models/question.model.js";
import Answer from "../models/answer.model.js";

import questionVersioningQueue from "../queues/questionVersioning.queue.js";

import crypto from "crypto";
import contentPipelineRouter from "../queues/contentPipelineRouter.queue.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting content image finalization worker...");

  const worker = new Worker(
    "contentFinalizeQueue",
    async (job) => {
      const entityType = job.name;
      const {
        userId,
        entityId,
        version,
        basedOnVersion,
        title,
        body,
        tags,
        moderationStatus,
        moderationUpdatedAt,
        topicStatus,
        embeddingStatus,
      } = job.data;

      let entity;
      if (entityType === "QUESTION") {
        entity = await Question.findById(entityId).select(
          "body currentVersion userId title tags moderationStatus moderationUpdatedAt topicStatus embeddingStatus",
        );
      } else if (entityType === "ANSWER") {
        entity = await Answer.findById(entityId).select("body");
      } else {
        throw new Error("Invalid job type");
      }

      if (!entity) throw new Error("Content not found");

      let newBody =
        entityType === "QUESTION" ? String(body ?? "") : (entity.body as string);

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

      if (
        entityType !== "QUESTION" &&
        newBody !== entity.body
      ) {
        entity.body = newBody;
        await entity.save();
      }

      if (entityType === "QUESTION") {
        if (
          Number((entity as { currentVersion?: number }).currentVersion) ===
            Number(version) &&
          newBody !== entity.body
        ) {
          entity.body = newBody;
          await entity.save();
        }

        await getRedisCacheClient().del(`question:${entity._id}`);

        await questionVersioningQueue.add(
          "CREATE_NEW_QUESTION_VERSION",
          {
            questionId: entity._id,
            intendedVersion: version,
            basedOnVersion,
            userId,
            title,
            body: newBody,
            tags,
            moderationStatus,
            moderationUpdatedAt,
            topicStatus,
            embeddingStatus,
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
        await contentPipelineRouter.add("ANSWER", { contentId: entityId });
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
