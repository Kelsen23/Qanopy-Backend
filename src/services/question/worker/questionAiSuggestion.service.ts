import type { CreditCharge } from "../../user/credits/credits.types.js";

import generateQuestionSuggestionService, {
  AiSuggestionDeliveryError,
} from "../ai/generateQuestionSuggestion.service.js";
import refundCreditCharge from "../../user/credits/refundCreditCharge.service.js";

import { getRedisCacheClient } from "../../../config/redis.config.js";

type BillableResultError = Error & {
  billableResultCreated?: boolean;
};

type ProcessAiSuggestionJobData = {
  userId: string;
  questionId: string;
  version: number;
  creditCharge?: CreditCharge;
};

const processQuestionAiSuggestionJob = async ({
  userId,
  questionId,
  version,
  creditCharge,
}: ProcessAiSuggestionJobData) => {
  try {
    await generateQuestionSuggestionService({ userId, questionId, version });
  } catch (error) {
    const billableResultCreated =
      error instanceof Error &&
      (error as BillableResultError).billableResultCreated === true;

    if (
      creditCharge?.chargedNow &&
      !billableResultCreated &&
      !(error instanceof AiSuggestionDeliveryError)
    ) {
      await refundCreditCharge({
        operationKey: creditCharge.operationKey,
        reason: "AI suggestion generation failed",
      });
    }

    throw error;
  } finally {
    await getRedisCacheClient().del(
      `aiSuggestion:pending:${userId}:${questionId}:${version}`,
    );
  }
};

export default processQuestionAiSuggestionJob;
