import mongoose from "mongoose";

import HttpError from "../../utils/httpError.util.js";

import Question from "../../models/question.model.js";
import AiAnswer from "../../models/aiAnswer.model.js";

import { getRedisCacheClient } from "../../config/redis.config.js";

const unpublishAiAnswer = async (
  userId: string,
  questionId: string,
  aiAnswerId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(questionId))
    throw new HttpError("Invalid questionId", 400);

  if (!mongoose.Types.ObjectId.isValid(aiAnswerId))
    throw new HttpError("Invalid aiAnswerId", 400);

  const cachedQuestion = await getRedisCacheClient().get(
    `question:${questionId}`,
  );
  const foundQuestion = cachedQuestion
    ? JSON.parse(cachedQuestion)
    : await Question.findById(questionId)
        .select("_id userId isActive isDeleted")
        .lean();

  if (!foundQuestion) throw new HttpError("Question not found", 404);

  if (foundQuestion.isDeleted || !foundQuestion.isActive)
    throw new HttpError("Question not active", 410);

  if (foundQuestion.userId?.toString() !== userId)
    throw new HttpError("Unauthorized to unpublish AI answer", 403);

  const foundAiAnswer = await AiAnswer.findOne({
    _id: aiAnswerId,
    questionId,
  }).lean();

  if (!foundAiAnswer) throw new HttpError("AI answer not found", 404);

  if (!foundAiAnswer.isPublished)
    throw new HttpError("AI answer is already unpublished", 409);

  const session = await mongoose.startSession();

  const unpublishedAnswer = await session.withTransaction(async () => {
    const freshQuestion = await Question.findById(questionId)
      .select("_id userId isActive isDeleted")
      .session(session)
      .lean();

    if (!freshQuestion) throw new HttpError("Question not found", 404);

    if (freshQuestion.isDeleted || !freshQuestion.isActive)
      throw new HttpError("Question not active", 410);

    if (freshQuestion.userId?.toString() !== userId)
      throw new HttpError("Unauthorized to unpublish AI answer", 403);

    const freshAiAnswer = await AiAnswer.findOne({
      _id: aiAnswerId,
      questionId,
    })
      .session(session)
      .lean();

    if (!freshAiAnswer) throw new HttpError("AI answer not found", 404);

    if (!freshAiAnswer.isPublished)
      throw new HttpError("AI answer is already unpublished", 409);

    const answer = await AiAnswer.findByIdAndUpdate(
      aiAnswerId,
      { $set: { isPublished: false } },
      { new: true, session },
    ).lean();

    if (!answer) throw new HttpError("Failed to unpublish AI answer", 500);

    return answer;
  });

  await session.endSession();

  await getRedisCacheClient().del(`question:${questionId}`);

  return {
    message: "Successfully unpublished AI answer",
    answer: unpublishedAnswer,
  };
};

export default unpublishAiAnswer;
