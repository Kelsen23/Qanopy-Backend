import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockModerationUnitModules,
  mockModerationUnitTestEnvironment as env,
  resetModerationUnitTestEnvironment,
} from "../../../helpers/moderation/mockModerationUnitTestEnvironment.js";

vi.mock("mongoose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("mongoose")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      startSession: env.mongooseStartSession,
    },
    startSession: env.mongooseStartSession,
  };
});
vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockModerationUnitModules.redisConfig,
);
vi.mock(
  "../../../../src/utils/cache/clearCache.util.js",
  () => mockModerationUnitModules.clearCacheUtil,
);
vi.mock(
  "../../../../src/utils/moderation/clearModeratedContentCache.util.js",
  () => mockModerationUnitModules.clearModeratedContentCache,
);
vi.mock(
  "../../../../src/utils/job/makeJobId.util.js",
  () => mockModerationUnitModules.makeJobId,
);
vi.mock(
  "../../../../src/models/question.model.js",
  () => mockModerationUnitModules.questionModel,
);
vi.mock(
  "../../../../src/models/questionVersion.model.js",
  () => mockModerationUnitModules.questionVersionModel,
);
vi.mock(
  "../../../../src/models/answer.model.js",
  () => mockModerationUnitModules.answerModel,
);
vi.mock(
  "../../../../src/models/reply.model.js",
  () => mockModerationUnitModules.replyModel,
);
vi.mock(
  "../../../../src/models/aiAnswerFeedback.model.js",
  () => mockModerationUnitModules.aiAnswerFeedbackModel,
);
vi.mock(
  "../../../../src/queues/imageDeletion.queue.js",
  () => mockModerationUnitModules.imageDeletionQueue,
);

const {
  moderationSeverity,
  getWorstQuestionVersionModerationStatus,
  syncQuestionModerationStatusFromVersions,
} = await import(
  "../../../../src/services/moderation/questionModerationStatus.service.js"
);
const { default: applyContentModerationDecision } = await import(
  "../../../../src/services/moderation/applyContentModerationDecision.service.js"
);
const { default: applyAdminContentModerationDecision } = await import(
  "../../../../src/services/moderation/applyAdminContentModerationDecision.service.js"
);
const { default: removeModeratedContent } = await import(
  "../../../../src/services/moderation/removeModeratedContent.service.js"
);

