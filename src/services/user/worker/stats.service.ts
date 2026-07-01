import { getRedisCacheClient } from "../../../config/redis.config.js";

import updateUserStats from "../../../utils/user/updateUserStats.util.js";

import Answer from "../../../models/answer.model.js";
import Question from "../../../models/question.model.js";

type StatsUpdate = {
  prisma?: any;
  mongo?: {
    model: "Question" | "Answer";
    idKey: string;
    update: any;
  };
};

const STATS_JOB_IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24 * 7;

const getStatsJobIdempotencyKey = (
  _jobName: string,
  jobData: Record<string, any>,
  jobId?: string,
) =>
  jobData.eventId ? `stats:processed:${jobData.eventId}` : null;

const actionMap: Record<string, StatsUpdate> = {
  ASK_QUESTION: {
    prisma: { userIdKey: "userId", data: { questionsAsked: { increment: 1 } } },
  },
  GIVE_ANSWER: {
    prisma: {
      userIdKey: "userId",
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
      userIdKey: "userId",
      data: { reputationPoints: { increment: 20 } },
    },
  },
  CHANGE_UPVOTE_TO_DOWNVOTE_QUESTION: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { decrement: 20 } },
    },
  },
  CHANGE_DOWNVOTE_TO_UPVOTE_ANSWER: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { increment: 20 } },
    },
  },
  CHANGE_UPVOTE_TO_DOWNVOTE_ANSWER: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { decrement: 20 } },
    },
  },
  CHANGE_DOWNVOTE_TO_UPVOTE_REPLY: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { increment: 10 } },
    },
  },
  CHANGE_UPVOTE_TO_DOWNVOTE_REPLY: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { decrement: 10 } },
    },
  },
  RECEIVE_UPVOTE_QUESTION: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { increment: 10 } },
    },
  },
  RECEIVE_DOWNVOTE_QUESTION: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { decrement: 10 } },
    },
  },
  RECEIVE_UPVOTE_ANSWER: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { increment: 10 } },
    },
  },
  RECEIVE_DOWNVOTE_ANSWER: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { decrement: 10 } },
    },
  },
  RECEIVE_UPVOTE_REPLY: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { increment: 5 } },
    },
  },
  RECEIVE_DOWNVOTE_REPLY: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { decrement: 5 } },
    },
  },
  UNVOTE_UPVOTE_QUESTION: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { decrement: 10 } },
    },
  },
  UNVOTE_DOWNVOTE_QUESTION: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { increment: 10 } },
    },
  },
  UNVOTE_UPVOTE_ANSWER: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { decrement: 10 } },
    },
  },
  UNVOTE_DOWNVOTE_ANSWER: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { increment: 10 } },
    },
  },
  UNVOTE_UPVOTE_REPLY: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { decrement: 5 } },
    },
  },
  UNVOTE_DOWNVOTE_REPLY: {
    prisma: {
      userIdKey: "userId",
      data: { reputationPoints: { increment: 5 } },
    },
  },
  ACCEPT_ANSWER: {
    prisma: {
      userIdKey: "userId",
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
      userIdKey: "userId",
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
      userIdKey: "userId",
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
      userIdKey: "userId",
      data: {
        reputationPoints: { increment: 15 },
        bestAnswers: { increment: 1 },
      },
    },
  },
  UNMARK_ANSWER_AS_BEST: {
    prisma: {
      userIdKey: "userId",
      data: {
        reputationPoints: { decrement: 15 },
        bestAnswers: { decrement: 1 },
      },
    },
  },
  DELETE_QUESTION: {
    prisma: {
      userIdKey: "userId",
      data: {
        questionsAsked: { decrement: 1 },
      },
    },
  },
  DELETE_ANSWER: {
    prisma: {
      userIdKey: "userId",
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
    prisma: {
      userIdKey: "userId",
      data: {
        reputationPoints: { decrement: 1 },
      },
    },
    mongo: {
      model: "Answer",
      idKey: "answerId",
      update: { $inc: { replyCount: -1 } },
    },
  },
};

const processStatsJob = async (
  jobName: string,
  jobData: any,
  jobId?: string,
) => {
  const idempotencyKey = getStatsJobIdempotencyKey(jobName, jobData, jobId);

  if (idempotencyKey) {
    const cachedResult = await getRedisCacheClient().get(idempotencyKey);

    if (cachedResult) return;
  }

  const actionName = (jobName in actionMap ? jobName : jobData.action) as
    | keyof typeof actionMap
    | undefined;

  if (!actionName)
    throw new Error(`Unknown action: ${jobData.action ?? jobName}`);

  const action = actionMap[actionName];

  if (!action) throw new Error(`Unknown action: ${jobData.action ?? jobName}`);

  if (action.prisma) {
    await updateUserStats(jobData.userId, action.prisma.data);
    await getRedisCacheClient().del(`user:${jobData.userId}`);
  }

  if (!action.mongo) {
    if (idempotencyKey) {
      await getRedisCacheClient().set(
        idempotencyKey,
        "1",
        "EX",
        STATS_JOB_IDEMPOTENCY_TTL_SECONDS,
      );
    }

    return;
  }

  const model = action.mongo.model === "Question" ? Question : Answer;
  const id = jobData.mongoTargetId || jobData[action.mongo.idKey];

  if (!id) throw new Error("Mongo target ID missing for action");

  await model.findByIdAndUpdate(id, action.mongo.update);

  if (action.mongo.model === "Question") {
    await getRedisCacheClient().del(`question:${id}`);
  }

  if (idempotencyKey) {
    await getRedisCacheClient().set(
      idempotencyKey,
      "1",
      "EX",
      STATS_JOB_IDEMPOTENCY_TTL_SECONDS,
    );
  }
};

export default processStatsJob;
