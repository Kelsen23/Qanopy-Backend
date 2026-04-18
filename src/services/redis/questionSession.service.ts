import { getRedisCacheClient } from "../../config/redis.config.js";

const startQuestionSession = async (socketId: string, questionId: string) => {
  await getRedisCacheClient().sadd(
    `question:view:${questionId}:sockets`,
    socketId,
  );

  await getRedisCacheClient().set(
    `question:view:socket:${socketId}`,
    questionId,
  );
};

const endQuestionSession = async (socketId: string) => {
  const questionId = await getRedisCacheClient().get(
    `question:view:socket:${socketId}`,
  );

  if (!questionId) return;

  await getRedisCacheClient().srem(
    `question:view:${questionId}:sockets`,
    socketId,
  );

  const remaining = await getRedisCacheClient().scard(
    `question:view:${questionId}:sockets`,
  );

  if (remaining === 0) {
    await getRedisCacheClient().del(`question:view:${questionId}:sockets`);
  }

  await getRedisCacheClient().del(`question:view:socket:${socketId}`);
};

const getQuestionSessionSockets = async (questionId: string) => {
  const sockets = await getRedisCacheClient().smembers(
    `question:view:${questionId}:sockets`,
  );

  return sockets || [];
};

const getQuestionSessionUsers = async (questionId: string) => {
  const socketIds = await getRedisCacheClient().smembers(
    `question:view:${questionId}:sockets`,
  );

  if (!socketIds.length) return [];

  const pipeline = getRedisCacheClient().pipeline();

  socketIds.forEach((socketId) => {
    pipeline.get(`socket:${socketId}`);
  });

  const results = await pipeline.exec();

  const userIds = new Set<string>();

  for (const result of results || []) {
    const userId = result?.[1];
    if (userId) userIds.add(userId as string);
  }

  return Array.from(userIds);
};

const isQuestionSessionActive = async (questionId: string) => {
  const count = await getRedisCacheClient().scard(
    `question:view:${questionId}:sockets`,
  );

  return count > 0;
};

export {
  startQuestionSession,
  endQuestionSession,
  getQuestionSessionSockets,
  getQuestionSessionUsers,
  isQuestionSessionActive,
};
