import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
  authMiddlewareEnvironment,
  mockAuthMiddlewareModules,
  resetAuthMiddlewareEnvironment,
  seedJwtPayload,
  seedRedisAuthUser,
} from "../../../helpers/auth/mockAuthMiddlewareEnvironment.js";
import {
  mockSocketAuthModules,
  resetSocketAuthEnvironment,
  initializeSocketUserSession,
  removeUserSocket,
} from "../../../helpers/mockSocketAuthEnvironment.js";
import createSocketTestServer from "../../../helpers/createSocketTestServer.js";

vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockAuthMiddlewareModules.prismaConfig,
);

vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockAuthMiddlewareModules.redisConfig,
);

vi.mock("jsonwebtoken", () => mockAuthMiddlewareModules.jsonwebtoken);

vi.mock(
  "../../../../src/sockets/subscribers/socketEmit.subscriber.js",
  () => mockSocketAuthModules.socketEmitSubscriber,
);

vi.mock(
  "../../../../src/sockets/subscribers/socketDisconnect.subscriber.js",
  () => mockSocketAuthModules.socketDisconnectSubscriber,
);

vi.mock(
  "../../../../src/sockets/listeners/editSession.listener.js",
  () => mockSocketAuthModules.editSessionListener,
);

vi.mock(
  "../../../../src/sockets/listeners/aiAnswerSession.listener.js",
  () => mockSocketAuthModules.aiAnswerSessionListener,
);

vi.mock(
  "../../../../src/sockets/listeners/questionSession.listener.js",
  () => mockSocketAuthModules.questionSessionListener,
);

vi.mock(
  "../../../../src/services/socket/initializeSocketUserSession.service.js",
  () => mockSocketAuthModules.initializeSocketUserSession,
);

vi.mock(
  "../../../../src/services/redis/presence.service.js",
  () => mockSocketAuthModules.presenceService,
);

describe("Socket auth", () => {
  let server!: Awaited<ReturnType<typeof createSocketTestServer>>;

  const waitForCondition = async (
    assertion: () => void,
    timeoutMs = 3000,
    intervalMs = 25,
  ) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      try {
        assertion();
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    assertion();
  };

  beforeEach(async () => {
    process.env.JWT_SECRET = "test-jwt-secret";
    resetAuthMiddlewareEnvironment();
    resetSocketAuthEnvironment();
    server = await createSocketTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("rejects missing handshake tokens", async () => {
    await expect(server.connect()).rejects.toMatchObject({
      message: "Not authenticated: no token",
    });
  });

  it("rejects invalid JWTs", async () => {
    await expect(server.connect("invalid-token")).rejects.toMatchObject({
      message: "Authentication failed",
    });
  });

  it("loads users from prisma on a cache miss", async () => {
    seedJwtPayload("valid-token", {
      userId: "user_1",
      tokenVersion: 0,
    });
    authMiddlewareEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: true,
      isDeleted: false,
    });

    const socket = await server.connect("valid-token");

    expect(socket.connected).toBe(true);
    expect(initializeSocketUserSession).toHaveBeenCalledWith(
      "user_1",
      socket.id,
    );
    expect(
      authMiddlewareEnvironment.prismaUserFindUnique,
    ).toHaveBeenCalledTimes(1);

    socket.disconnect();
  });

  it("uses cached users without a prisma lookup", async () => {
    seedJwtPayload("cached-token", {
      userId: "user_1",
      tokenVersion: 0,
    });
    seedRedisAuthUser({
      id: "user_1",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: true,
      role: "USER",
      isDeleted: false,
    });

    const socket = await server.connect("cached-token");

    expect(socket.connected).toBe(true);
    expect(initializeSocketUserSession).toHaveBeenCalledWith(
      "user_1",
      socket.id,
    );
    expect(
      authMiddlewareEnvironment.prismaUserFindUnique,
    ).not.toHaveBeenCalled();

    socket.disconnect();
  });

  it("rejects missing users", async () => {
    seedJwtPayload("missing-user-token", {
      userId: "user_1",
      tokenVersion: 0,
    });
    authMiddlewareEnvironment.prismaUserFindUnique.mockResolvedValue(null);

    await expect(server.connect("missing-user-token")).rejects.toMatchObject({
      message: "Authentication failed",
    });
  });

  it("rejects token version mismatches", async () => {
    seedJwtPayload("stale-token", {
      userId: "user_1",
      tokenVersion: 0,
    });
    authMiddlewareEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      tokenVersion: 1,
      status: "ACTIVE",
      isVerified: true,
      isDeleted: false,
    });

    await expect(server.connect("stale-token")).rejects.toMatchObject({
      message: "Authentication failed",
    });
  });

  it("rejects unverified users", async () => {
    seedJwtPayload("unverified-token", {
      userId: "user_1",
      tokenVersion: 0,
    });
    authMiddlewareEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: false,
      isDeleted: false,
    });

    await expect(server.connect("unverified-token")).rejects.toMatchObject({
      message: "Authentication failed",
    });
  });

  it("rejects inactive or deleted users", async () => {
    seedJwtPayload("deleted-token", {
      userId: "user_1",
      tokenVersion: 0,
    });
    authMiddlewareEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      tokenVersion: 0,
      status: "SUSPENDED",
      isVerified: true,
      isDeleted: true,
    });

    await expect(server.connect("deleted-token")).rejects.toMatchObject({
      message: "Authentication failed",
    });
  });

  it("disconnects sockets and removes the socket binding", async () => {
    seedJwtPayload("disconnect-token", {
      userId: "user_1",
      tokenVersion: 0,
    });
    authMiddlewareEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: true,
      isDeleted: false,
    });

    const socket = await server.connect("disconnect-token");
    const socketId = socket.id;
    socket.disconnect();

    await waitForCondition(() => {
      expect(removeUserSocket).toHaveBeenCalledWith(socketId);
    });
  });
});
