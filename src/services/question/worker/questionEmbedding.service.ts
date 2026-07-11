import crypto from "crypto";

import routeNotification from "../../../services/notification/routeNotification.service.js";
import generateEmbedding from "../ai/generateEmbedding.service.js";
import { queueContentPipelineRoute } from "../pipelineRouter/pipelineRouting.service.js";

import { getRedisCacheClient } from "../../../config/redis.config.js";

import convertQuestionToEmbeddingText from "../../../utils/question/convertQuestionToEmbeddingText.util.js";
import normalizeText from "../../../utils/question/normalizeText.util.js";

import QuestionVersion from "../../../models/questionVersion.model.js";
import Question from "../../../models/question.model.js";

type ProcessQuestionEmbeddingJobData = {
  questionId: string;
  version: number;
};

const processQuestionEmbeddingJob = async ({
  questionId,
  version,
}: ProcessQuestionEmbeddingJobData) => {
  const qv = await QuestionVersion.findOne({ questionId, version })
    .select("title body tags")
    .lean();

  if (!qv) return;

  const locked = await Question.findOneAndUpdate(
    {
      _id: questionId,
      currentVersion: version,
      topicStatus: "VALID",
      embeddingStatus: "NONE",
    },
    { $set: { embeddingStatus: "PROCESSING" } },
    { returnDocument: "after" },
  );

  if (!locked) return;

  const text = convertQuestionToEmbeddingText(
    normalizeText(qv.title as string),
    normalizeText(qv.body as string),
    Array.isArray(qv.tags) ? qv.tags : [],
  );

  const hash = crypto.createHash("sha256").update(text).digest("hex");

  let embedding = locked.embedding;

  if (
    locked.embeddingHash !== hash ||
    !Array.isArray(embedding) ||
    embedding.length === 0
  ) {
    try {
      embedding = await generateEmbedding(text);
    } catch (error) {
      await Question.updateOne(
        { _id: questionId, currentVersion: version },
        { $set: { embeddingStatus: "NONE" } },
      );
      throw error;
    }
  }

  const updated = await Question.updateOne(
    {
      _id: questionId,
      currentVersion: version,
      embeddingStatus: "PROCESSING",
    },
    {
      $set: {
        embedding,
        embeddingHash: hash,
        embeddingStatus: "READY",
        similarQuestionsStatus: "NONE",
      },
    },
  );

  if (updated.modifiedCount === 0) return;

  await queueContentPipelineRoute({
    contentType: "QUESTION",
    contentId: questionId,
    version,
  });

  await routeNotification({
    recipientId: locked.userId as string,
    event: "AI_ANSWER_UNLOCKED",
    target: {
      entityType: "QUESTION",
      entityId: questionId,
    },
    meta: {},
  });

  await getRedisCacheClient().del(`question:${questionId}`);
};

export default processQuestionEmbeddingJob;