describe("moderation content state services", () => {
  beforeEach(() => {
    resetModerationUnitTestEnvironment();
  });

  it("chooses the worst question version moderation status by severity and version", async () => {
    env.questionVersionFind.mockReturnValueOnce(
      env.createQueryChain([
        { version: 1, moderationStatus: "APPROVED" },
        { version: 3, moderationStatus: "FLAGGED" },
        { version: 2, moderationStatus: "REJECTED" },
      ]),
    );

    const result = await getWorstQuestionVersionModerationStatus(
      "question_1",
      {} as never,
    );

    expect(moderationSeverity.REJECTED).toBeGreaterThan(
      moderationSeverity.FLAGGED,
    );
    expect(result).toEqual({
      moderationStatus: "REJECTED",
      moderationSourceVersion: 2,
    });
  });

  it("syncs question moderation status from the worst version", async () => {
    env.questionVersionFind.mockReturnValueOnce(
      env.createQueryChain([
        { version: 1, moderationStatus: "FLAGGED" },
        { version: 2, moderationStatus: "REJECTED" },
      ]),
    );
    env.questionFindOneAndUpdate.mockResolvedValueOnce({ _id: "question_1" });

    const result = await syncQuestionModerationStatusFromVersions({
      questionId: "question_1",
      moderationUpdatedAt: new Date("2030-01-01T00:00:00.000Z"),
      session: {} as never,
    });

    expect(env.questionFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: "question_1", isActive: true },
      expect.objectContaining({
        moderationStatus: "REJECTED",
        moderationSourceVersion: 2,
      }),
      expect.objectContaining({
        session: {},
      }),
    );
    expect(result).toEqual({
      moderationStatus: "REJECTED",
      moderationSourceVersion: 2,
    });
  });

  it("applies AI content decisions for questions and clears moderated content cache on success", async () => {
    env.questionFindById
      .mockReturnValueOnce(
        env.createQueryChain({
          currentVersion: 3,
          isActive: true,
        }),
      )
      .mockReturnValueOnce(
        env.createQueryChain({
          isActive: true,
        }),
      );
    env.questionVersionFindOne
      .mockReturnValueOnce(env.createQueryChain({ _id: "version_3" }))
      .mockReturnValueOnce(env.createQueryChain({ _id: "version_3" }));
    env.questionVersionFind.mockReturnValueOnce(
      env.createQueryChain([{ version: 3, moderationStatus: "REJECTED" }]),
    );
    env.questionVersionFindOneAndUpdate.mockResolvedValueOnce({
      _id: "version_3",
    });
    env.questionFindOneAndUpdate.mockResolvedValueOnce({ _id: "question_1" });

    const result = await applyContentModerationDecision(
      "question_1",
      "QUESTION",
      "REJECTED",
      3,
    );

    expect(env.questionVersionFindOneAndUpdate).toHaveBeenCalled();
    expect(env.questionFindOneAndUpdate).toHaveBeenCalled();
    expect(env.clearModeratedContentCache).toHaveBeenCalledWith(
      "QUESTION",
      "question_1",
      3,
    );
    expect(result).toEqual({ applied: true });
  });

  it("returns revision_changed when non-question moderation revision no longer matches", async () => {
    env.answerFindOneAndUpdate.mockResolvedValueOnce(null);
    env.answerFindById.mockReturnValueOnce(
      env.createQueryChain({
        moderationStatus: "PENDING",
        moderationRevision: 9,
        isActive: true,
      }),
    );

    const result = await applyContentModerationDecision(
      "answer_1",
      "ANSWER",
      "APPROVED",
      2,
    );

    expect(result).toEqual({
      applied: false,
      reason: "revision_changed",
    });
  });

  it("applies admin content moderation decisions for answers and clears content cache", async () => {
    env.answerFindById.mockReturnValueOnce(
      env.createQueryChain({
        moderationStatus: "PENDING",
        moderationRevision: 2,
        isActive: true,
      }),
    );
    env.answerFindOneAndUpdate.mockResolvedValueOnce({
      _id: "answer_1",
      isActive: true,
    });

    await applyAdminContentModerationDecision(
      "answer_1",
      "ANSWER",
      "FLAGGED",
      2,
    );

    expect(env.answerFindOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: "answer_1",
        moderationRevision: 2,
        isActive: true,
      },
      expect.objectContaining({
        moderationStatus: "FLAGGED",
      }),
      expect.objectContaining({
        returnDocument: "after",
      }),
    );
    expect(env.clearModeratedContentCache).toHaveBeenCalledWith(
      "ANSWER",
      "answer_1",
      2,
    );
  });

  it("rejects invalid target types during moderated content removal", async () => {
    await expect(
      removeModeratedContent("USER", "user_1"),
    ).rejects.toMatchObject({
      message: "Invalid target type",
      statusCode: 400,
    });
  });

  it("leaves the parent question active when the reported version is stale", async () => {
    env.questionFindById.mockReturnValueOnce(
      env.createQueryChain({
        _id: "question_1",
        currentVersion: 4,
        isActive: true,
        body: "body",
      }),
    );

    const result = await removeModeratedContent("QUESTION", "question_1", 3);

    expect(env.redisDel).toHaveBeenCalledWith("v:3:question:question_1");
    expect(env.clearVersionHistoryCache).toHaveBeenCalledWith("question_1");
    expect(result).toEqual({
      message:
        "Question version is no longer current, parent question left active",
      removed: false,
    });
  });

  it("removes answers, queues image cleanup, and clears answer caches", async () => {
    env.answerFindById.mockReturnValueOnce(
      env.createQueryChain({
        _id: "answer_1",
        questionId: "question_1",
        isActive: true,
        body: "![img](https://cdn.example.com/a.png)",
      }),
    );
    env.answerFindByIdAndUpdate.mockResolvedValueOnce({ _id: "answer_1" });

    const result = await removeModeratedContent("ANSWER", "answer_1");

    expect(env.answerFindByIdAndUpdate).toHaveBeenCalledWith("answer_1", {
      $set: { isActive: false },
    });
    expect(env.imageDeletionQueueAdd).toHaveBeenCalledWith(
      "DELETE_FROM_BODY",
      expect.objectContaining({
        entityType: "ANSWER",
        entityId: "answer_1",
      }),
      expect.objectContaining({
        jobId: "imageDeletion__DELETE_FROM_BODY__ANSWER__answer_1",
      }),
    );
    expect(env.redisDel).toHaveBeenCalledWith("question:question_1");
    expect(env.clearAnswerCache).toHaveBeenCalledWith("question_1");
    expect(result).toEqual({
      message: "Successfully removed moderated Answer",
      removed: true,
    });
  });
});
