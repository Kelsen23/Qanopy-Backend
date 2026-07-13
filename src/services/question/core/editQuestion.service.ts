import { queueQuestionContentFinalize } from "../contentFinalize/contentFinalizeQueue.service.js";

import { getRedisCacheClient } from "../../../config/redis.config.js";

import HttpError from "../../../utils/http/httpError.util.js";
import { clearVersionHistoryCache } from "../../../utils/cache/clearCache.util.js";

import Question from "../../../models/question.model.js";

import { isObjectId } from "../question.shared.js";
import { toPublicQuestion } from "../question.response.js";

const editQuestion = async (
  userId: string,
  questionId: string,
  reqBody: { title: string; body: string; tags: string[] },
) => {
  if (!isObjectId(questionId)) throw new HttpError("Invalid questionId", 400);

  const { title, body, tags } = reqBody;

  const cachedQuestion = await getRedisCacheClient().get(
    `question:${questionId}`,
  );
  const foundQuestion = cachedQuestion
    ? JSON.parse(cachedQuestion)
    : await Question.findById(questionId).lean();

  if (!foundQuestion) throw new HttpError("Question not found", 404);

  if (foundQuestion.isDeleted || !foundQuestion.isActive)
    throw new HttpError("Question not active", 410);

  const sameTags =
    tags.length === foundQuestion.tags.length &&
    [...tags].sort().join(",") === [...foundQuestion.tags].sort().join(",");

  if (title === foundQuestion.title && body === foundQuestion.body && sameTags)
    throw new HttpError(
      "In order to edit the question, at least one field must be different from the old one",
      400,
    );

  if (foundQuestion.userId?.toString() !== userId)
    throw new HttpError("Unauthorized to edit question", 403);

  const newVersion = Number(foundQuestion.currentVersion ?? 0) + 1;
  const editedQuestion = await Question.findByIdAndUpdate(
    foundQuestion._id || foundQuestion.id,
    {
      title,
      body,
      tags,
      currentVersion: newVersion,
      basedOnVersion: foundQuestion.currentVersion,
      lastRollbackVersion: null,
      moderationStatus: "PENDING",
      moderationUpdatedAt: null,
      moderationSourceVersion: newVersion,
      embeddingStatus: "NONE",
      similarQuestionIds: [],
      similarQuestionsStatus: "NONE",
    },
    { returnDocument: "after" },
  );

  await queueQuestionContentFinalize({
    userId,
    entityId: String(editedQuestion?._id),
    version: newVersion,
    basedOnVersion: newVersion - 1,
    title,
    body,
    tags,
    moderationStatus: "PENDING",
    moderationUpdatedAt: null,
    embeddingStatus: "NONE",
  });

  await getRedisCacheClient().del(`question:${editedQuestion?._id}`);
  await clearVersionHistoryCache(questionId);

  return {
    message: "Successfully edited question",
    editedQuestion: toPublicQuestion(editedQuestion),
  };
};

export default editQuestion;
