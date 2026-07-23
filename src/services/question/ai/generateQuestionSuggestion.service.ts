import routeNotification from "../../notification/routeNotification.service.js";
import { getEditSessionSockets } from "../../redis/editSession.service.js";
import { canGetAISuggestion } from "./questionAiHelp.shared.js";
import generateSuggestion from "./generateSuggestion.service.js";

import convertQuestionToLLMText from "../../../utils/question/convertQuestionToLLMText.util.js";
import normalizeText from "../../../utils/question/normalizeText.util.js";
import publishSocketEvent from "../../../utils/socket/publishSocketEvent.util.js";

import Question from "../../../models/question.model.js";
import QuestionVersion from "../../../models/questionVersion.model.js";
import AiSuggestion from "../../../models/aiSuggestion.model.js";

const generateQuestionSuggestion = async ({
  userId,
  questionId,
  version,
}: {
  userId: string;
  questionId: string;
  version: number;
}) => {
  const existingSuggestion = await AiSuggestion.findOne({
    questionId,
    version,
  })
    .select("_id")
    .lean();

  if (existingSuggestion) throw new Error("AI suggestion already exists");

  const foundQuestion = await Question.findOne({
    _id: questionId,
    userId,
    currentVersion: version,
  })
    .select("_id questionEligibilityStatus securityVerifierStatus")
    .lean();

  if (!foundQuestion || !canGetAISuggestion(foundQuestion))
    throw new Error("Question is not eligible for AI suggestion");

  const foundVersion = await QuestionVersion.findOne({
    questionId,
    userId,
    version,
    $or: [{ moderationStatus: "APPROVED" }, { moderationStatus: "FLAGGED" }],
  })
    .select("_id isActive title body tags")
    .lean();

  if (!foundVersion) throw new Error("Version not found");
  if (!foundVersion.isActive) throw new Error("Version not active");

  const questionText = convertQuestionToLLMText(
    normalizeText(foundVersion.title as string),
    normalizeText(foundVersion.body as string),
    foundVersion.tags as string[],
  );

  const { suggestions, notes, confidence } = await generateSuggestion(
    questionText,
    {
      securityVerifierStatus: foundQuestion.securityVerifierStatus,
    },
  );

  const newSuggestion = await AiSuggestion.create({
    questionId,
    version,
    suggestions,
    notes,
    confidence: Math.min(confidence, 1),
    meta: {
      questionVersion: version,
      questionId,
      generatedAt: new Date().toISOString(),
      source: "DeepSeek-Chat",
    },
  });

  const sockets = await getEditSessionSockets(version);

  if (sockets.length > 0)
    await publishSocketEvent(userId, "aiSuggestionReady", newSuggestion);
  else
    await routeNotification({
      recipientId: userId,
      event: "AI_SUGGESTION_READY",
      target: {
        entityType: "QUESTION",
        entityId: questionId,
      },
      meta: {
        questionId,
        questionVersion: version,
        generatedAt: new Date().toISOString(),
        source: "DeepSeek-Chat",
      },
    });
};

export default generateQuestionSuggestion;
