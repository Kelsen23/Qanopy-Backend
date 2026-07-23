import { describe, expect, it, vi } from "vitest";

const getFlattenedUsersByIds = vi.fn();

vi.mock("../../../src/services/user/userData.service.js", () => ({
  getFlattenedUsersByIds,
}));

const { default: createUserLoader } = await import(
  "../../../src/dataloaders/user.loader.js"
);

describe("user dataloader", () => {
  it("returns the nested sanitized user shape", async () => {
    getFlattenedUsersByIds.mockResolvedValue([
      {
        id: "user_1",
        username: "kelsen",
        email: "kelsen@example.com",
        role: "USER",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        auth: {
          authProvider: "LOCAL",
          isVerified: true,
        },
        profile: {
          displayName: "Kelsen",
          bio: "Builder",
          profilePictureUrl: "https://cdn.example.com/avatar.png",
          profilePictureKey: "avatar-key",
        },
        stats: {
          reputationPoints: 250,
          questionsAsked: 3,
          answersGiven: 4,
          acceptedAnswers: 1,
          bestAnswers: 2,
        },
        statusState: {
          status: "ACTIVE",
          isDeleted: false,
        },
      },
    ]);

    const loader = createUserLoader();

    await expect(loader.load("user_1")).resolves.toMatchObject({
      id: "user_1",
      auth: {
        authProvider: "LOCAL",
        isVerified: true,
      },
      profile: {
        displayName: "Kelsen",
        bio: "Builder",
        profilePictureUrl: "https://cdn.example.com/avatar.png",
        profilePictureKey: "avatar-key",
      },
      stats: {
        reputationPoints: 250,
        questionsAsked: 3,
        answersGiven: 4,
        acceptedAnswers: 1,
        bestAnswers: 2,
      },
      statusState: {
        status: "ACTIVE",
        isDeleted: false,
      },
    });
  });
});
