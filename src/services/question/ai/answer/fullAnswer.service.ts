import routeNotification from "../../../notification/routeNotification.service.js";
import {
  getAiAnswerCancelKey,
  getAiAnswerSessionSockets,
} from "../../../redis/aiAnswerSession.service.js";
import llmGateway from "../../../llmGateway/llmGateway.service.js";
import { buildSecurityConstraintInstructions } from "../questionAiHelp.shared.js";

import { getRedisCacheClient } from "../../../../config/redis.config.js";

import { clearAiAnswersCache } from "../../../../utils/cache/clearCache.util.js";
import publishSocketEvent from "../../../../utils/socket/publishSocketEvent.util.js";

import AiAnswer from "../../../../models/aiAnswer.model.js";

import { buildFullAnswerSystemPrompt } from "../../../../prompts/aiAnswer/fullAnswer.prompt.js";
import { buildFullAnswerUserPrompt } from "../../../../prompts/aiAnswer/fullAnswer.prompt.js";
import aiAnswerSchema from "../../../../validations/aiFullAnswer.schema.js";

const fullAnswer = async (
  userId: string,
  questionId: string,
  questionTitle: string,
  questionBody: string,
  questionVersion: number,
  securityConstraints: { securityVerifierStatus?: unknown } = {},
) => {
  const sockets = await getAiAnswerSessionSockets(questionId, questionVersion);
  const shouldPublishToSocket = sockets.length > 0;
  const securityConstraintInstructions =
    buildSecurityConstraintInstructions(securityConstraints);

  const confidenceDelimiter = "<AI_CONFIDENCE_JSON>";

  let fullBody = "";
  let streamedBodyLength = 0;
  let wasCancelled = false;

  try {
    await llmGateway.streamText({
      feature: "aiAnswer",
      messages: [
        {
          role: "system",
          content: buildFullAnswerSystemPrompt(securityConstraintInstructions),
          cache: { enabled: true },
        },
        {
          role: "user",
          content: buildFullAnswerUserPrompt(questionTitle, questionBody),
        },
      ],
      temperature: 0.2,
      maxTokens: 20000,
      onToken: async (token) => {
        const cancelFlag = await getRedisCacheClient().get(
          getAiAnswerCancelKey(questionId, questionVersion),
        );

        if (cancelFlag) {
          await publishSocketEvent(userId, "aiAnswerCancelled", {
            message: "AI answer generation cancelled",
          });
          console.log("publishSocketEvent", {
            message: "aiAnswerCancelled",
            data: { message: "AI answer generation cancelled" },
          });

          wasCancelled = true;
          throw Object.assign(new Error("AI answer generation cancelled"), {
            noFallback: true,
          });
        }

        fullBody += token;

        const delimiterStart = fullBody.indexOf(confidenceDelimiter);

        if (delimiterStart !== -1) {
          if (streamedBodyLength < delimiterStart) {
            const bodyChunk = fullBody.slice(
              streamedBodyLength,
              delimiterStart,
            );

            streamedBodyLength = delimiterStart;

            if (shouldPublishToSocket) {
              await publishSocketEvent(userId, "aiAnswerToken", bodyChunk);
            }

            console.log("publishSocketEvent", {
              message: "aiAnswerToken",
              data: bodyChunk,
            });
          }
          return;
        }

        const safeToStreamUntil = Math.max(
          0,
          fullBody.length - confidenceDelimiter.length + 1,
        );

        if (safeToStreamUntil > streamedBodyLength) {
          const bodyChunk = fullBody.slice(
            streamedBodyLength,
            safeToStreamUntil,
          );

          streamedBodyLength = safeToStreamUntil;

          if (shouldPublishToSocket) {
            await publishSocketEvent(userId, "aiAnswerToken", bodyChunk);
          }

          console.log("publishSocketEvent", {
            message: "aiAnswerToken",
            data: bodyChunk,
          });
        }
      },
    });
  } catch (error) {
    if (wasCancelled) return;

    throw error;
  }

  if (wasCancelled) return;

  try {
    const raw = fullBody.trim();
    const delimiterStart = raw.indexOf(confidenceDelimiter);

    if (delimiterStart === -1)
      throw new Error("Missing <AI_CONFIDENCE_JSON> delimiter");

    const answerBody = raw.slice(0, delimiterStart).trim();
    const rawConfidence = raw
      .slice(delimiterStart + confidenceDelimiter.length)
      .trim();

    const parsedConfidence = JSON.parse(rawConfidence);

    const validatedAnswer = aiAnswerSchema.parse({
      body: answerBody,
      confidence: parsedConfidence.confidence,
    });

    if (streamedBodyLength < validatedAnswer.body.length) {
      const tail = validatedAnswer.body.slice(streamedBodyLength);

      if (tail && shouldPublishToSocket) {
        await publishSocketEvent(userId, "aiAnswerToken", tail);
      }

      console.log("publishSocketEvent", {
        message: "aiAnswerToken",
        data: tail,
      });
    }

    const newAiAnswer = await AiAnswer.create({
      questionId,
      questionVersion,
      body: validatedAnswer.body,
      confidence: validatedAnswer.confidence,
      meta: {
        questionId,
        questionVersion,
        generatedAt: new Date().toISOString(),
        source: "llmGateway",
        mode: "FULL",
      },
    });

    await clearAiAnswersCache(questionId);

    if (shouldPublishToSocket) {
      await publishSocketEvent(userId, "aiAnswerReady", newAiAnswer);
    } else
      await routeNotification({
        recipientId: userId,
        event: "AI_ANSWER_READY",
        target: {
          entityType: "QUESTION",
          entityId: questionId,
        },
        meta: {
          questionId,
          questionVersion,
          generatedAt: new Date().toISOString(),
          source: "llmGateway",
          mode: "FULL",
        },
      });
  } catch (error) {
    console.error("Invalid AI full answer response:", error);
    console.error("Raw AI response:", fullBody);
    throw new Error("Invalid AI full answer returned by LLM gateway");
  }
};

export default fullAnswer;
