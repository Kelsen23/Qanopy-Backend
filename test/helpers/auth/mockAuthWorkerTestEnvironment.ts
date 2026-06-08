import { vi } from "vitest";

type MockWorkerInstance = {
  name: string;
  processor: (job: {
    id?: string;
    name: string;
    data?: unknown;
  }) => Promise<unknown>;
  options: Record<string, unknown>;
  on: ReturnType<typeof vi.fn>;
  events: Map<string, (...args: unknown[]) => unknown>;
};

const workerInstances: MockWorkerInstance[] = [];

const redisMessagingClientConnection = {
  host: "redis-messaging-test",
  port: 6379,
};

const cleanupAllExpiredUnverifiedUsers = vi.fn(async () => 0);
const deleteAccount = vi.fn(async () => undefined);
const connectMongoDB = vi.fn(async () => undefined);
const unverifiedAccountCleanupQueueAdd = vi.fn(async () => ({ id: "job-id" }));

const buildWorkerInstance = (
  name: string,
  processor: MockWorkerInstance["processor"],
  options: Record<string, unknown>,
) => {
  const events = new Map<string, (...args: unknown[]) => unknown>();
  const instance: MockWorkerInstance = {
    name,
    processor,
    options,
    events,
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      events.set(event, handler);
      return instance;
    }),
  };

  workerInstances.push(instance);
  return instance;
};

function workerConstructorImpl(
  this: unknown,
  name: string,
  processor: MockWorkerInstance["processor"],
  options: Record<string, unknown>,
) {
  return buildWorkerInstance(name, processor, options);
}

const workerConstructor = vi.fn(workerConstructorImpl);

export const mockAuthWorkerModules = {
  bullmq: {
    Worker: workerConstructor,
  },
  redisConfig: {
    redisMessagingClientConnection,
  },
  unverifiedAccountCleanupQueue: {
    default: {
      add: unverifiedAccountCleanupQueueAdd,
    },
  },
  unverifiedAccountCleanupService: {
    cleanupAllExpiredUnverifiedUsers,
  },
  mongodbConfig: {
    default: connectMongoDB,
  },
  deleteAccountService: {
    default: deleteAccount,
  },
};

export const mockAuthWorkerTestEnvironment = {
  workerInstances,
  workerConstructor,
  redisMessagingClientConnection,
  cleanupAllExpiredUnverifiedUsers,
  deleteAccount,
  connectMongoDB,
  unverifiedAccountCleanupQueueAdd,
};

export const resetAuthWorkerTestEnvironment = () => {
  workerInstances.splice(0, workerInstances.length);

  workerConstructor.mockReset().mockImplementation(
    function workerConstructorResetImpl(
      this: unknown,
      name: string,
      processor: MockWorkerInstance["processor"],
      options: Record<string, unknown>,
    ) {
      return buildWorkerInstance(name, processor, options);
    },
  );

  cleanupAllExpiredUnverifiedUsers.mockReset().mockResolvedValue(0);
  deleteAccount.mockReset().mockResolvedValue(undefined);
  connectMongoDB.mockReset().mockResolvedValue(undefined);
  unverifiedAccountCleanupQueueAdd.mockReset().mockResolvedValue({
    id: "job-id",
  });
};
