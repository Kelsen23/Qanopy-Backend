import { afterEach, describe, expect, it, vi } from "vitest";

const { default: makeCreditOperationKey } = await import(
  "../../../../../src/services/user/credits/creditOperationKey.shared.js"
);

describe("credit operation key helper", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps AI Answer operation keys stable", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const key = makeCreditOperationKey({
      type: "AI_ANSWER",
      userId: "user_1",
      questionId: "question_1",
      version: 2,
    });

    vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));

    expect(
      makeCreditOperationKey({
        type: "AI_ANSWER",
        userId: "user_1",
        questionId: "question_1",
        version: 2,
      }),
    ).toBe(key);
  });
});
