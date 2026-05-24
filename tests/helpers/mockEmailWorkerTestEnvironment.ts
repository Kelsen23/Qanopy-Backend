import { vi } from "vitest";

type MockWorkerInstance = {
  name: string;
  processor: (job: { id?: string; name: string; data?: unknown }) => Promise<unknown>;
  options: Record<string, unknown>;
  on: ReturnType<typeof vi.fn>;
  events: Map<string, (...args: unknown[]) => unknown>;
};

const workerInstances: MockWorkerInstance[] = [];

const redisMessagingClientConnection = {
  host: "redis-messaging-test",
  port: 6379,
};

const prismaUserFindUnique = vi.fn();
const sendMail = vi.fn(async () => ({ accepted: ["test@example.com"] }));
const isExpiredUnverifiedLocalUser = vi.fn(() => false);

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

export const mockEmailWorkerModules = {
  bullmq: {
    Worker: workerConstructor,
  },
  redisConfig: {
    redisMessagingClientConnection,
  },
  prismaConfig: {
    default: {
      user: {
        findUnique: prismaUserFindUnique,
      },
    },
  },
  nodemailerConfig: {
    default: {
      sendMail,
    },
  },
  unverifiedAccountCleanupService: {
    isExpiredUnverifiedLocalUser,
  },
};

export const mockEmailWorkerTestEnvironment = {
  workerInstances,
  workerConstructor,
  redisMessagingClientConnection,
  prismaUserFindUnique,
  sendMail,
  isExpiredUnverifiedLocalUser,
};

export const resetEmailWorkerTestEnvironment = () => {
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

  prismaUserFindUnique.mockReset();
  sendMail.mockReset().mockResolvedValue({ accepted: ["test@example.com"] });
  isExpiredUnverifiedLocalUser.mockReset().mockReturnValue(false);
};
