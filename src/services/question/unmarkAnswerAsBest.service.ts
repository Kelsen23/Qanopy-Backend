import HttpError from "../../utils/httpError.util.js";

import Question from "../../models/question.model.js";
import Answer from "../../models/answer.model.js";

import { getRedisCacheClient } from "../../config/redis.config.js";
import { clearAnswerCache } from "../../utils/clearCache.util.js";

import statsQueue from "../../queues/stats.queue.js";

const unmarkAnswerAsBest = async (userId: string, answerId: string) => {
  const foundAnswer = await Answer.findById(answerId).lean();

  if (!foundAnswer) throw new HttpError("Answer not found", 404);

  const cachedQuestion = await getRedisCacheClient().get(
    `question:${foundAnswer.questionId}`,
  );
  const foundQuestion = cachedQuestion
    ? JSON.parse(cachedQuestion)
    : await Question.findById(foundAnswer.questionId).lean();

  if (!foundQuestion) throw new HttpError("Question not found", 404);

  if (foundQuestion.userId.toString() !== userId)
    throw new HttpError("Unauthorized to unmark best answer", 403);

  if (!foundAnswer.isBestAnswerByAsker) {
    return {
      message: "Answer is already unmarked as best",
      answer: foundAnswer,
    };
  }

  const updatedAnswer = await Answer.findByIdAndUpdate(
    foundAnswer._id,
    {
      $set: { isBestAnswerByAsker: false },
    },
    { new: true },
  );

  await statsQueue.add("unmarkAsBest", {
    userId: foundAnswer.userId as string,
    action: "UNMARK_ANSWER_AS_BEST",
  });

  await getRedisCacheClient().del(`question:${foundAnswer.questionId}`);
  await clearAnswerCache(foundAnswer.questionId as string);

  return {
    message: "Successfully unmarked answer as best",
    answer: updatedAnswer,
  };
};

export default unmarkAnswerAsBest;
