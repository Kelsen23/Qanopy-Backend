import llmGateway from "../../llmGateway/llmGateway.service.js";

import {
  buildAiModerationPolicy,
  type AiModerationPolicyResult,
} from "./aiModeration.policy.js";

type AiModerationFailureResult = {
  ok: false;
  error: string;
};

type AiModerationSuccessResult = AiModerationPolicyResult & {
  ok: true;
};

type AiModerationResult = AiModerationSuccessResult | AiModerationFailureResult;

const aiModerateContent = async (
  content: string,
): Promise<AiModerationResult> => {
  try {
    const result = await llmGateway.moderate({ input: content });

    return {
      ok: true,
      ...buildAiModerationPolicy({
        flagged: result.flagged,
        category_scores: result.categoryScores,
      } as {
        flagged: boolean;
        category_scores?: Record<string, number>;
      }),
    };
  } catch (error) {
    console.error("AI moderation error:", error);

    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Unknown AI moderation error",
    };
  }
};

export type {
  AiModerationResult,
  AiModerationFailureResult,
  AiModerationSuccessResult,
};

export default aiModerateContent;
