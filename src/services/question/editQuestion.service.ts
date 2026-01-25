import HttpError from "../../utils/httpError.util.js";

import Question from "../../models/question.model.js";

import { getRedisCacheClient } from "../../config/redis.config.js";
import { clearVersionHistoryCache } from "../../utils/clearCache.util.js";

import contentImageFinalizeQueue from "../../queues/contentImageFinalize.queue.js";

const editQuestion = async (
  userId: string,
  questionId: string,
  reqBody: { title: string; body: string; tags: string[] },
) => {
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
    },
    { new: true },
  );

  await contentImageFinalizeQueue.add("finalizeContentImage", {
    entityType: "question",
    entityId: editedQuestion?._id,
  });

  await getRedisCacheClient().del(`question:${editedQuestion?._id}`);
  await clearVersionHistoryCache(questionId);

  return {
    message: "Successfully edited question",
    editedQuestion,
  };
};

export default editQuestion;
