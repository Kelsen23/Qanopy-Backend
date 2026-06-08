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

const awardBadge = vi.fn(async () => undefined);
const updateProfilePictureService = vi.fn(async () => undefined);
const processContentImage = vi.fn(async () => undefined);

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
  },
  awardBadgeService: {
    default: awardBadge,
  },
  updateProfilePictureService: {
    default: updateProfilePictureService,
  },
  processContentImageService: {
    default: processContentImage,
  },
};

export const mockUserWorkerTestEnvironment = {
  workerInstances,
  workerConstructor,
  redisMessagingClientConnection,
  awardBadge,
  updateProfilePictureService,
  processContentImage,
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

  awardBadge.mockReset().mockResolvedValue(undefined);
  updateProfilePictureService.mockReset().mockResolvedValue(undefined);
  processContentImage.mockReset().mockResolvedValue(undefined);
};
