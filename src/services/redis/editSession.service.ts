import { getRedisCacheClient } from "../../config/redis.config.js";

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

export { startEditSession, endEditSession, getEditSessionSockets };
