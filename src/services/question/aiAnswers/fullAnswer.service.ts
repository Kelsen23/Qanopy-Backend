import answerGenerationClient from "../../../config/anthropic.config.js";

import { getRedisCacheClient } from "../../../config/redis.config.js";

import { getAiAnswerSessionSockets } from "../../redis/aiAnswerSession.service.js";

import publishSocketEvent from "../../../utils/publishSocketEvent.util.js";
import queueNotification from "../../../utils/queueNotification.util.js";
import HttpError from "../../../utils/httpError.util.js";

import AiAnswer from "../../../models/aiAnswer.model.js";

import aiFullAnswerSchema from "../../../validations/aiFullAnswer.schema.js";

const fullAnswer = async (
  userId: string,
  questionId: string,
  questionTitle: string,
  questionBody: string,
  questionVersion: number,
) => {
  const sockets = await getAiAnswerSessionSockets(questionId, questionVersion);
  const shouldPublishToSocket = sockets.length > 0;

  const systemPrompt = `
    You are an expert senior software engineer assistant. Your task is to generate a **full answer** to the following question.

    Requirements:

    1. First, output the **answer body** as plain text (between 20 and 20000 characters).
    - This text will be streamed live to the frontend.
    - You MAY use **Markdown formatting** (e.g. headings, lists, inline code, and code blocks with \`\`\`).
    - Use Markdown especially for code examples when appropriate.
    - Prefer concise explanations and skip unnecessary sections unless they help solve the problem.
    - Do NOT include any JSON in this section.

    2. After the answer body is fully generated, output the following delimiter **on its own line exactly once**:

    <AI_CONFIDENCE_JSON>

    3. After the delimiter, output the following **JSON exactly as described**:

    {
    "confidence": {
        "overall": number from 0 to 100 indicating confidence in the entire answer,
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

    4. The JSON must be valid and must NOT be wrapped in Markdown code blocks.

    5. If the question requires additional context to improve accuracy, you may conceptually search online and incorporate that knowledge.

    6. Ensure the answer is clear, factual, and thorough. Use the confidence fields to indicate any uncertainty.

    Output structure must strictly follow this order:

    [Answer body text with optional Markdown]

    <AI_CONFIDENCE_JSON>

    [Confidence JSON]

    Do not include any additional commentary before or after the output.
`;

  const userPrompt = `
    Question:
    ${questionTitle}
    
    Body:
    ${questionBody}
  `;

  const stream = await answerGenerationClient.messages.create({
    model: "claude-sonnet-4-6",
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

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      const cancelFlag = await getRedisCacheClient().get(
        `cancel:aiAnswer:question:${questionId}:version:${questionVersion}`,
      );

      if (cancelFlag) {
        await publishSocketEvent(userId, "aiAnswerCancelled", {
          message: "AI answer generation cancelled",
        });

        break;
      }

      const token = event.delta.text;
      fullBody += token;

      const delimiterStart = fullBody.indexOf(confidenceDelimiter);

      if (delimiterStart !== -1) {
        if (streamedBodyLength < delimiterStart) {
          const bodyChunk = fullBody.slice(streamedBodyLength, delimiterStart);

          streamedBodyLength = delimiterStart;

          if (shouldPublishToSocket)
            await publishSocketEvent(userId, "aiAnswerToken", bodyChunk);
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

        if (shouldPublishToSocket)
          await publishSocketEvent(userId, "aiAnswerToken", bodyChunk);
      }
    }
  }

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

      if (tail && shouldPublishToSocket)
        await publishSocketEvent(userId, "aiAnswerToken", tail);
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
        source: "Claude-Sonnet-4-6",
        mode: "FULL",
      },
    });

    if (shouldPublishToSocket)
      await publishSocketEvent(userId, "aiAnswerReady", newAiAnswer);
    else
      await queueNotification({
        userId,
        type: "AI_ANSWER",
        referenceId: newAiAnswer._id.toString(),
        meta: {
          questionId,
          questionVersion,
          generatedAt: new Date().toISOString(),
          source: "Claude-Sonnet-4-6",
        },
      });
  } catch (error) {
    console.error("Invalid AI full answer response:", error);
    console.error("Raw AI response:", fullBody);
    throw new HttpError("Invalid AI full answer returned by Claude", 500);
  }
};

export default fullAnswer;
