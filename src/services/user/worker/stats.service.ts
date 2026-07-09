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

const getStatsJobIdempotencyKey = (jobData: StatsJobData) =>
  jobData.eventId ? `stats:processed:${jobData.eventId}` : null;

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

const reserveStatsJobProcessing = async (idempotencyKey: string | null) => {
  if (!idempotencyKey) return true;

  const acquired = await getRedisCacheClient().set(
    idempotencyKey,
    "1",
    "EX",
    STATS_JOB_IDEMPOTENCY_TTL_SECONDS,
    "NX",
  );

  return acquired === "OK";
};

const releaseStatsJobReservation = async (idempotencyKey: string | null) => {
  if (!idempotencyKey) return;

  await getRedisCacheClient().del(idempotencyKey);
};

const wasStatsJobProcessed = async (idempotencyKey: string | null) => {
  if (!idempotencyKey) return false;

  const cachedResult = await getRedisCacheClient().get(idempotencyKey);
  return Boolean(cachedResult);
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

const processStatsJob = async (jobName: string, jobData: StatsJobData) => {
  const actionName = getStatsActionName(jobName, jobData);

  if (!actionName) {
    throw new Error(`Unknown action: ${jobData.action ?? jobName}`);
  }

  const action = STATS_ACTIONS[actionName];
  const idempotencyKey = getStatsJobIdempotencyKey(jobData);

  if (await wasStatsJobProcessed(idempotencyKey)) return;

  const mongoTargetId = action.mongo
    ? jobData.mongoTargetId || jobData[action.mongo.idKey]
    : undefined;

  if (action.mongo && !mongoTargetId) {
    throw new Error("Mongo target ID missing for action");
  }

  if (!(await reserveStatsJobProcessing(idempotencyKey))) return;

  let didMutate = false;

  try {
    if (action.prisma) {
      await applyPrismaStatsUpdate(jobData.userId, action.prisma);
      didMutate = true;
    }

    if (action.mongo) {
      await applyMongoStatsUpdate(action.mongo, mongoTargetId as string);
      didMutate = true;
    }
  } catch (error) {
    if (!didMutate) {
      await releaseStatsJobReservation(idempotencyKey);
    }

    throw error;
  }
};

export default processStatsJob;
