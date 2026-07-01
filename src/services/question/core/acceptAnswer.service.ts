import mongoose from "mongoose";

import routeNotification from "../../notification/routeNotification.service.js";

import HttpError from "../../../utils/http/httpError.util.js";

import Answer from "../../../models/answer.model.js";
import Question from "../../../models/question.model.js";

import {
  clearQuestionThreadCache,
  ensureActiveAnswer,
  ensureActiveQuestion,
  isObjectId,
  makeQuestionAnswerStateEventId,
  queueQuestionStats,
} from "../question.shared.js";
import { toPublicAnswer } from "../question.response.js";

const answerSelect =
  "_id questionId userId isDeleted isActive isAccepted updatedAt createdAt";
const questionSelect = "_id userId isDeleted isActive";

const acceptAnswer = async (userId: string, answerId: string) => {
  if (!isObjectId(answerId)) throw new HttpError("Invalid answerId", 400);

  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const foundAnswer = await Answer.findById(answerId)
        .session(session)
        .select(answerSelect)
        .lean();

      if (!foundAnswer) throw new HttpError("Answer not found", 404);
      ensureActiveAnswer(foundAnswer);

      const foundQuestion = await Question.findById(foundAnswer.questionId)
        .session(session)
        .select(questionSelect)
        .lean();

      if (!foundQuestion) throw new HttpError("Question not found", 404);
      ensureActiveQuestion(foundQuestion);

      if (foundQuestion.userId?.toString() !== userId)
        throw new HttpError("Unauthorized to accept answer", 403);

      if (foundAnswer.isAccepted) {
        return {
          didMutate: false,
          message: "Answer already accepted",
          answer: foundAnswer,
        };
      }

      const acceptedAnswer = await Answer.findOneAndUpdate(
        {
          _id: answerId,
          isAccepted: { $ne: true },
        },
        { $set: { isAccepted: true } },
        { returnDocument: "after", session },
      )
        .select(answerSelect)
        .lean();

      if (!acceptedAnswer) {
        const authoritativeAnswer = await Answer.findById(answerId)
          .session(session)
          .select(answerSelect)
          .lean();

        if (authoritativeAnswer?.isAccepted) {
          return {
            didMutate: false,
            message: "Answer already accepted",
            answer: authoritativeAnswer,
          };
        }

        throw new HttpError("Answer acceptance failed", 500);
      }

      return {
        didMutate: true,
        message: "Successfully accepted answer",
        answer: acceptedAnswer,
        question: foundQuestion,
      };
    });

    if (!result.didMutate) {
      return {
        message: result.message,
        answer: toPublicAnswer(result.answer),
      };
    }

    const mutatedResult = result as {
      didMutate: true;
      message: string;
      answer: any;
      question: any;
    };
    const questionId = String(
      mutatedResult.question._id ?? mutatedResult.question.id,
    );
    const answerIdString = String(
      mutatedResult.answer._id ?? mutatedResult.answer.id,
    );
    const answerStateVersion = String(
      mutatedResult.answer.updatedAt ?? mutatedResult.answer.createdAt ?? "",
    );
    const eventId = makeQuestionAnswerStateEventId(
      "accept",
      questionId,
      answerIdString,
      answerStateVersion,
    );

    await queueQuestionStats({
      name: "ACCEPT_ANSWER",
      action: "ACCEPT_ANSWER",
      userId: mutatedResult.answer.userId as string,
      mongoTargetId: questionId,
      eventId,
      jobIdParts: [
        "acceptAnswer",
        questionId,
        answerIdString,
        answerStateVersion,
      ],
    });

    await clearQuestionThreadCache(questionId);

    if (mutatedResult.answer.userId?.toString() !== userId) {
      await routeNotification({
        recipientId: mutatedResult.answer.userId as string,
        actorId: userId,
        event: "ANSWER_ACCEPTED",
        target: {
          entityType: "ANSWER",
          entityId: answerIdString,
          parentId: questionId,
        },
        meta: {},
      });
    }

    return {
      message: result.message,
      acceptedAnswer: toPublicAnswer(mutatedResult.answer),
    };
  } finally {
    session.endSession();
  }
};

export default acceptAnswer;
