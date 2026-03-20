import QuestionVersion from "../../models/questionVersion.model.js";
import AiSuggestion from "../../models/aiSuggestion.model.js";

import prisma from "../../config/prisma.config.js";

import { getRedisCacheClient } from "../../config/redis.config.js";

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
  let suggestionCreated = false;
  try {
    const existingSuggestion = await AiSuggestion.findOne({
      questionId,
      version,
    })
      .select("_id")
      .lean();

    if (existingSuggestion)
      throw new HttpError("AI suggestion already exists", 409);

    const foundVersion = await QuestionVersion.findOne({
      questionId,
      userId,
      version,
      $or: [{ moderationStatus: "APPROVED" }, { moderationStatus: "FLAGGED" }],
      topicStatus: "VALID",
    })
      .select("_id isActive title body tags")
      .lean();

    if (!foundVersion) throw new HttpError("Version not found", 404);
    if (!foundVersion.isActive) throw new HttpError("Version not active", 400);

    const questionText = convertQuestionToText(
      normalizeText(foundVersion.title as string),
      normalizeText(foundVersion.body as string),
      foundVersion.tags as string[],
      true,
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
        source: "DeepSeek-Chat",
      },
    });
    suggestionCreated = true;

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
          source: "DeepSeek-Chat",
        },
      });
  } catch (error) {
    if (!suggestionCreated) {
      await prisma.user.update({
        where: { id: userId },
        data: { credits: { increment: 5 } },
      });
      await getRedisCacheClient().del(`credits:${userId}`, `user:${userId}`);
    }
    throw error;
  }
};

export default generateQuestionSuggestion;
