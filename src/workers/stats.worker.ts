import { Worker } from "bullmq";
import {
  redisCacheClient,
  redisMessagingClientConnection,
} from "../config/redis.config.js";

import HttpError from "../utils/httpError.util.js";

import Question from "../models/question.model.js";
import Answer from "../models/answer.model.js";

import prisma from "../config/prisma.config.js";

import connectMongoDB from "../config/mongodb.config.js";

interface StatsUpdate {
  prisma?: any;
  mongo?: {
    model: "Question" | "Answer";
    idKey: string;
    update: any;
  };
}

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
  },
  UNACCEPT_ANSWER: {
    prisma: {
      userIdKey: "userId",
      data: {
        acceptedAnswers: { decrement: 1 },
        reputationPoints: { decrement: 10 },
      },
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
    mongo: {
      model: "Answer",
      idKey: "answerId",
      update: { $inc: { replyCount: -1 } },
    },
  },
};

const modelMap: Record<"Question" | "Answer", typeof Question | typeof Answer> =
  { Question, Answer };

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting stats worker...");

  new Worker(
    "statsQueue",
    async (job) => {
      const { userId, action, mongoTargetId } = job.data;
      const stats = actionMap[action];

      if (!stats) throw new HttpError(`Unknown action: ${action}`, 400);

      if (stats.prisma) {
        const { data } = stats.prisma;
        await prisma.user.update({ where: { id: userId }, data });

        await redisCacheClient.del(`user:${userId}`);
      }

      if (stats.mongo) {
        const { model, idKey, update } = stats.mongo;

        const mongoModel = modelMap[model];
        const id = mongoTargetId || job.data[idKey];
        if (!id) throw new HttpError("Mongo target ID missing for action", 400);

        await mongoModel.findByIdAndUpdate(id, update);

        if (model === "Question") await redisCacheClient.del(`question:${id}`);
      }
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 5,
    },
  );
}

startWorker().catch((error) => {
  console.error("Failed to start stats worker:", error);
  process.exit(1);
});
