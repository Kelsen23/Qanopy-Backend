import Answer from "../../../models/answer.model.js";
import AiAnswer from "../../../models/aiAnswer.model.js";

import fullAnswerService from "./fullAnswer.service.js";
import generateContextualAnswerService from "./generateContextualAnswer.service.js";

const contextualAnswerService = async (
  similarQuestionIds: string[],
  userId: string,
  questionId: string,
  questionTitle: string,
  questionBody: string,
  questionVersion: number,
) => {
  const foundContextualAnswerBodies: string[] = [];
  const pushedIds = new Set<string>();

  const foundAiAnswers = await AiAnswer.find({
    questionId: { $in: similarQuestionIds },
  }).select("questionId body");

  const aiAnswerBodyByQuestionId = new Map<string, string>();
  for (const doc of foundAiAnswers) {
    aiAnswerBodyByQuestionId.set(String(doc.questionId), String(doc.body));
  }

  for (const similarQuestionId of similarQuestionIds) {
    const body = aiAnswerBodyByQuestionId.get(similarQuestionId);

    const pushedId = pushedIds.has(similarQuestionId);

    if (body && !pushedId) {
      foundContextualAnswerBodies.push(body);
      pushedIds.add(similarQuestionId);
    }

    if (foundContextualAnswerBodies.length === 3) break;
  }

  if (foundContextualAnswerBodies.length < 3) {
    const foundBestAnswers = await Answer.find({
      questionId: { $in: similarQuestionIds },
      isActive: true,
      isAccepted: true,
      isBestAnswerByAsker: true,
    }).select("questionId body");

    const bestAnswerBodyByQuestionId = new Map<string, string>();
    for (const doc of foundBestAnswers) {
      bestAnswerBodyByQuestionId.set(String(doc.questionId), String(doc.body));
    }

    for (const similarQuestionId of similarQuestionIds) {
      const body = bestAnswerBodyByQuestionId.get(similarQuestionId);

      const pushedId = pushedIds.has(similarQuestionId);

      if (body && !pushedId) {
        foundContextualAnswerBodies.push(body);
        pushedIds.add(similarQuestionId);
      }

      if (foundContextualAnswerBodies.length === 3) break;
    }
  }

  if (foundContextualAnswerBodies.length > 0) {
    await generateContextualAnswerService(
      userId,
      questionId,
      questionTitle,
      questionBody,
      questionVersion,
      foundContextualAnswerBodies,
    );
  } else {
    await fullAnswerService(
      userId,
      questionId,
      questionTitle,
      questionBody,
      questionVersion,
    );
  }
};

export default contextualAnswerService;
