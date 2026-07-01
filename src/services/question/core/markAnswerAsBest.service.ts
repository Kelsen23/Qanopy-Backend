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

const answerSelect =
  "_id questionId userId isDeleted isActive isAccepted isBestAnswerByAsker updatedAt createdAt";
const questionSelect = "_id userId isDeleted isActive";

const isDuplicateKeyError = (error: unknown) =>
  error instanceof Error &&
  ("code" in error
    ? (error as { code?: number }).code === 11000
    : /E11000/.test(error.message));

const markAnswerAsBest = async (userId: string, answerId: string) => {
  if (!isObjectId(answerId)) throw new HttpError("Invalid answerId", 400);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const session = await mongoose.startSession();

    try {
      const result = await session.withTransaction(async () => {
        const foundAnswer = await Answer.findById(answerId)
          .session(session)
          .select(answerSelect)
          .lean();

        if (!foundAnswer) throw new HttpError("Answer not found", 404);
        ensureActiveAnswer(foundAnswer);

        if (!foundAnswer.isAccepted) {
          throw new HttpError(
            "Answer first needs to be accepted before marking it best",
            400,
          );
        }

        const foundQuestion = await Question.findById(foundAnswer.questionId)
          .session(session)
          .select(questionSelect)
          .lean();

        if (!foundQuestion) throw new HttpError("Question not found", 404);
        ensureActiveQuestion(foundQuestion);

        if (foundQuestion.userId?.toString() !== userId)
          throw new HttpError("Unauthorized to mark as best answer", 403);

        if (foundAnswer.isBestAnswerByAsker) {
          return {
            didMutate: false,
            message: "Answer is already marked as best",
            answer: foundAnswer,
          };
        }

        const previousBest = await Answer.findOne({
          questionId: foundAnswer.questionId,
          isBestAnswerByAsker: true,
        })
          .session(session)
          .select(answerSelect)
          .lean();

        if (previousBest) {
          await Answer.updateMany(
            {
              questionId: foundAnswer.questionId,
              isBestAnswerByAsker: true,
            },
            {
              $set: { isBestAnswerByAsker: false },
            },
            { session },
          );
        }

        const newBestAnswer = await Answer.findOneAndUpdate(
          {
            _id: answerId,
            isBestAnswerByAsker: { $ne: true },
          },
          {
            $set: { isBestAnswerByAsker: true },
          },
          { returnDocument: "after", session },
        )
          .select(answerSelect)
          .lean();

        if (!newBestAnswer) {
          const authoritativeAnswer = await Answer.findById(answerId)
            .session(session)
            .select(answerSelect)
            .lean();

          if (authoritativeAnswer?.isBestAnswerByAsker) {
            return {
              didMutate: false,
              message: "Answer is already marked as best",
              answer: authoritativeAnswer,
            };
          }

          throw new HttpError("Error marking answer as best", 500);
        }

        return {
          didMutate: true,
          message: "Successfully marked answer as best",
          answer: newBestAnswer,
          question: foundQuestion,
          previousBest,
        };
      });

      if (!result.didMutate) {
        return {
          message: result.message,
          answer: result.answer,
        };
      }

      const mutatedResult = result as {
        didMutate: true;
        message: string;
        answer: any;
        question: any;
        previousBest: any;
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
      const answerEventId = makeQuestionAnswerStateEventId(
        "mark-best",
        questionId,
        answerIdString,
        answerStateVersion,
      );

      if (mutatedResult.previousBest && mutatedResult.previousBest._id) {
        const previousBestStateVersion = String(
          mutatedResult.previousBest.updatedAt ??
            mutatedResult.previousBest.createdAt ??
            "",
        );

        await queueQuestionStats({
          name: "UNMARK_AS_BEST",
          action: "UNMARK_ANSWER_AS_BEST",
          userId: mutatedResult.previousBest.userId as string,
          eventId: makeQuestionAnswerStateEventId(
            "unmark-best",
            questionId,
            String(mutatedResult.previousBest._id),
            previousBestStateVersion,
          ),
          jobIdParts: [
            "unmarkAsBest",
            questionId,
            String(mutatedResult.previousBest._id),
            previousBestStateVersion,
          ],
        });
      }

      await queueQuestionStats({
        name: "MARK_AS_BEST",
        action: "MARK_ANSWER_AS_BEST",
        userId: mutatedResult.answer.userId as string,
        eventId: answerEventId,
        jobIdParts: [
          "markAsBest",
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
          event: "ANSWER_MARKED_BEST",
          target: {
            entityType: "ANSWER",
            entityId: answerIdString,
            parentId: questionId,
          },
          meta: {},
        });
      }

      return {
        message: mutatedResult.message,
        answer: mutatedResult.answer,
      };
    } catch (error) {
      if (isDuplicateKeyError(error) && attempt === 0) {
        continue;
      }

      throw error;
    } finally {
      session.endSession();
    }
  }

  throw new Error("Answer best-marking retry exhausted");
};

export default markAnswerAsBest;
