import { getRedisCacheClient } from "../../../config/redis.config.js";

import updateUserStats from "../../../utils/user/updateUserStats.util.js";

import Answer from "../../../models/answer.model.js";
import Question from "../../../models/question.model.js";

type StatsDelta = {
  increment?: number;
  decrement?: number;
};

type PrismaStatsUpdate = {
  data: Record<string, StatsDelta>;
};

type MongoStatsUpdate = {
  model: "Question" | "Answer";
  idKey: "questionId" | "answerId";
  update: {
    $inc: Record<string, number>;
  };
};

type StatsActionDescriptor = {
  prisma?: PrismaStatsUpdate;
  mongo?: MongoStatsUpdate;
};

type StatsJobData = {
  userId: string;
  action?: string;
  eventId?: string;
  mongoTargetId?: string;
  questionId?: string;
  answerId?: string;
};

const STATS_JOB_IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24 * 7;

const STATS_ACTIONS: Record<string, StatsActionDescriptor> = {
  ASK_QUESTION: {
    prisma: { data: { questionsAsked: { increment: 1 } } },
  },
  GIVE_ANSWER: {
    prisma: {
      data: {
        answersGiven: { increment: 1 },
        reputationPoints: { increment: 2 },
      },
    },
    mongo: {
      model: "Question",
      idKey: "questionId",
      update: { $inc: { answerCount: 1 } },
    },
  },
  GIVE_REPLY: {
    mongo: {
      model: "Answer",
      idKey: "answerId",
      update: { $inc: { replyCount: 1 } },
    },
  },
  CHANGE_DOWNVOTE_TO_UPVOTE_QUESTION: {
    prisma: {
      data: { reputationPoints: { increment: 20 } },
    },
  },
  CHANGE_UPVOTE_TO_DOWNVOTE_QUESTION: {
    prisma: {
      data: { reputationPoints: { decrement: 20 } },
    },
  },
  CHANGE_DOWNVOTE_TO_UPVOTE_ANSWER: {
    prisma: {
      data: { reputationPoints: { increment: 20 } },
    },
  },
  CHANGE_UPVOTE_TO_DOWNVOTE_ANSWER: {
    prisma: {
      data: { reputationPoints: { decrement: 20 } },
    },
  },
  CHANGE_DOWNVOTE_TO_UPVOTE_REPLY: {
    prisma: {
      data: { reputationPoints: { increment: 10 } },
    },
  },
  CHANGE_UPVOTE_TO_DOWNVOTE_REPLY: {
    prisma: {
      data: { reputationPoints: { decrement: 10 } },
    },
  },
  RECEIVE_UPVOTE_QUESTION: {
    prisma: {
      data: { reputationPoints: { increment: 10 } },
    },
  },
  RECEIVE_DOWNVOTE_QUESTION: {
    prisma: {
      data: { reputationPoints: { decrement: 10 } },
    },
  },
  RECEIVE_UPVOTE_ANSWER: {
    prisma: {
      data: { reputationPoints: { increment: 10 } },
    },
  },
  RECEIVE_DOWNVOTE_ANSWER: {
    prisma: {
      data: { reputationPoints: { decrement: 10 } },
    },
  },
  RECEIVE_UPVOTE_REPLY: {
    prisma: {
      data: { reputationPoints: { increment: 5 } },
    },
  },
  RECEIVE_DOWNVOTE_REPLY: {
    prisma: {
      data: { reputationPoints: { decrement: 5 } },
    },
  },
  UNVOTE_UPVOTE_QUESTION: {
    prisma: {
      data: { reputationPoints: { decrement: 10 } },
    },
  },
  UNVOTE_DOWNVOTE_QUESTION: {
    prisma: {
      data: { reputationPoints: { increment: 10 } },
    },
  },
  UNVOTE_UPVOTE_ANSWER: {
    prisma: {
      data: { reputationPoints: { decrement: 10 } },
    },
  },
  UNVOTE_DOWNVOTE_ANSWER: {
    prisma: {
      data: { reputationPoints: { increment: 10 } },
    },
  },
  UNVOTE_UPVOTE_REPLY: {
    prisma: {
      data: { reputationPoints: { decrement: 5 } },
    },
  },
  UNVOTE_DOWNVOTE_REPLY: {
    prisma: {
      data: { reputationPoints: { increment: 5 } },
    },
  },
  ACCEPT_ANSWER: {
    prisma: {
      data: {
        acceptedAnswers: { increment: 1 },
        reputationPoints: { increment: 10 },
      },
    },
    mongo: {
      model: "Question",
      idKey: "questionId",
      update: { $inc: { acceptedAnswerCount: 1 } },
    },
  },
  UNACCEPT_BEST_ANSWER: {
    prisma: {
      data: {
        acceptedAnswers: { decrement: 1 },
        bestAnswers: { decrement: 1 },
        reputationPoints: { decrement: 25 },
      },
    },
    mongo: {
      model: "Question",
      idKey: "questionId",
      update: { $inc: { acceptedAnswerCount: -1 } },
    },
  },
  UNACCEPT_ANSWER: {
    prisma: {
      data: {
        acceptedAnswers: { decrement: 1 },
        reputationPoints: { decrement: 10 },
      },
    },
    mongo: {
      model: "Question",
      idKey: "questionId",
      update: { $inc: { acceptedAnswerCount: -1 } },
    },
  },
  MARK_ANSWER_AS_BEST: {
    prisma: {
      data: {
        reputationPoints: { increment: 15 },
        bestAnswers: { increment: 1 },
      },
    },
  },
  UNMARK_ANSWER_AS_BEST: {
    prisma: {
      data: {
        reputationPoints: { decrement: 15 },
        bestAnswers: { decrement: 1 },
      },
    },
  },
  DELETE_QUESTION: {
    prisma: {
      data: {
        questionsAsked: { decrement: 1 },
      },
    },
  },
  DELETE_ANSWER: {
    prisma: {
      data: {
        answersGiven: { decrement: 1 },
        reputationPoints: { decrement: 2 },
      },
    },
    mongo: {
      model: "Question",
      idKey: "questionId",
      update: { $inc: { answerCount: -1 } },
    },
  },
  DELETE_REPLY: {
    mongo: {
      model: "Answer",
      idKey: "answerId",
      update: { $inc: { replyCount: -1 } },
    },
  },
};

