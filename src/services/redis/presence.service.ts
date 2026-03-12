import { getRedisCacheClient } from "../../config/redis.config.js";

const addUserSocket = async (userId: string, socketId: string) => {
  await getRedisCacheClient().sadd(`online:users`, userId);
  await getRedisCacheClient().sadd(`online:user:${userId}`, socketId);
  await getRedisCacheClient().set(`socket:${socketId}`, userId);
};

const removeUserSocket = async (socketId: string) => {
  const userId = await getRedisCacheClient().get(`socket:${socketId}`);

  if (userId) {
    await getRedisCacheClient().srem(`online:user:${userId}`, socketId);

    const socketsLeft = await getRedisCacheClient().scard(
      `online:user:${userId}`,
    );

    if (socketsLeft === 0) {
      await getRedisCacheClient().del(`online:user:${userId}`);
      await getRedisCacheClient().srem(`online:users`, userId);
    }

    await getRedisCacheClient().del(`socket:${socketId}`);
  }
};

const getUserSockets = async (userId: string) => {
  const sockets = await getRedisCacheClient().smembers(`online:user:${userId}`);

  return sockets || [];
};

const startEditSession = async (socketId: string, versionId: string) => {
  await getRedisCacheClient().sadd(
    `edit:version:${versionId}:sockets`,
    socketId,
  );
  await getRedisCacheClient().set(`edit:socket:${socketId}`, versionId);
};

const endEditSession = async (socketId: string) => {
  const versionId = await getRedisCacheClient().get(`edit:socket:${socketId}`);

  if (!versionId) return;

  await getRedisCacheClient().srem(
    `edit:version:${versionId}:sockets`,
    socketId,
  );

  const remaining = await getRedisCacheClient().scard(
    `edit:version:${versionId}:sockets`,
  );

  if (remaining === 0)
    await getRedisCacheClient().del(`edit:version:${versionId}:sockets`);

  await getRedisCacheClient().del(`edit:socket:${socketId}`);
};

const getEditSessionSockets = async (versionId: string) => {
  const sockets = await getRedisCacheClient().smembers(
    `edit:version:${versionId}:sockets`,
  );

  return sockets || [];
};

export {
  addUserSocket,
  removeUserSocket,
  getUserSockets,
  startEditSession,
  endEditSession,
  getEditSessionSockets,
};
