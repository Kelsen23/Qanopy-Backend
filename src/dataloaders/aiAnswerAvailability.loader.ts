import DataLoader from "dataloader";

import AiAnswer from "../models/aiAnswer.model.js";
import AiAnswerGeneration from "../models/aiAnswerGeneration.model.js";
import QuestionSettings from "../models/questionSettings.model.js";

const parseKey = (key: string) => {
  const separator = key.lastIndexOf(":");
  return {
    questionId: key.slice(0, separator),
    questionVersion: Number(key.slice(separator + 1)),
  };
};

const createAiAnswerAvailabilityLoader = () =>
  new DataLoader(async (keys: readonly string[]) => {
    const identities = keys.map(parseKey);
    const questionIds = [
      ...new Set(identities.map(({ questionId }) => questionId)),
    ];
    const matches = identities.map((identity) => ({
      questionId: identity.questionId,
      questionVersion: identity.questionVersion,
      aiAnswerVersion: 1,
    }));

    const [settings, generations, answers] = await Promise.all([
      QuestionSettings.find({ questionId: { $in: questionIds } })
        .select("questionId aiAnswerAutoGeneration")
        .lean(),
      AiAnswerGeneration.find({ $or: matches })
        .select(
          "questionId questionVersion planningStatus paymentStatus retrievalStatus generationStatus status",
        )
        .lean(),
      AiAnswer.find({ $or: matches })
        .select("questionId questionVersion aiAnswerVersion")
        .lean(),
    ]);

    const settingsByQuestion = new Map(
      settings.map((item) => [String(item.questionId), item]),
    );
    const generationByIdentity = new Map(
      generations.map((item) => [
        `${item.questionId}:${item.questionVersion}`,
        item,
      ]),
    );
    const answerByIdentity = new Map(
      answers.map((item) => [
        `${item.questionId}:${item.questionVersion}`,
        item,
      ]),
    );

    return identities.map(({ questionId, questionVersion }) => {
      const key = `${questionId}:${questionVersion}`;
      return {
        autoGenerationEnabled:
          settingsByQuestion.get(questionId)?.aiAnswerAutoGeneration ?? false,
        generation: generationByIdentity.get(key) ?? null,
        answer: answerByIdentity.get(key) ?? null,
      };
    });
  });

export default createAiAnswerAvailabilityLoader;
