import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockEmailWorkerModules,
  mockEmailWorkerTestEnvironment,
  resetEmailWorkerTestEnvironment,
} from "../../../helpers/mockEmailWorkerTestEnvironment.js";

vi.mock("bullmq", () => mockEmailWorkerModules.bullmq);
vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockEmailWorkerModules.redisConfig,
);
vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockEmailWorkerModules.prismaConfig,
);
vi.mock(
  "../../../../src/config/nodemailer.config.js",
  () => mockEmailWorkerModules.nodemailerConfig,
);
vi.mock(
  "../../../../src/services/auth/unverifiedAccountCleanup.service.js",
  () => mockEmailWorkerModules.unverifiedAccountCleanupService,
);
vi.mock(
  "../../../../src/services/user/userData.service.js",
  () => mockEmailWorkerModules.userDataService,
);

const { startEmailWorker } = await import(
  "../../../../src/workers/email/email.worker.js"
);

describe("email worker", () => {
  const consoleLogSpy = vi
    .spyOn(console, "log")
    .mockImplementation(() => undefined);
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  const originalEmail = process.env.QANOPY_EMAIL;

  beforeEach(() => {
    resetEmailWorkerTestEnvironment();
    process.env.QANOPY_EMAIL = "noreply@qanopy.test";
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    process.env.QANOPY_EMAIL = originalEmail;
    vi.clearAllMocks();
  });

  it("creates the worker with the expected config", async () => {
    await startEmailWorker();

    expect(mockEmailWorkerTestEnvironment.workerInstances).toHaveLength(1);
    const worker = mockEmailWorkerTestEnvironment.workerInstances[0];

    expect(worker.name).toBe("emailQueue");
    expect(worker.options).toMatchObject({
      connection: mockEmailWorkerTestEnvironment.redisMessagingClientConnection,
      concurrency: 20,
      limiter: {
        max: 20,
        duration: 1000,
      },
    });
    expect(worker.events.has("completed")).toBe(true);
    expect(worker.events.has("failed")).toBe(true);
    expect(worker.events.has("error")).toBe(true);
  });

  it("sends email when no userId is present", async () => {
    await startEmailWorker();

    const worker = mockEmailWorkerTestEnvironment.workerInstances[0];
    await worker.processor({
      name: "SEND",
      id: "job-1",
      data: {
        email: "alice@example.com",
        subject: "Hello",
        htmlContent: "<p>Hello</p>",
      },
    });

    expect(mockEmailWorkerTestEnvironment.sendMail).toHaveBeenCalledWith({
      from: "'Qanopy' <noreply@qanopy.test>",
      to: "alice@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
    });
  });

  it("skips missing users and deleted or non-local users", async () => {
    await startEmailWorker();

    const worker = mockEmailWorkerTestEnvironment.workerInstances[0];

    mockEmailWorkerTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce(
      null,
    );
    await worker.processor({
      name: "VERIFY",
      id: "job-1",
      data: {
        email: "alice@example.com",
        subject: "Verify",
        htmlContent: "<p>Verify</p>",
        userId: "user_1",
        purpose: "VERIFY_EMAIL",
      },
    });

    mockEmailWorkerTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      id: "user_1",
      email: "alice@example.com",
      createdAt: new Date(),
      authProvider: "LOCAL",
      isVerified: false,
      isDeleted: true,
    });
    await worker.processor({
      name: "VERIFY",
      id: "job-2",
      data: {
        email: "alice@example.com",
        subject: "Verify",
        htmlContent: "<p>Verify</p>",
        userId: "user_1",
        purpose: "VERIFY_EMAIL",
      },
    });

    mockEmailWorkerTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      id: "user_1",
      email: "alice@example.com",
      createdAt: new Date(),
      authProvider: "GOOGLE",
      isVerified: false,
      isDeleted: false,
    });
    await worker.processor({
      name: "VERIFY",
      id: "job-3",
      data: {
        email: "alice@example.com",
        subject: "Verify",
        htmlContent: "<p>Verify</p>",
        userId: "user_1",
        purpose: "VERIFY_EMAIL",
      },
    });

    expect(mockEmailWorkerTestEnvironment.sendMail).not.toHaveBeenCalled();
  });

  it("skips verify email jobs for verified or expired users", async () => {
    await startEmailWorker();

    const worker = mockEmailWorkerTestEnvironment.workerInstances[0];

    mockEmailWorkerTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      id: "user_1",
      email: "alice@example.com",
      createdAt: new Date(),
      authProvider: "LOCAL",
      isVerified: true,
      isDeleted: false,
      otpExpireAt: null,
      resetPasswordOtpExpireAt: new Date(Date.now() + 60_000),
      emailChangePendingEmail: null,
      emailChangeOtpExpireAt: null,
      emailChangeOtp: null,
    });
    await worker.processor({
      name: "VERIFY",
      id: "job-1",
      data: {
        email: "alice@example.com",
        subject: "Verify",
        htmlContent: "<p>Verify</p>",
        userId: "user_1",
        purpose: "VERIFY_EMAIL",
      },
    });

    mockEmailWorkerTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      id: "user_2",
      email: "bob@example.com",
      createdAt: new Date(),
      authProvider: "LOCAL",
      isVerified: false,
      isDeleted: false,
    });
    mockEmailWorkerTestEnvironment.isExpiredUnverifiedLocalUser.mockReturnValueOnce(
      true,
    );
    await worker.processor({
      name: "VERIFY",
      id: "job-2",
      data: {
        email: "bob@example.com",
        subject: "Verify",
        htmlContent: "<p>Verify</p>",
        userId: "user_2",
        purpose: "VERIFY_EMAIL",
      },
    });

    expect(mockEmailWorkerTestEnvironment.sendMail).not.toHaveBeenCalled();
  });

  it("sends reset password emails for valid users", async () => {
    await startEmailWorker();

    const worker = mockEmailWorkerTestEnvironment.workerInstances[0];
    mockEmailWorkerTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      id: "user_1",
      email: "alice@example.com",
      createdAt: new Date(),
      authProvider: "LOCAL",
      isVerified: true,
      isDeleted: false,
      otpExpireAt: null,
      resetPasswordOtpExpireAt: new Date(Date.now() + 60_000),
      emailChangePendingEmail: null,
      emailChangeOtpExpireAt: null,
      emailChangeOtp: null,
    });

    await worker.processor({
      name: "RESET",
      id: "job-1",
      data: {
        email: "alice@example.com",
        subject: "Reset",
        htmlContent: "<p>Reset</p>",
        userId: "user_1",
        purpose: "RESET_PASSWORD",
      },
    });

    expect(mockEmailWorkerTestEnvironment.sendMail).toHaveBeenCalledWith({
      from: "'Qanopy' <noreply@qanopy.test>",
      to: "alice@example.com",
      subject: "Reset",
      html: "<p>Reset</p>",
    });
  });
});
