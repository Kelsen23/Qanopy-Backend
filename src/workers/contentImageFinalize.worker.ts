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

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting content image finalization worker...");

  new Worker(
    "contentImageFinalizeQueue",
    async (job) => {
      const { entityType, entityId } = job.data;

      const entity =
        entityType === "question"
          ? await Question.findById(entityId)
          : await Answer.findById(entityId).select("body");

      if (!entity) throw new HttpError("Content not found", 404);

      let newBody = entity.body as string;

      const TEMP_IMAGE_REGEX =
        /https:\/\/[^/]+\/temp\/content\/[a-zA-Z0-9/_-]+\.(png|jpg|jpeg|webp)/gi;
      const tempImageUrls = new Set(
        (entity.body as string).match(TEMP_IMAGE_REGEX) || [],
      );

      for (const url of tempImageUrls) {
        try {
          const fromKey = getObjectKeyFromUrl(url as string);

          const newKey = `content/${entityType}s/${entityId}/${crypto.randomUUID()}.png`;

          await moveS3Object(fromKey, newKey);

          const newUrl = `${cloudfrontDomain}/${newKey}`;

          newBody = newBody.replaceAll(url, newUrl);
        } catch (error) {
          console.error("Failed to process image", { url, error });
        }
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
      } else await clearAnswerCache(entity.questionId as string);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 1,
    },
  );
}

startWorker().catch((error) => {
  console.error("Failed to start content image finalization worker:", error);
  process.exit(1);
});
