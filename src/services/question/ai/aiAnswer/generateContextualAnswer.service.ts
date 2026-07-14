import routeNotification from "../../../notification/routeNotification.service.js";
import {
  getAiAnswerCancelKey,
  getAiAnswerSessionSockets,
} from "../../../redis/aiAnswerSession.service.js";
import llmGateway from "../../../llmGateway/llmGateway.service.js";
import { buildSecurityConstraintInstructions } from "../questionAiHelp.shared.js";

import { getRedisCacheClient } from "../../../../config/redis.config.js";

import publishSocketEvent from "../../../../utils/socket/publishSocketEvent.util.js";

import AiAnswer from "../../../../models/aiAnswer.model.js";

import aiAnswerSchema from "../../../../validations/aiFullAnswer.schema.js";

const generateContextualAnswerService = async (
  userId: string,
  questionId: string,
  questionTitle: string,
  questionBody: string,
  questionVersion: number,
  contextualAnswerBodies: string[],
  securityConstraints: { securityVerifierStatus?: unknown } = {},
) => {
  const sockets = await getAiAnswerSessionSockets(questionId, questionVersion);
  const shouldPublishToSocket = sockets.length > 0;
  const securityConstraintInstructions =
    buildSecurityConstraintInstructions(securityConstraints);

  const systemPrompt = `
    You are an expert senior software engineer assistant. Your task is to write a contextual answer for a new question using multiple reference answers from similar questions.

    Rules:

    1. You will receive top-ranked reference answers sorted from most similar to least similar.
    2. Use references as supporting context, but adapt to the new question and do not copy blindly.
    3. Prefer points that are consistent across references; if references conflict, choose the safer and more generally correct guidance.
    4. If a reference includes details that do not apply to the new question, adjust or omit them.
    5. If needed, add missing details so the answer is complete and practical for the new question.
    6. Prefer concise explanations and avoid unnecessary sections unless they help solve the problem.
    7. Output format must follow this exact structure:

    [Answer body text with optional Markdown]

    <AI_CONFIDENCE_JSON>

    [Confidence JSON]

    5. The answer body must be between 20 and 20000 characters.
    6. JSON must be valid and not wrapped in Markdown code blocks.
    7. Confidence JSON format:

    {
      "confidence": {
          "overall": number from 0 to 100,
          "note": "short explanation of confidence",
          "sections": [
            {
                "sectionName": "string describing the topic of this section",
                "confidence": number from 0 to 100,
                "note": "short explanation of confidence for this section"
            }
          ]
      }
    }

    ${securityConstraintInstructions}

    Do not include any additional commentary before or after this structure.
  `;

  const formattedContextualAnswers = contextualAnswerBodies
    .slice(0, 3)
    .map(
      (body, index) =>
        `Reference #${index + 1} (rank ${index + 1}, higher rank = more similar):\n${body.slice(0, 1200)}`,
    )
    .join("\n\n");

  const userPrompt = `
    New question:
    ${questionTitle}

    New question body:
    ${questionBody}

    Reference answers from similar questions:
    ${formattedContextualAnswers}
  `;

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
          content: systemPrompt,
          cache: { enabled: true },
        },
        {
          role: "user",
          content: userPrompt,
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
        mode: "CONTEXTUAL",
        contextAnswerCount: contextualAnswerBodies.slice(0, 3).length,
      },
    });

    if (shouldPublishToSocket) {
      await publishSocketEvent(userId, "aiAnswerReady", newAiAnswer);
    } else {
      console.log("publishSocketEvent", {
        message: "aiAnswerReady",
        data: newAiAnswer,
      });

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
          mode: "CONTEXTUAL",
        },
      });
    }
  } catch (error) {
    console.error("Invalid AI contextual answer response:", error);
    console.error("Raw AI response:", fullBody);
    throw new Error("Invalid AI contextual answer returned by LLM gateway");
  }
};

export default generateContextualAnswerService;
