import { afterEach, describe, expect, it, vi } from "vitest";

const { getCreditOperationKey } = await import(
  "../../../src/middlewares/credits.middleware.js"
);

describe("credits middleware helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps AI answer operation keys stable", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const key = getCreditOperationKey({
      type: "AI_ANSWER",
      userId: "user_1",
      questionId: "question_1",
      version: 2,
    });

    vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));

    expect(
      getCreditOperationKey({
        type: "AI_ANSWER",
        userId: "user_1",
        questionId: "question_1",
        version: 2,
      }),
    ).toBe(key);
  });

  it("rotates AI suggestion operation keys after the suggestion TTL window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const firstKey = getCreditOperationKey({
      type: "AI_SUGGESTION",
      userId: "user_1",
      questionId: "question_1",
      version: 2,
    });

    vi.setSystemTime(new Date("2026-01-01T00:46:00.000Z"));

    expect(
      getCreditOperationKey({
        type: "AI_SUGGESTION",
        userId: "user_1",
        questionId: "question_1",
        version: 2,
      }),
    ).not.toBe(firstKey);
  });
});
