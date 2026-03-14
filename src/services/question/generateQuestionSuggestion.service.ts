import QuestionVersion from "../../models/questionVersion.model.js";
import AiSuggestion from "../../models/aiSuggestion.model.js";

import prisma from "../../config/prisma.config.js";

import HttpError from "../../utils/httpError.util.js";
import convertQuestionToText from "../../utils/convertQuestionToText.util.js";
import normalizeText from "../../utils/normalizeText.util.js";

import generateSuggestion from "./generateSuggestion.service.js";

import { getEditSessionSockets } from "../redis/editSession.service.js";

import publishSocketEvent from "../../utils/publishSocketEvent.util.js";

import queueNotification from "../../utils/queueNotification.util.js";

const generateQuestionSuggestion = async ({
  userId,
  questionId,
  version,
}: {
  userId: string;
  questionId: string;
  version: number;
}) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true },
  });
  if (!user || user.credits < 5) throw new HttpError("Not enough credits", 403);

  const foundVersion = await QuestionVersion.findOne({
    questionId,
    userId,
    $or: [{ moderationStatus: "APPROVED" }, { moderationStatus: "FLAGGED" }],
    topicStatus: "VALID",
  }).select("_id title body tags");

  if (!foundVersion) throw new HttpError("Version not found", 404);
  if (!foundVersion.isActive) throw new HttpError("Version not active", 400);

  const questionText = convertQuestionToText(
    normalizeText(foundVersion.title as string),
    normalizeText(foundVersion.body as string),
    foundVersion.tags as string[],
  );

  const { suggestions, notes, confidence } =
    await generateSuggestion(questionText);

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
      source: "DeepSeek-v3.2",
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { credits: { decrement: 5 } },
  });

  const sockets = await getEditSessionSockets(version);

  if (sockets.length > 0)
    await publishSocketEvent(userId, "aiSuggestionReady", newSuggestion);
  else
    await queueNotification({
      userId,
      type: "AI_SUGGESTION",
      referenceId: newSuggestion._id.toString(),
      meta: {
        questionVersion: version,
        questionId,
        generatedAt: new Date().toISOString(),
        source: "DeepSeek-v3.2",
      },
    });
};

export default generateQuestionSuggestion;
