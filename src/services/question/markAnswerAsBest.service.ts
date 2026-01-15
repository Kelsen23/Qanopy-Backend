import HttpError from "../../utils/httpError.util.js";

import Question from "../../models/question.model.js";
import Answer from "../../models/answer.model.js";

import { getRedisCacheClient } from "../../config/redis.config.js";
import { clearAnswerCache } from "../../utils/clearCache.util.js";

import statsQueue from "../../queues/stats.queue.js";

const markAnswerAsBest = async (userId: string, answerId: string) => {
  const foundAnswer = await Answer.findById(answerId).lean();

  if (!foundAnswer) throw new HttpError("Answer not found", 404);

  if (foundAnswer.isDeleted || !foundAnswer.isActive)
    throw new HttpError("Answer not active", 410);

  if (!foundAnswer.isAccepted)
    throw new HttpError(
      "Answer first needs to be accepted before marking it best",
      400,
    );

  if (foundAnswer.isBestAnswerByAsker) {
    return { message: "Answer is already marked as best", answer: foundAnswer };
  }

  const cachedQuestion = await getRedisCacheClient().get(
    `question:${foundAnswer.questionId}`,
  );

  const foundQuestion = cachedQuestion
    ? JSON.parse(cachedQuestion)
    : await Question.findById(foundAnswer.questionId).lean();

  if (!foundQuestion) throw new HttpError("Question not found", 404);

  if (foundQuestion.userId.toString() !== userId)
    throw new HttpError("Unauthorized to mark as best answer", 403);

  if (foundQuestion.isDeleted || !foundQuestion.isActive)
    throw new HttpError("Question not active", 410);

  const previousBest = await Answer.findOne({
    questionId: foundAnswer.questionId,
    isBestAnswerByAsker: true,
  }).lean();

  if (previousBest) {
    await Answer.updateMany(
      { questionId: foundAnswer.questionId },
      { $set: { isBestAnswerByAsker: false } },
    );

    await statsQueue.add("unmarkAsBest", {
      userId: previousBest.userId as string,
      action: "UNMARK_ANSWER_AS_BEST",
    });
  }

  const newBestAnswer = await Answer.findByIdAndUpdate(
    foundAnswer._id,
    { $set: { isBestAnswerByAsker: true } },
    { new: true },
  );

  if (!newBestAnswer) throw new HttpError("Error marking answer as best", 500);

  await statsQueue.add("markAsBest", {
    userId: newBestAnswer.userId as string,
    action: "MARK_ANSWER_AS_BEST",
  });

  await getRedisCacheClient().del(`question:${foundAnswer.questionId}`);
  await clearAnswerCache(foundAnswer.questionId as string);

  return {
    message: "Successfully marked answer as best",
    answer: newBestAnswer,
  };
};

export default markAnswerAsBest;
