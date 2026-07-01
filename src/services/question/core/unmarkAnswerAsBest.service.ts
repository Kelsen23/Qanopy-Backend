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
  "_id questionId userId body questionVersion isDeleted isActive isAccepted isBestAnswerByAsker upvoteCount downvoteCount replyCount updatedAt createdAt";
const questionSelect = "_id userId isDeleted isActive";

const unmarkAnswerAsBest = async (userId: string, answerId: string) => {
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
        throw new HttpError("Unauthorized to unmark best answer", 403);

      if (!foundAnswer.isBestAnswerByAsker) {
        return {
          didMutate: false,
          message: "Answer is already unmarked as best",
          answer: foundAnswer,
        };
      }

      const updatedAnswer = await Answer.findOneAndUpdate(
        {
          _id: answerId,
          isBestAnswerByAsker: true,
        },
        {
          $set: { isBestAnswerByAsker: false },
        },
        { returnDocument: "after", session },
      )
        .select(answerSelect)
        .lean();

      if (!updatedAnswer) {
        const authoritativeAnswer = await Answer.findById(answerId)
          .session(session)
          .select(answerSelect)
          .lean();

        if (authoritativeAnswer && !authoritativeAnswer.isBestAnswerByAsker) {
          return {
            didMutate: false,
            message: "Answer is already unmarked as best",
            answer: authoritativeAnswer,
          };
        }

        throw new HttpError("Error unmarking answer as best", 500);
      }

      return {
        didMutate: true,
        message: "Successfully unmarked answer as best",
        answer: updatedAnswer,
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

    await queueQuestionStats({
      name: "UNMARK_AS_BEST",
      action: "UNMARK_ANSWER_AS_BEST",
      userId: mutatedResult.answer.userId as string,
      eventId: makeQuestionAnswerStateEventId(
        "unmark-best",
        questionId,
        answerIdString,
        answerStateVersion,
      ),
      jobIdParts: [
        "unmarkAsBest",
        questionId,
        answerIdString,
        answerStateVersion,
      ],
    });

    await clearQuestionThreadCache(questionId);

    return {
      message: mutatedResult.message,
      answer: toPublicAnswer(mutatedResult.answer),
    };
  } finally {
    session.endSession();
  }
};

export default unmarkAnswerAsBest;
