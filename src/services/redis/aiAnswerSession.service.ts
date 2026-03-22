import { getRedisCacheClient } from "../../config/redis.config.js";

const getVersionSocketKey = (questionId: string, questionVersion: number) =>
  `aiAnswer:question:${questionId}:version:${questionVersion}:sockets`;

const getSocketBindingKey = (socketId: string) => `aiAnswer:socket:${socketId}`;

const startAiAnswerSession = async (
  socketId: string,
  questionId: string,
  questionVersion: number,
) => {
  await getRedisCacheClient().sadd(
    getVersionSocketKey(questionId, questionVersion),
    socketId,
  );
  await getRedisCacheClient().set(
    getSocketBindingKey(socketId),
    JSON.stringify({ questionId, questionVersion }),
  );
};

const endAiAnswerSession = async (socketId: string) => {
  const binding = await getRedisCacheClient().get(
    getSocketBindingKey(socketId),
  );

  if (!binding) return;

  const { questionId, questionVersion } = JSON.parse(binding) as {
    questionId: string;
    questionVersion: number;
  };

  await getRedisCacheClient().srem(
    getVersionSocketKey(questionId, questionVersion),
    socketId,
  );

  const remaining = await getRedisCacheClient().scard(
    getVersionSocketKey(questionId, questionVersion),
  );

  if (remaining === 0)
    await getRedisCacheClient().del(
      getVersionSocketKey(questionId, questionVersion),
    );

  await getRedisCacheClient().del(getSocketBindingKey(socketId));
};

const getAiAnswerSessionSockets = async (
  questionId: string,
  questionVersion: number,
) => {
  const sockets = await getRedisCacheClient().smembers(
    getVersionSocketKey(questionId, questionVersion),
  );

  return sockets || [];
};

export { startAiAnswerSession, endAiAnswerSession, getAiAnswerSessionSockets };
