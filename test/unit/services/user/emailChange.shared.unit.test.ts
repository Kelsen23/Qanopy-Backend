import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockUserUnitModules,
  resetUserUnitTestEnvironment,
  mockUserUnitTestEnvironment as userUnitTestEnvironment,
} from "../../../helpers/user/mockUserUnitTestEnvironment.js";

vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockUserUnitModules.redisConfig,
);

const {
  EMAIL_CHANGE_OTP_ATTEMPTS_TTL_SECONDS,
  getEmailChangeAttemptsKey,
  removeEmailChangeAttempts,
} = await import("../../../../src/services/user/emailChange.shared.js");

describe("emailChange.shared", () => {
  beforeEach(() => {
    resetUserUnitTestEnvironment();
  });

  it("builds the attempts key", () => {
    expect(getEmailChangeAttemptsKey("user_1")).toBe(
      "user:email-change:attempts:user_1",
    );
    expect(EMAIL_CHANGE_OTP_ATTEMPTS_TTL_SECONDS).toBe(120);
  });

  it("removes the attempts key from redis", async () => {
    await removeEmailChangeAttempts("user_1");

    expect(userUnitTestEnvironment.redisDel).toHaveBeenCalledWith(
      "user:email-change:attempts:user_1",
    );
  });
});
