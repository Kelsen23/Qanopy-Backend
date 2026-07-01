import mongoose from "mongoose";

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
  "_id questionId userId isDeleted isActive isAccepted isBestAnswerByAsker updatedAt createdAt";
const questionSelect = "_id userId isActive isDeleted";

const unacceptAnswer = async (userId: string, answerId: string) => {
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
        throw new HttpError("Unauthorized to unaccept answer", 403);

      if (!foundAnswer.isAccepted) {
        return {
          didMutate: false,
          message: "Answer already unaccepted",
          answer: foundAnswer,
        };
      }

      const unacceptedAnswer = await Answer.findOneAndUpdate(
        {
          _id: answerId,
          isAccepted: true,
        },
        {
          $set: {
            isAccepted: false,
            isBestAnswerByAsker: false,
          },
        },
        { returnDocument: "after", session },
      )
        .select(answerSelect)
        .lean();

      if (!unacceptedAnswer) {
        const authoritativeAnswer = await Answer.findById(answerId)
          .session(session)
          .select(answerSelect)
          .lean();

        if (authoritativeAnswer && !authoritativeAnswer.isAccepted) {
          return {
            didMutate: false,
            message: "Answer already unaccepted",
            answer: authoritativeAnswer,
          };
        }

        throw new HttpError("Answer unacceptance failed", 500);
      }

      return {
        didMutate: true,
        message: "Successfully unaccepted answer",
        answer: unacceptedAnswer,
        question: foundQuestion,
        wasBestAnswerByAsker: foundAnswer.isBestAnswerByAsker,
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
      wasBestAnswerByAsker: boolean;
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
      mutatedResult.wasBestAnswerByAsker ? "unaccept-best" : "unaccept",
      questionId,
      answerIdString,
      answerStateVersion,
    );

    await queueQuestionStats({
      name: mutatedResult.wasBestAnswerByAsker
        ? "UNACCEPT_BEST_ANSWER"
        : "UNACCEPT_ANSWER",
      action: mutatedResult.wasBestAnswerByAsker
        ? "UNACCEPT_BEST_ANSWER"
        : "UNACCEPT_ANSWER",
      userId: mutatedResult.answer.userId as string,
      mongoTargetId: questionId,
      eventId,
      jobIdParts: [
        mutatedResult.wasBestAnswerByAsker
          ? "unacceptBestAnswer"
          : "unacceptAnswer",
        questionId,
        answerIdString,
        answerStateVersion,
      ],
    });

    await clearQuestionThreadCache(questionId);

    return {
      message: mutatedResult.message,
      unacceptedAnswer: toPublicAnswer(mutatedResult.answer),
    };
  } finally {
    session.endSession();
  }
};

export default unacceptAnswer;
