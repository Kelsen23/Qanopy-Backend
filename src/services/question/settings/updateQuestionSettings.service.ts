import requestAiAnswer from "../ai/answer/requestAiAnswer.service.js";
import withAiAnswerRequestLock from "../ai/answer/aiAnswerRequest.lock.js";

import HttpError from "../../../utils/http/httpError.util.js";

import Question from "../../../models/question.model.js";
import QuestionSettings from "../../../models/questionSettings.model.js";

const updateQuestionSettings = async ({
  userId,
  questionId,
  aiAnswerAutoGeneration,
}: {
  userId: string;
  questionId: string;
  aiAnswerAutoGeneration: boolean;
}) => {
  const { questionVersion, settings } = await withAiAnswerRequestLock(
    questionId,
    async (assertLockHeld) => {
      const question = await Question.findById(questionId)
        .select("userId currentVersion isActive isDeleted")
        .lean<{
          userId: string;
          currentVersion: number;
          isActive: boolean;
          isDeleted: boolean;
        } | null>();

      if (!question) throw new HttpError("Question not found", 404);
      if (question.userId !== userId)
        throw new HttpError("Unauthorized to update question settings", 403);
      if (question.isDeleted || !question.isActive)
        throw new HttpError("Question not active", 410);

      await assertLockHeld();
      const updatedSettings = await QuestionSettings.findOneAndUpdate(
        { questionId },
        { $set: { aiAnswerAutoGeneration } },
        {
          returnDocument: "after",
          upsert: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        },
      )
        .select("questionId aiAnswerAutoGeneration createdAt updatedAt")
        .lean<{
          questionId: unknown;
          aiAnswerAutoGeneration: boolean;
          createdAt?: Date;
          updatedAt?: Date;
        } | null>();

      if (!updatedSettings)
        throw new Error("Question settings could not be updated");

      return {
        questionVersion: question.currentVersion,
        settings: {
          questionId: String(updatedSettings.questionId),
          aiAnswerAutoGeneration: updatedSettings.aiAnswerAutoGeneration,
          createdAt: updatedSettings.createdAt,
          updatedAt: updatedSettings.updatedAt,
        },
      };
    },
  );

  if (aiAnswerAutoGeneration) {
    await requestAiAnswer({
      questionId,
      questionVersion,
      generationReason: "INITIAL_AUTO",
    });
  }

  return {
    message: "Question settings updated successfully",
    settings,
  };
};

export default updateQuestionSettings;
