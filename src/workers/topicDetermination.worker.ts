import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import HttpError from "../utils/httpError.util.js";
import convertQuestionToText from "../utils/convertQuestionToText.util.js";

import QuestionVersion from "../models/questionVersion.model.js";
import Question from "../models/question.model.js";

import connectMongoDB from "../config/mongodb.config.js";

import determineTopicStatusService from "../services/question/topicDetermination.service.js";

const normalizeText = (text: string) => {
  return text.trim().replace(/\s+/g, " ");
};

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting topic determination worker...");

  new Worker(
    "topicDeterminationQueue",
    async (job) => {
      const { questionId, version, isRollback, topicDeterminationType } =
        job.data;
      const determinationType =
        topicDeterminationType || (isRollback ? "ROLLBACK" : "CREATE_OR_EDIT");

      if (determinationType === "ROLLBACK") {
        const rolledBackVersion = await QuestionVersion.findOne({
          questionId,
          version,
          topicStatus: "PENDING",
        })
          .select("_id basedOnVersion isActive")
          .lean();

        if (!rolledBackVersion)
          throw new HttpError("Question version not found", 404);

        const baseVersion = await QuestionVersion.findOne({
          questionId,
          version: rolledBackVersion.basedOnVersion,
        })
          .select("topicStatus")
          .lean();

        if (!baseVersion) throw new HttpError("Base version not found", 404);

        const updatedQuestionVersion = await QuestionVersion.findByIdAndUpdate(
          rolledBackVersion._id as string,
          { topicStatus: baseVersion.topicStatus },
          { new: true },
        ).select("isActive");

        if (!updatedQuestionVersion)
          throw new HttpError("Question not found", 404);

        await Question.findByIdAndUpdate(questionId as string, {
          topicStatus: baseVersion.topicStatus,
        });

        return;
      }

      const foundQuestionVersion = await QuestionVersion.findOne({
        questionId,
        version,
        $or: [
          { moderationStatus: "APPROVED" },
          { moderationStatus: "FLAGGED" },
        ],
        topicStatus: "PENDING",
      })
        .select("_id title body")
        .lean();

      if (!foundQuestionVersion)
        throw new HttpError("Question version not found", 404);

      const questionText = convertQuestionToText(
        normalizeText(foundQuestionVersion.title as string),
        normalizeText(foundQuestionVersion.body as string),
      );

      const topicStatus = await determineTopicStatusService(questionText);

      const updatedQuestionVersion = await QuestionVersion.findByIdAndUpdate(
        foundQuestionVersion._id as string,
        { topicStatus },
        { new: true },
      ).select("isActive");

      if (!updatedQuestionVersion)
        throw new HttpError("Question not found", 404);

      await Question.findByIdAndUpdate(questionId as string, { topicStatus });
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
    },
  );
}

startWorker().catch((error) => {
  console.error("Failed to start topic determination worker:", error);
  process.exit(1);
});
