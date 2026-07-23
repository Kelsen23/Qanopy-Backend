import { beforeEach, describe, expect, it, vi } from "vitest";

const generateQuestionSuggestionService = vi.fn();
const refundCreditCharge = vi.fn();
const redisDel = vi.fn();

vi.mock("../../../../src/services/question/ai/generateQuestionSuggestion.service.js", () => ({
  AiSuggestionDeliveryError: class AiSuggestionDeliveryError extends Error {
    billableResultCreated = true;
  },
  default: generateQuestionSuggestionService,
}));

vi.mock(
  "../../../../src/services/user/credits/refundCreditCharge.service.js",
  () => ({
    default: refundCreditCharge,
  }),
);

vi.mock("../../../../src/config/redis.config.js", () => ({
  getRedisCacheClient: () => ({
    del: redisDel,
  }),
}));

const { default: processQuestionAiSuggestionJob } = await import(
  "../../../../src/services/question/worker/questionAiSuggestion.service.js"
);

describe("processQuestionAiSuggestionJob", () => {
  beforeEach(() => {
    generateQuestionSuggestionService.mockReset();
    refundCreditCharge.mockReset();
    redisDel.mockReset();
  });

  it("refunds when suggestion generation fails before a billable result exists", async () => {
    generateQuestionSuggestionService.mockRejectedValue(new Error("LLM failed"));

    await expect(
      processQuestionAiSuggestionJob({
        userId: "user_1",
        questionId: "question_1",
        version: 2,
        creditCharge: {
          operationId: "operation_1",
          operationKey: "AI_SUGGESTION:user_1:question_1:2:123",
          type: "AI_SUGGESTION",
          amount: 30,
          chargedNow: true,
        },
      }),
    ).rejects.toThrow("LLM failed");

    expect(refundCreditCharge).toHaveBeenCalledWith({
      operationKey: "AI_SUGGESTION:user_1:question_1:2:123",
      reason: "AI suggestion generation failed",
    });
    expect(redisDel).toHaveBeenCalledWith(
      "aiSuggestion:pending:user_1:question_1:2",
    );
  });

  it("does not refund when delivery fails after the billable result is created", async () => {
    const deliveryError = Object.assign(new Error("socket failed"), {
      billableResultCreated: true,
    });

    generateQuestionSuggestionService.mockRejectedValue(deliveryError);

    await expect(
      processQuestionAiSuggestionJob({
        userId: "user_1",
        questionId: "question_1",
        version: 2,
        creditCharge: {
          operationId: "operation_1",
          operationKey: "AI_SUGGESTION:user_1:question_1:2:123",
          type: "AI_SUGGESTION",
          amount: 30,
          chargedNow: true,
        },
      }),
    ).rejects.toThrow("socket failed");

    expect(refundCreditCharge).not.toHaveBeenCalled();
    expect(redisDel).toHaveBeenCalledWith(
      "aiSuggestion:pending:user_1:question_1:2",
    );
  });
});
