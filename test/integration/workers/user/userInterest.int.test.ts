import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockUserWorkerModules,
  mockUserWorkerTestEnvironment,
  resetUserWorkerTestEnvironment,
} from "../../../helpers/user/mockUserWorkerTestEnvironment.js";

vi.mock("bullmq", () => mockUserWorkerModules.bullmq);
vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockUserWorkerModules.redisConfig,
);
vi.mock(
  "../../../../src/config/mongodb.config.js",
  () => mockUserWorkerModules.mongodbConfig,
);
vi.mock(
  "../../../../src/models/userInterest.model.js",
  () => mockUserWorkerModules.userInterestModel,
);

const { startUserInterestWorker } = await import(
  "../../../../src/workers/user/userInterest.worker.js"
);

type InterestPipelineStage = {
  $set: {
    userId: string;
    interests: {
      $let: {
        in: {
          $cond: [
            unknown,
            unknown,
            {
              $concatArrays: [unknown, Array<{ tag: string; score: number }>];
            },
          ];
        };
      };
    };
  };
};

const getFirstInterestPipeline = () => {
  const calls = mockUserWorkerTestEnvironment.userInterestUpdateOne.mock
    .calls as unknown[][];
  const firstCall = calls[0];

  expect(firstCall).toBeDefined();
  if (!firstCall) {
    throw new Error("Expected userInterest.updateOne to be called");
  }

  const pipeline = firstCall[1];

  expect(pipeline).toBeDefined();
  if (!pipeline) {
    throw new Error("Expected userInterest.updateOne pipeline argument");
  }

  return pipeline as unknown as InterestPipelineStage[];
};

describe("userInterest worker", () => {
  const consoleLogSpy = vi
    .spyOn(console, "log")
    .mockImplementation(() => undefined);
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  const originalMongoUri = process.env.MONGO_URI;

  beforeEach(() => {
    resetUserWorkerTestEnvironment();
    process.env.MONGO_URI = "mongodb://localhost:27017/test";
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    process.env.MONGO_URI = originalMongoUri;
    vi.clearAllMocks();
  });

  it("connects Mongo and creates the worker with the expected config", async () => {
    await startUserInterestWorker();

    expect(mockUserWorkerTestEnvironment.connectMongoDB).toHaveBeenCalledWith(
      "mongodb://localhost:27017/test",
    );
    expect(mockUserWorkerTestEnvironment.workerInstances).toHaveLength(1);

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    expect(worker.name).toBe("userInterestQueue");
    expect(worker.options).toMatchObject({
      connection: mockUserWorkerTestEnvironment.redisMessagingClientConnection,
      concurrency: 5,
      limiter: {
        max: 20,
        duration: 1000,
      },
    });
    expect(worker.events.has("completed")).toBe(true);
    expect(worker.events.has("failed")).toBe(true);
    expect(worker.events.has("error")).toBe(true);
  });

  it("applies view scores once per unique tag", async () => {
    await startUserInterestWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    await worker.processor({
      name: "VIEW",
      id: "job-1",
      data: {
        userId: "user_1",
        tags: ["typescript", "typescript", "nodejs"],
      },
    });

    expect(
      mockUserWorkerTestEnvironment.userInterestUpdateOne,
    ).toHaveBeenCalledTimes(2);
    const firstPipeline = getFirstInterestPipeline();
    expect(firstPipeline[0].$set.userId).toBe("user_1");
    expect(
      firstPipeline[0].$set.interests.$let.in.$cond[2].$concatArrays[1][0],
    ).toEqual({
      tag: "typescript",
      score: 1,
    });
  });

  it("applies upvote scores", async () => {
    await startUserInterestWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    await worker.processor({
      name: "UPVOTE",
      id: "job-1",
      data: {
        userId: "user_1",
        tags: ["mongodb"],
      },
    });

    const pipeline = getFirstInterestPipeline();
    expect(
      pipeline[0].$set.interests.$let.in.$cond[2].$concatArrays[1][0],
    ).toEqual({
      tag: "mongodb",
      score: 3,
    });
  });

  it("applies answer scores", async () => {
    await startUserInterestWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    await worker.processor({
      name: "ANSWER",
      id: "job-1",
      data: {
        userId: "user_1",
        tags: ["redis"],
      },
    });

    const pipeline = getFirstInterestPipeline();
    expect(
      pipeline[0].$set.interests.$let.in.$cond[2].$concatArrays[1][0],
    ).toEqual({
      tag: "redis",
      score: 5,
    });
  });

  it("rejects unsupported job names", async () => {
    await startUserInterestWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    await expect(
      worker.processor({
        name: "INVALID_ACTION",
        id: "job-1",
        data: {
          userId: "user_1",
          tags: ["redis"],
        },
      }),
    ).rejects.toThrow("Unsupported user interest action: INVALID_ACTION");
  });

  it("rejects cleanly when Mongo connection fails", async () => {
    mockUserWorkerTestEnvironment.connectMongoDB.mockRejectedValueOnce(
      new Error("mongo down"),
    );

    await expect(startUserInterestWorker()).rejects.toThrow("mongo down");
    expect(mockUserWorkerTestEnvironment.workerInstances).toHaveLength(0);
  });

  it("rejects cleanly when worker construction fails", async () => {
    mockUserWorkerTestEnvironment.workerConstructor.mockImplementationOnce(
      function workerConstructorFailure() {
        throw new Error("worker failed");
      },
    );

    await expect(startUserInterestWorker()).rejects.toThrow("worker failed");
  });
});
