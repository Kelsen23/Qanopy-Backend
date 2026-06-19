import { moderationClient } from "../../../config/openai.config.js";

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
    const response = await moderationClient.moderations.create({
      model: "omni-moderation-latest",
      input: content,
    });

    const result = response.results?.[0];

    if (!result) {
      return {
        ok: false,
        error: "Moderation API returned no result",
      };
    }

    return {
      ok: true,
      ...buildAiModerationPolicy(
        result as unknown as {
          flagged: boolean;
          category_scores?: Record<string, number>;
        },
      ),
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
