import answerGenerationClient from "../../../config/anthropic.config.js";
import { getRedisCacheClient } from "../../../config/redis.config.js";

import {
  getAiAnswerCancelKey,
  getAiAnswerSessionSockets,
} from "../../redis/aiAnswerSession.service.js";

import publishSocketEvent from "../../../utils/publishSocketEvent.util.js";
import queueNotification from "../../../utils/queueNotification.util.js";
import HttpError from "../../../utils/httpError.util.js";

import AiAnswer from "../../../models/aiAnswer.model.js";

import aiFullAnswerSchema from "../../../validations/aiFullAnswer.schema.js";

const generateContextualAnswerService = async (
  userId: string,
  questionId: string,
  questionTitle: string,
  questionBody: string,
  questionVersion: number,
  contextualAnswerBodies: string[],
) => {
  const sockets = await getAiAnswerSessionSockets(questionId, questionVersion);
  const shouldPublishToSocket = sockets.length > 0;

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

  const stream = await answerGenerationClient.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 20000,
    temperature: 0.2,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
    stream: true,
  });

  const confidenceDelimiter = "<AI_CONFIDENCE_JSON>";

  let fullBody = "";
  let streamedBodyLength = 0;
  let wasCancelled = false;

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
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
        break;
      }

      const token = event.delta.text;
      fullBody += token;

      const delimiterStart = fullBody.indexOf(confidenceDelimiter);

      if (delimiterStart !== -1) {
        if (streamedBodyLength < delimiterStart) {
          const bodyChunk = fullBody.slice(streamedBodyLength, delimiterStart);

          streamedBodyLength = delimiterStart;

          if (shouldPublishToSocket) {
            await publishSocketEvent(userId, "aiAnswerToken", bodyChunk);
          }

          console.log("publishSocketEvent", {
            message: "aiAnswerToken",
            data: bodyChunk,
          });
        }
        continue;
      }

      const safeToStreamUntil = Math.max(
        0,
        fullBody.length - confidenceDelimiter.length + 1,
      );

      if (safeToStreamUntil > streamedBodyLength) {
        const bodyChunk = fullBody.slice(streamedBodyLength, safeToStreamUntil);

        streamedBodyLength = safeToStreamUntil;

        if (shouldPublishToSocket) {
          await publishSocketEvent(userId, "aiAnswerToken", bodyChunk);
        }

        console.log("publishSocketEvent", {
          message: "aiAnswerToken",
          data: bodyChunk,
        });
      }
    }
  }

  if (wasCancelled) return;

  try {
    const raw = fullBody.trim();
    const delimiterStart = raw.indexOf(confidenceDelimiter);

    if (delimiterStart === -1)
      throw new HttpError("Missing <AI_CONFIDENCE_JSON> delimiter", 500);

    const answerBody = raw.slice(0, delimiterStart).trim();
    const rawConfidence = raw
      .slice(delimiterStart + confidenceDelimiter.length)
      .trim();

    const parsedConfidence = JSON.parse(rawConfidence);

    const validatedAnswer = aiFullAnswerSchema.parse({
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
        source: "Claude-Haiku-4-5-Contextual",
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

      await queueNotification({
        userId,
        type: "AI_ANSWER",
        referenceId: newAiAnswer._id.toString(),
        meta: {
          questionId,
          questionVersion,
          generatedAt: new Date().toISOString(),
          source: "Claude-Haiku-4-5-Contextual",
        },
      });
    }
  } catch (error) {
    console.error("Invalid AI contextual answer response:", error);
    console.error("Raw AI response:", fullBody);
    throw new HttpError("Invalid AI contextual answer returned by Claude", 500);
  }
};

export default generateContextualAnswerService;
