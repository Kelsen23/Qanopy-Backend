import QuestionSettings from "../../../models/questionSettings.model.js";

const getQuestionSettings = async (questionId: string) => {
  const settings = await QuestionSettings.findOne({ questionId })
    .select("aiAnswerAutoGeneration")
    .lean<{ aiAnswerAutoGeneration: boolean } | null>();

  return {
    aiAnswerAutoGeneration: settings?.aiAnswerAutoGeneration ?? false,
  };
};

export default getQuestionSettings;
