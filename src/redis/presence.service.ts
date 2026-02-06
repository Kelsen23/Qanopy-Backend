import { getRedisCacheClient } from "../config/redis.config.js";

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

export { addUserSocket, removeUserSocket, getUserSockets };
