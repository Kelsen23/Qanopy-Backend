import { toPublicAiAnswer } from "../../question.response.js";

import AiAnswer from "../../../../models/aiAnswer.model.js";

import requestAiAnswer from "./requestAiAnswer.service.js";

const generateAiAnswerRequest = async (
  userId: string,
  questionId: string,
  version: number,
) => {
  const request = await requestAiAnswer({
    requestedByUserId: userId,
    questionId,
    questionVersion: version,
    generationReason: "INITIAL_MANUAL",
  });

  if (request.status === "ALREADY_EXISTS") {
    const answer = await AiAnswer.findOne({
      questionId,
      questionVersion: version,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (answer) {
      return {
        message: "AI answer successfully received",
        answer: toPublicAiAnswer(answer),
      };
    }
  }

  return {
    message: "AI answer generation request accepted",
    request,
  };
};

export default generateAiAnswerRequest;
