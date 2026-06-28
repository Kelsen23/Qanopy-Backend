import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockModerationUnitModules,
  mockModerationUnitTestEnvironment as moderationUnitTestEnvironment,
  resetModerationUnitTestEnvironment,
} from "../../../helpers/moderation/mockModerationUnitTestEnvironment.js";

vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockModerationUnitModules.prismaConfig,
);
vi.mock(
  "../../../../src/services/moderation/getActiveBanState.service.js",
  () => mockModerationUnitModules.getActiveBanStateService,
);

const { default: actualGetActiveBanState } = await vi.importActual<
  typeof import("../../../../src/services/moderation/getActiveBanState.service.js")
>("../../../../src/services/moderation/getActiveBanState.service.js");
const { default: resolveUserBanState } = await import(
  "../../../../src/services/moderation/resolveUserBanState.service.js"
);

describe("moderation ban state services", () => {
  beforeEach(() => {
    resetModerationUnitTestEnvironment();
  });

  it("derives active ban state with permanent bans taking precedence over temporary bans", async () => {
    moderationUnitTestEnvironment.prismaBanFindMany.mockResolvedValueOnce([
      {
        id: "ban_temp",
        title: "Temp",
        reasons: ["Abuse"],
        banType: "TEMP",
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        durationMs: 3600,
      },
      {
        id: "ban_perm",
        title: "Perm",
        reasons: ["Severe abuse"],
        banType: "PERM",
        expiresAt: null,
        durationMs: null,
      },
    ]);

    const result = await actualGetActiveBanState(
      {
        ban: { findMany: moderationUnitTestEnvironment.prismaBanFindMany },
      } as any,
      "user_1",
      new Date("2029-01-01T00:00:00.000Z"),
    );

    expect(result).toMatchObject({
      activeBan: expect.objectContaining({ id: "ban_perm" }),
      hasActivePermBan: true,
      derivedStatus: "TERMINATED",
    });
  });

  it("resolves expired bans, cleans stale active records, and updates user status", async () => {
    moderationUnitTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      status: "SUSPENDED",
    });
    moderationUnitTestEnvironment.getActiveBanState
      .mockResolvedValueOnce({
        activeBans: [
          {
            id: "ban_1",
            banType: "TEMP",
            expiresAt: new Date("2020-01-01T00:00:00.000Z"),
          },
        ],
      })
      .mockResolvedValueOnce({
        activeBan: null,
        derivedStatus: "ACTIVE",
      });
    moderationUnitTestEnvironment.prismaBanUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 });

    const result = await resolveUserBanState("user_1");

    expect(
      moderationUnitTestEnvironment.prismaBanUpdateMany,
    ).toHaveBeenNthCalledWith(1, {
      where: {
        id: { in: ["ban_1"] },
      },
      data: { isActive: false },
    });
    expect(moderationUnitTestEnvironment.prismaUserUpdate).toHaveBeenCalledWith(
      {
        where: { id: "user_1" },
        data: { status: "ACTIVE" },
      },
    );
    expect(result).toEqual({
      activeBan: null,
      status: "ACTIVE",
      changed: true,
    });
  });
});
