import { beforeEach, describe, expect, it, vi } from "vitest";

const redisDel = vi.fn();
const getRedisCacheClient = vi.fn(() => ({
  del: redisDel,
}));
const updateUserStats = vi.fn();
const questionFindByIdAndUpdate = vi.fn();
const answerFindByIdAndUpdate = vi.fn();

vi.mock("../../../../../src/config/redis.config.js", () => ({
  getRedisCacheClient,
}));

vi.mock("../../../../../src/models/question.model.js", () => ({
  default: {
    findByIdAndUpdate: questionFindByIdAndUpdate,
  },
}));

vi.mock("../../../../../src/models/answer.model.js", () => ({
  default: {
    findByIdAndUpdate: answerFindByIdAndUpdate,
  },
}));

vi.mock("../../../../../src/utils/user/updateUserStats.util.js", () => ({
  default: updateUserStats,
}));

const { default: processStatsJob } = await import(
  "../../../../../src/services/user/worker/stats.service.js"
);

describe("stats worker service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates prisma stats and clears the user cache", async () => {
    await processStatsJob("ASK_QUESTION", {
      userId: "user_1",
      action: "ASK_QUESTION",
    });

    expect(updateUserStats).toHaveBeenCalledWith("user_1", {
      questionsAsked: { increment: 1 },
    });
    expect(redisDel).toHaveBeenCalledWith("user:user_1");
    expect(questionFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(answerFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("updates mongo-only reply stats without touching the user cache", async () => {
    await processStatsJob("GIVE_REPLY", {
      userId: "user_1",
      action: "GIVE_REPLY",
      answerId: "answer_1",
    });

    expect(updateUserStats).not.toHaveBeenCalled();
    expect(answerFindByIdAndUpdate).toHaveBeenCalledWith("answer_1", {
      $inc: { replyCount: 1 },
    });
    expect(redisDel).not.toHaveBeenCalled();
  });

  it("updates both prisma and question mongo stats for answer creation", async () => {
    await processStatsJob("GIVE_ANSWER", {
      userId: "user_1",
      action: "GIVE_ANSWER",
      questionId: "question_1",
    });

    expect(updateUserStats).toHaveBeenCalledWith("user_1", {
      answersGiven: { increment: 1 },
      reputationPoints: { increment: 2 },
    });
    expect(questionFindByIdAndUpdate).toHaveBeenCalledWith("question_1", {
      $inc: { answerCount: 1 },
    });
    expect(redisDel).toHaveBeenNthCalledWith(1, "user:user_1");
    expect(redisDel).toHaveBeenNthCalledWith(2, "question:question_1");
  });

  it("rejects unknown actions and missing mongo target ids", async () => {
    await expect(
      processStatsJob("NOT_REAL", {
        userId: "user_1",
        action: "NOT_REAL",
      }),
    ).rejects.toThrow("Unknown action: NOT_REAL");

    await expect(
      processStatsJob("GIVE_REPLY", {
        userId: "user_1",
        action: "GIVE_REPLY",
      }),
    ).rejects.toThrow("Mongo target ID missing for action");
  });
});
