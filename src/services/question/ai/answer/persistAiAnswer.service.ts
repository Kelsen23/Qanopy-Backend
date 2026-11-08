import AiAnswer from "../../../../models/aiAnswer.model.js";
import AiAnswerGeneration from "../../../../models/aiAnswerGeneration.model.js";

type AnswerConfidence = {
  overall: number;
  note?: string;
  sections: { sectionName: string; confidence?: number; note?: string }[];
};

const persistAiAnswer = async ({
  questionId,
  userId,
  questionVersion,
  aiAnswerVersion = 1,
  body,
  confidence,
  meta,
}: {
  questionId: string;
  userId: string;
  questionVersion: number;
  aiAnswerVersion?: number;
  body: string;
  confidence: AnswerConfidence;
  meta: Record<string, unknown>;
}) => {
  let answer: Awaited<ReturnType<typeof AiAnswer.findOne>> = null;
  let created = false;

  try {
    answer = await AiAnswer.create({
      questionId,
      userId,
      questionVersion,
      aiAnswerVersion,
      body,
      confidence,
      meta,
    });

    created = true;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    answer = await AiAnswer.findOne({
      questionId,
      questionVersion,
      aiAnswerVersion,
    });

    if (!answer) throw error;
  }

  await AiAnswerGeneration.updateOne(
    { questionId, questionVersion, aiAnswerVersion },
    {
      $set: {
        generationStatus: "COMPLETED",
        status: "COMPLETED",
      },
    },
  );

  return { answer, created };
};

export default persistAiAnswer;
