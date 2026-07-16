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

const redisCacheClientDelete = vi.fn(async () => 1);
const redisCacheClientScan = vi.fn(
  async () => ["0", []] as [string, string[]],
);
const connectMongoDB = vi.fn(async () => undefined);
const awardBadge = vi.fn(async () => undefined);
const updateProfilePictureService = vi.fn(async () => undefined);
const processAccountDeletionService = vi.fn(async () => undefined);
const updateUserStats = vi.fn(async () => undefined);
const questionFindByIdAndUpdate = vi.fn(async () => undefined);
const answerFindByIdAndUpdate = vi.fn(async () => undefined);
const userInterestUpdateOne = vi.fn(async () => undefined);

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

export const mockUserWorkerModules = {
  bullmq: {
    Worker: workerConstructor,
  },
  redisConfig: {
    redisMessagingClientConnection,
    getRedisCacheClient: () => ({
      del: redisCacheClientDelete,
      scan: redisCacheClientScan,
    }),
  },
  mongodbConfig: {
    default: connectMongoDB,
  },
  awardBadgeService: {
    default: awardBadge,
  },
  updateProfilePictureService: {
    default: updateProfilePictureService,
  },
  processAccountDeletionService: {
    default: processAccountDeletionService,
  },
  updateUserStatsUtil: {
    default: updateUserStats,
  },
  questionModel: {
    default: {
      findByIdAndUpdate: questionFindByIdAndUpdate,
    },
  },
  answerModel: {
    default: {
      findByIdAndUpdate: answerFindByIdAndUpdate,
    },
  },
  userInterestModel: {
    default: {
      updateOne: userInterestUpdateOne,
    },
  },
};

export const mockUserWorkerTestEnvironment = {
  workerInstances,
  workerConstructor,
  redisMessagingClientConnection,
  redisCacheClientDelete,
  redisCacheClientScan,
  connectMongoDB,
  awardBadge,
  updateProfilePictureService,
  processAccountDeletionService,
  updateUserStats,
  questionFindByIdAndUpdate,
  answerFindByIdAndUpdate,
  userInterestUpdateOne,
};

export const resetUserWorkerTestEnvironment = () => {
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

  redisCacheClientDelete.mockReset().mockResolvedValue(1);
  redisCacheClientScan.mockReset().mockResolvedValue(["0", []]);
  connectMongoDB.mockReset().mockResolvedValue(undefined);
  awardBadge.mockReset().mockResolvedValue(undefined);
  updateProfilePictureService.mockReset().mockResolvedValue(undefined);
  processAccountDeletionService.mockReset().mockResolvedValue(undefined);
  updateUserStats.mockReset().mockResolvedValue(undefined);
  questionFindByIdAndUpdate.mockReset().mockResolvedValue(undefined);
  answerFindByIdAndUpdate.mockReset().mockResolvedValue(undefined);
  userInterestUpdateOne.mockReset().mockResolvedValue(undefined);
};
