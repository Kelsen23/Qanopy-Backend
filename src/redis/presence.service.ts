import { redisCacheClient } from "../config/redis.config.js";

const addUserSocket = async (userId: string, socketId: string) => {
  await redisCacheClient.sadd(`online:users`, userId);
  await redisCacheClient.sadd(`online:user:${userId}`, socketId);
  await redisCacheClient.set(`socket:${socketId}`, userId);
};

const removeUserSocket = async (socketId: string) => {
  const userId = await redisCacheClient.get(`socket:${socketId}`);

  if (userId) {
    await redisCacheClient.srem(`online:user:${userId}`, socketId);

    const socketsLeft = await redisCacheClient.scard(`online:user:${userId}`);

    if (socketsLeft === 0) {
      await redisCacheClient.del(`online:user:${userId}`);
      await redisCacheClient.srem(`online:users`, userId);
    }

    await redisCacheClient.del(`socket:${socketId}`);
  }
};

const getUserSockets = async (userId: string) => {
  const sockets = await redisCacheClient.smembers(`online:user:${userId}`);

  return sockets || [];
};

export { addUserSocket, removeUserSocket, getUserSockets };
