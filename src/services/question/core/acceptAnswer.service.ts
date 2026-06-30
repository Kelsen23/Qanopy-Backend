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
  queueQuestionNotification,
  queueQuestionStats,
} from "../question.shared.js";

const acceptAnswer = async (userId: string, answerId: string) => {
  if (!isObjectId(answerId)) throw new HttpError("Invalid answerId", 400);

  const foundAnswer =
    (await getCachedAnswer(
      answerId,
      "_id questionId userId isDeleted isActive isAccepted",
    )) ??
    (await Answer.findById(answerId)
      .select("_id questionId userId isDeleted isActive isAccepted")
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
    throw new HttpError("Unauthorized to accept answer", 403);

  if (foundAnswer.isAccepted) {
    return {
      message: "Answer already accepted",
      answer: foundAnswer,
    };
  }

  const acceptedAnswer = await Answer.findByIdAndUpdate(
    answerId,
    { isAccepted: true },
    { returnDocument: "after" },
  );

  if (!acceptedAnswer) {
    throw new HttpError("Answer acceptance failed", 500);
  }

  await queueQuestionStats({
    name: "ACCEPT_ANSWER",
    action: "ACCEPT_ANSWER",
    userId,
    mongoTargetId: String(foundQuestion._id || foundQuestion.id || answerId),
    jobIdParts: ["acceptAnswer", answerId],
  });

  await clearQuestionThreadCache(foundAnswer.questionId as string);

  if (acceptedAnswer.userId?.toString() !== userId) {
    await queueQuestionNotification({
      recipientId: acceptedAnswer.userId as string,
      actorId: userId,
      event: "ANSWER_ACCEPTED",
      target: {
        entityType: "ANSWER",
        entityId: String(acceptedAnswer._id),
        parentId: String(foundQuestion._id ?? foundQuestion.id ?? answerId),
      },
      meta: {},
    });
  }

  return {
    message: "Successfully accepted answer",
    acceptedAnswer,
  };
};

export default acceptAnswer;
