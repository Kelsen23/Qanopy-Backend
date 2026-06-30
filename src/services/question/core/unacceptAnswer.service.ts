import HttpError from "../../../utils/http/httpError.util.js";

import Question from "../../../models/question.model.js";
import Answer from "../../../models/answer.model.js";

import {
  clearQuestionThreadCache,
  ensureActiveAnswer,
  ensureActiveQuestion,
  getCachedAnswer,
  getCachedQuestion,
  isObjectId,
  queueQuestionStats,
} from "../question.shared.js";

const unacceptAnswer = async (userId: string, answerId: string) => {
  if (!isObjectId(answerId)) throw new HttpError("Invalid answerId", 400);

  const foundAnswer =
    (await getCachedAnswer(
      answerId,
      "_id questionId userId isDeleted isActive isAccepted isBestAnswerByAsker",
    )) ??
    (await Answer.findById(answerId)
      .select(
        "_id questionId userId isDeleted isActive isAccepted isBestAnswerByAsker",
      )
      .lean());

  ensureActiveAnswer(foundAnswer);

  const foundQuestion =
    (await getCachedQuestion(
      foundAnswer.questionId as string,
      "_id userId isActive isDeleted",
    )) ??
    (await Question.findById(foundAnswer.questionId)
      .select("_id userId isActive isDeleted")
      .lean());

  ensureActiveQuestion(foundQuestion);

  if (foundQuestion.userId?.toString() !== userId)
    throw new HttpError("Unauthorized to unaccept answer", 403);

  if (!foundAnswer.isAccepted) {
    return {
      message: "Answer already unaccepted",
      answer: foundAnswer,
    };
  }

  const unacceptedAnswer = await Answer.findByIdAndUpdate(
    answerId,
    {
      isAccepted: false,
      isBestAnswerByAsker: false,
    },
    { returnDocument: "after" },
  );

  if (!unacceptedAnswer) {
    throw new HttpError("Answer unacceptance failed", 500);
  }

  await queueQuestionStats({
    name: foundAnswer.isBestAnswerByAsker
      ? "UNACCEPT_BEST_ANSWER"
      : "UNACCEPT_ANSWER",
    action: foundAnswer.isBestAnswerByAsker
      ? "UNACCEPT_BEST_ANSWER"
      : "UNACCEPT_ANSWER",
    userId,
    mongoTargetId: String(foundQuestion._id || foundQuestion.id || answerId),
    jobIdParts: [
      foundAnswer.isBestAnswerByAsker ? "unacceptBestAnswer" : "unacceptAnswer",
      answerId,
    ],
  });

  await clearQuestionThreadCache(foundAnswer.questionId as string);

  return {
    message: "Successfully unaccepted answer",
    unacceptedAnswer,
  };
};

export default unacceptAnswer;
