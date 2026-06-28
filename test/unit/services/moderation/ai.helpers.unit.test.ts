import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockModerationUnitModules,
  mockModerationUnitTestEnvironment as moderationUnitTestEnvironment,
  resetModerationUnitTestEnvironment,
} from "../../../helpers/moderation/mockModerationUnitTestEnvironment.js";

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

const { default: loadModerationContent } = await import(
  "../../../../src/services/moderation/ai/loadModerationContent.service.js"
);
const { default: isAiModerationTargetStillPending } = await import(
  "../../../../src/services/moderation/ai/isAiModerationTargetStillPending.service.js"
);

describe("moderation AI helper services", () => {
  beforeEach(() => {
    resetModerationUnitTestEnvironment();
  });

  it("loads question moderation content by version and answer content by id", async () => {
    moderationUnitTestEnvironment.questionVersionFindOne.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({
        questionId: "question_1",
        version: 4,
        title: "Title",
        body: "Body",
      }),
    );
    moderationUnitTestEnvironment.answerFindById.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({
        userId: "user_1",
        body: "Answer body",
        moderationStatus: "PENDING",
        moderationRevision: 2,
        isActive: true,
        isDeleted: false,
      }),
    );

    await expect(
      loadModerationContent("question_1", "QUESTION", 4),
    ).resolves.toEqual({
      contentType: "QUESTION",
      content: expect.objectContaining({
        questionId: "question_1",
        version: 4,
      }),
    });
    await expect(
      loadModerationContent("answer_1", "ANSWER", 2),
    ).resolves.toEqual({
      contentType: "ANSWER",
      content: expect.objectContaining({
        moderationRevision: 2,
      }),
    });
  });

  it("checks whether AI moderation targets are still pending for question and reply content", async () => {
    moderationUnitTestEnvironment.questionVersionFindOne.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({ _id: "version_1" }),
    );
    moderationUnitTestEnvironment.questionFindOne.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({ _id: "question_1" }),
    );
    moderationUnitTestEnvironment.replyFindOne.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain(null),
    );

    await expect(
      isAiModerationTargetStillPending("question_1", "QUESTION", 4),
    ).resolves.toBe(true);
    await expect(
      isAiModerationTargetStillPending("reply_1", "REPLY", 2),
    ).resolves.toBe(false);
  });
});