type StatsActionName = keyof typeof STATS_ACTIONS;

type StatsPhase = "prisma" | "mongo";

const getStatsJobStateKey = (eventId: string) => `stats:state:${eventId}`;

const getStatsJobLockKey = (eventId: string) => `stats:lock:${eventId}`;

const getStatsJobIdempotencyKey = (jobData: StatsJobData) =>
  jobData.eventId ? getStatsJobStateKey(jobData.eventId) : null;

const getStatsActionName = (
  jobName: string,
  jobData: StatsJobData,
): StatsActionName | undefined => {
  if (jobName in STATS_ACTIONS) {
    return jobName as StatsActionName;
  }

  if (typeof jobData.action === "string" && jobData.action in STATS_ACTIONS) {
    return jobData.action as StatsActionName;
  }

  return undefined;
};

const getStatsModel = (model: MongoStatsUpdate["model"]) =>
  model === "Question" ? Question : Answer;

const getCompletedStatsPhases = async (stateKey: string | null) => {
  if (!stateKey) return { prisma: false, mongo: false } as const;

  const state = await getRedisCacheClient().hgetall(stateKey);

  return {
    prisma: state.prisma === "1",
    mongo: state.mongo === "1",
  } as const;
};

const markStatsPhaseComplete = async (
  stateKey: string | null,
  phase: StatsPhase,
) => {
  if (!stateKey) return;

  const redis = getRedisCacheClient();

  await redis
    .multi()
    .hset(stateKey, phase, "1")
    .expire(stateKey, STATS_JOB_IDEMPOTENCY_TTL_SECONDS)
    .exec();
};

const acquireStatsJobLock = async (eventId: string | null) => {
  if (!eventId) return null;

  const lockKey = getStatsJobLockKey(eventId);
  const lockToken = `${Date.now()}:${Math.random().toString(16).slice(2)}`;

  const acquired = await getRedisCacheClient().set(
    lockKey,
    lockToken,
    "EX",
    STATS_JOB_IDEMPOTENCY_TTL_SECONDS,
    "NX",
  );

  return acquired === "OK" ? { lockKey, lockToken } : null;
};

const releaseStatsJobLock = async (
  lockKey: string | null,
  lockToken: string | null,
) => {
  if (!lockKey || !lockToken) return;

  await getRedisCacheClient().eval(
    `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `,
    1,
    lockKey,
    lockToken,
  );
};

const applyPrismaStatsUpdate = async (
  userId: string,
  prismaUpdate: PrismaStatsUpdate,
) => {
  await updateUserStats(userId, prismaUpdate.data);
  await getRedisCacheClient().del(`user:${userId}`);
};

const applyMongoStatsUpdate = async (
  mongoUpdate: MongoStatsUpdate,
  targetId: string,
) => {
  const model = getStatsModel(mongoUpdate.model);
  await model.findByIdAndUpdate(targetId, mongoUpdate.update);

  if (mongoUpdate.model === "Question") {
    await getRedisCacheClient().del(`question:${targetId}`);
  }
};

const processStatsPhase = async ({
  phase,
  completedPhases,
  stateKey,
  jobData,
  action,
  mongoTargetId,
}: {
  phase: StatsPhase;
  completedPhases: { prisma: boolean; mongo: boolean };
  stateKey: string | null;
  jobData: StatsJobData;
  action: StatsActionDescriptor;
  mongoTargetId?: string;
}) => {
  if (completedPhases[phase]) return;

  if (phase === "prisma") {
    if (!action.prisma) return;

    await applyPrismaStatsUpdate(jobData.userId, action.prisma);
    await markStatsPhaseComplete(stateKey, phase);
    return;
  }

  if (!action.mongo || !mongoTargetId) return;

  await applyMongoStatsUpdate(action.mongo, mongoTargetId);
  await markStatsPhaseComplete(stateKey, phase);
};

const processStatsJob = async (jobName: string, jobData: StatsJobData) => {
  const actionName = getStatsActionName(jobName, jobData);

  if (!actionName) {
    throw new Error(`Unknown action: ${jobData.action ?? jobName}`);
  }

  const action = STATS_ACTIONS[actionName];
  const stateKey = getStatsJobIdempotencyKey(jobData);
  const lock = await acquireStatsJobLock(jobData.eventId ?? null);

  const mongoTargetId = action.mongo
    ? jobData.mongoTargetId || jobData[action.mongo.idKey]
    : undefined;

  if (action.mongo && !mongoTargetId) {
    throw new Error("Mongo target ID missing for action");
  }

  try {
    const completedPhases = await getCompletedStatsPhases(stateKey);

    await processStatsPhase({
      phase: "prisma",
      completedPhases,
      stateKey,
      jobData,
      action,
      mongoTargetId,
    });

    await processStatsPhase({
      phase: "mongo",
      completedPhases,
      stateKey,
      jobData,
      action,
      mongoTargetId,
    });
  } finally {
    await releaseStatsJobLock(lock?.lockKey ?? null, lock?.lockToken ?? null);
  }
};

export default processStatsJob;
