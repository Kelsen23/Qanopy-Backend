import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createAuthTestApp } from "../../../helpers/createTestApp.js";
import { createAuthServiceModuleMock } from "../../../helpers/createAuthServiceModuleMock.js";
import { mockAuthLimiters } from "../../../helpers/mockAuthLimiters.js";
import { mockAuthMiddlewares } from "../../../helpers/mockAuthMiddlewares.js";

const mocks = vi.hoisted(() => ({
  registerOrLoginService: vi.fn(),
}));

vi.mock("../../../../src/services/auth/auth.service.js", () => ({
  ...createAuthServiceModuleMock({
    registerOrLogin: mocks.registerOrLoginService,
  }),
}));

vi.mock(
  "../../../../src/middlewares/rate-limiters/auth.rate-limiters.js",
  () => mockAuthLimiters,
);

vi.mock(
  "../../../../src/middlewares/auth.middleware.js",
  () => mockAuthMiddlewares,
);

const app = await createAuthTestApp();

describe("POST /api/auth/oauth", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    mocks.registerOrLoginService.mockReset();
  });

  it("handles google oauth registration", async () => {
    mocks.registerOrLoginService.mockResolvedValue({
      user: {
        id: "user_1",
        tokenVersion: 0,
        username: "googleUser",
        email: "google@example.com",
      },
      action: "registered",
    });

    const response = await request(app).post("/api/auth/oauth").send({
      provider: "google",
      id_token: "google-token",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully registered",
      user: {
        username: "googleUser",
        email: "google@example.com",
      },
    });
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(mocks.registerOrLoginService).toHaveBeenCalledWith({
      provider: "google",
      idToken: "google-token",
    });
  });

  it("handles github oauth login", async () => {
    mocks.registerOrLoginService.mockResolvedValue({
      user: {
        id: "user_2",
        tokenVersion: 0,
        username: "githubUser",
        email: "github@example.com",
      },
      action: "loggedIn",
    });

    const response = await request(app).post("/api/auth/oauth").send({
      provider: "github",
      access_token: "github-token",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully logged in",
      user: {
        username: "githubUser",
        email: "github@example.com",
      },
    });
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(mocks.registerOrLoginService).toHaveBeenCalledWith({
      provider: "github",
      accessToken: "github-token",
    });
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app).post("/api/auth/oauth").send({
      provider: "twitter",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.registerOrLoginService).not.toHaveBeenCalled();
  });

  it("returns service errors", async () => {
    const error = new Error("Invalid Github access token") as Error & {
      statusCode?: number;
    };
    error.statusCode = 400;

    mocks.registerOrLoginService.mockRejectedValue(error);

    const response = await request(app).post("/api/auth/oauth").send({
      provider: "github",
      access_token: "bad-token",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid Github access token");
  });
});
