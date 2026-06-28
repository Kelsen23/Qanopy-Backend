import { beforeEach, describe, expect, it, vi } from "vitest";

const sleep = vi.fn(async () => undefined);

vi.mock("node:timers/promises", () => ({
  setTimeout: sleep,
}));

const consoleError = vi
  .spyOn(console, "error")
  .mockImplementation(() => undefined);

const { default: runSideEffectWithRetry } = await import(
  "../../../../../src/services/moderation/admin/runSideEffectWithRetry.service.js"
);

describe("runSideEffectWithRetry", () => {
  beforeEach(() => {
    sleep.mockClear();
    consoleError.mockClear();
  });

  it("returns success on the first attempt without sleeping", async () => {
    const effect = vi.fn(async () => "ok");

    const result = await runSideEffectWithRetry("clearReportsCache", effect, {
      reportMongoId: "report_1",
    });

    expect(result).toEqual({
      success: true,
      attempts: 1,
      result: "ok",
    });
    expect(effect).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries failed side effects until one succeeds", async () => {
    const effect = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockResolvedValueOnce("done");

    const result = await runSideEffectWithRetry("queueNotification", effect, {
      decisionId: "decision_1",
    });

    expect(result).toEqual({
      success: true,
      attempts: 3,
      result: "done",
    });
    expect(effect).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 200);
    expect(sleep).toHaveBeenNthCalledWith(2, 600);
  });

  it("logs and returns a failed result after exhausting retries", async () => {
    const terminalError = new Error("queue down");
    const effect = vi.fn(async () => {
      throw terminalError;
    });

    const result = await runSideEffectWithRetry(
      "moderationAuditQueue:add",
      effect,
      {
        reportMongoId: "report_1",
        reviewedBy: "admin_1",
      },
    );

    expect(result).toEqual({
      success: false,
      attempts: 3,
    });
    expect(effect).toHaveBeenCalledTimes(3);
    expect(consoleError).toHaveBeenCalledWith(
      "[adminModeration] Non-critical side effect failed",
      expect.objectContaining({
        effectName: "moderationAuditQueue:add",
        attempts: 3,
        error: terminalError,
        reportMongoId: "report_1",
        reviewedBy: "admin_1",
      }),
    );
  });
});
