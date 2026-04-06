import { getRedisCacheClient } from "../../config/redis.config.js";

const getVersionSocketKey = (questionId: string, questionVersion: number) =>
  `aiAnswer:question:${questionId}:version:${questionVersion}:sockets`;

const getSocketBindingKey = (socketId: string) => `aiAnswer:socket:${socketId}`;

const getAiAnswerCancelKey = (questionId: string, questionVersion: number) =>
  `cancel:aiAnswer:question:${questionId}:version:${questionVersion}`;

const getPendingKey = (userId: string, questionId: string, version: number) =>
  `aiAnswer:pending:${userId}:${questionId}:${version}`;

const setAiAnswerCancelFlagFromSocketBinding = async (socketId: string) => {
  const binding = await getRedisCacheClient().get(
    getSocketBindingKey(socketId),
  );

  if (!binding) return;

  const { questionId, questionVersion } = JSON.parse(binding) as {
    questionId: string;
    questionVersion: number;
  };

  await getRedisCacheClient().set(
    getAiAnswerCancelKey(questionId, questionVersion),
    "1",
    "EX",
    60,
  );
};

const startAiAnswerSession = async (
  socketId: string,
  userId: string,
  questionId: string,
  questionVersion: number,
) => {
  const pendingKey = getPendingKey(userId, questionId, questionVersion);
  const pendingSet = await getRedisCacheClient().set(
    pendingKey,
    "1",
    "EX",
    60 * 15,
    "NX",
  );

  if (!pendingSet) throw new Error("AI answer already queued");

  await getRedisCacheClient().sadd(
    getVersionSocketKey(questionId, questionVersion),
    socketId,
  );

  await getRedisCacheClient().set(
    getSocketBindingKey(socketId),
    JSON.stringify({ userId, questionId, questionVersion }),
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

export {
  startAiAnswerSession,
  endAiAnswerSession,
  getAiAnswerSessionSockets,
  getAiAnswerCancelKey,
  setAiAnswerCancelFlagFromSocketBinding,
};
