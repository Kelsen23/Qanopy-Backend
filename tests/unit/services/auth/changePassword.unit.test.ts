import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockAuthUnitModules,
  resetAuthUnitTestEnvironment,
  seedBcryptCompareResult,
  mockAuthUnitTestEnvironment as authUnitTestEnvironment,
} from "../../../helpers/mockAuthUnitTestEnvironment.js";

vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockAuthUnitModules.prismaConfig,
);
vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockAuthUnitModules.redisConfig,
);
vi.mock("bcrypt", () => mockAuthUnitModules.bcrypt);
vi.mock(
  "../../../../src/utils/publishSocketDisconnect.util.js",
  () => mockAuthUnitModules.publishSocketDisconnect,
);

const { default: changePassword } = await import(
  "../../../../src/services/auth/changePassword.service.js"
);

describe("changePassword service", () => {
  beforeEach(() => {
    resetAuthUnitTestEnvironment();
  });

  it("rejects missing users", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(null);

    await expect(
      changePassword({
        userId: "user_1",
        currentPassword: "Password1!",
        newPassword: "Password2!",
      }),
    ).rejects.toMatchObject({
      message: "Invalid credentials",
      statusCode: 404,
    });
  });

  it("rejects invalid current passwords", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      password: "hashed:Password1!:10",
      authProvider: "LOCAL",
    });
    seedBcryptCompareResult("Password1!", "hashed:Password1!:10", false);

    await expect(
      changePassword({
        userId: "user_1",
        currentPassword: "Password1!",
        newPassword: "Password2!",
      }),
    ).rejects.toMatchObject({
      message: "Invalid current password",
      statusCode: 401,
    });
  });

  it("rejects reusing the same password", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      password: "hashed:Password1!:10",
      authProvider: "LOCAL",
    });
    seedBcryptCompareResult("Password1!", "hashed:Password1!:10", true);
    seedBcryptCompareResult("Password2!", "hashed:Password1!:10", true);

    await expect(
      changePassword({
        userId: "user_1",
        currentPassword: "Password1!",
        newPassword: "Password2!",
      }),
    ).rejects.toMatchObject({
      message: "New password must be different from the old password",
      statusCode: 400,
    });
  });

  it("updates the password and invalidates auth caches", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      password: "hashed:Password1!:10",
      authProvider: "LOCAL",
    });
    seedBcryptCompareResult("Password1!", "hashed:Password1!:10", true);
    seedBcryptCompareResult("Password2!", "hashed:Password1!:10", false);
    authUnitTestEnvironment.prismaUserUpdate.mockResolvedValue({
      id: "user_1",
      password: "hashed:Password2!:10",
    });

    const result = await changePassword({
      userId: "user_1",
      currentPassword: "Password1!",
      newPassword: "Password2!",
    });

    expect(result.user.id).toBe("user_1");
    expect(
      authUnitTestEnvironment.publishSocketDisconnect,
    ).toHaveBeenCalledWith("user_1");
    expect(authUnitTestEnvironment.redisDel).toHaveBeenCalledWith(
      "auth:reset-password:attempts:user_1",
    );
    expect(authUnitTestEnvironment.redisSet).toHaveBeenCalled();
  });
});
