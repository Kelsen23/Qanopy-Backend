import { vi } from "vitest";

type MockWorkerInstance = {
  name: string;
  processor: (job: {
    id?: string;
    name: string;
    data?: any;
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

const connectMongoDB = vi.fn(async () => undefined);
const processContent = vi.fn(async () => undefined);
const modActionLogUpdateOne = vi.fn(async () => undefined);
const moderationStatsFindUnique = vi.fn();
const moderationStatsUpdate = vi.fn(async () => undefined);

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

export const mockModerationWorkerModules = {
  bullmq: {
    Worker: workerConstructor,
  },
  redisConfig: {
    redisMessagingClientConnection,
  },
  mongodbConfig: {
    default: connectMongoDB,
  },
  processContentService: {
    default: processContent,
  },
  modActionLogModel: {
    default: {
      updateOne: modActionLogUpdateOne,
    },
  },
  prismaConfig: {
    default: {
      moderationStats: {
        findUnique: moderationStatsFindUnique,
        update: moderationStatsUpdate,
      },
    },
  },
};

export const mockModerationWorkerTestEnvironment = {
  workerInstances,
  workerConstructor,
  redisMessagingClientConnection,
  connectMongoDB,
  processContent,
  modActionLogUpdateOne,
  moderationStatsFindUnique,
  moderationStatsUpdate,
};

export const resetModerationWorkerTestEnvironment = () => {
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

  connectMongoDB.mockReset().mockResolvedValue(undefined);
  processContent.mockReset().mockResolvedValue(undefined);
  modActionLogUpdateOne.mockReset().mockResolvedValue(undefined);
  moderationStatsFindUnique.mockReset();
  moderationStatsUpdate.mockReset().mockResolvedValue(undefined);
};
