import { toPublicAiAnswer } from "../../question.response.js";
import requestAiAnswer from "./requestAiAnswer.service.js";

import HttpError from "../../../../utils/http/httpError.util.js";

import AiAnswer from "../../../../models/aiAnswer.model.js";

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

  if (request.status === "ALREADY_ANSWERED") {
    const answer = await AiAnswer.findOne({
      questionId,
      questionVersion: version,
      aiAnswerVersion: 1,
    }).lean();

    if (answer) {
      return {
        message: "AI answer successfully received",
        answer: toPublicAiAnswer(answer),
      };
    }
  }

  if (request.status === "IN_PROGRESS") {
    throw new HttpError("AI Answer generation is already in progress", 409);
  }

  return {
    message: "AI answer generation request accepted",
    request,
  };
};

export default generateAiAnswerRequest;
