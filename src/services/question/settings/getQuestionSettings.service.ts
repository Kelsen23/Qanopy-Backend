import HttpError from "../../../utils/http/httpError.util.js";

import Question from "../../../models/question.model.js";
import QuestionSettings from "../../../models/questionSettings.model.js";

const getQuestionSettings = async (userId: string, questionId: string) => {
  const question = await Question.findById(questionId)
    .select("userId isActive isDeleted")
    .lean<{
      userId: string;
      isActive: boolean;
      isDeleted: boolean;
    } | null>();

  if (!question) throw new HttpError("Question not found", 404);
  if (question.userId !== userId)
    throw new HttpError("Unauthorized to view question settings", 403);
  if (question.isDeleted || !question.isActive)
    throw new HttpError("Question not active", 410);

  const settings = await QuestionSettings.findOne({ questionId })
    .select("aiAnswerAutoGeneration")
    .lean<{ aiAnswerAutoGeneration: boolean } | null>();

  return {
    aiAnswerAutoGeneration: settings?.aiAnswerAutoGeneration ?? false,
  };
};

export default getQuestionSettings;
