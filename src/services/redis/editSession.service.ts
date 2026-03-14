import { getRedisCacheClient } from "../../config/redis.config.js";

const startEditSession = async (
  socketId: string,
  version: number,
) => {
  await getRedisCacheClient().sadd(
    `edit:version:${version}:sockets`,
    socketId,
  );
  await getRedisCacheClient().set(`edit:socket:${socketId}`, version);
};

const endEditSession = async (socketId: string) => {
  const version = await getRedisCacheClient().get(`edit:socket:${socketId}`);

  if (!version) return;

  await getRedisCacheClient().srem(
    `edit:version:${version}:sockets`,
    socketId,
  );

  const remaining = await getRedisCacheClient().scard(
    `edit:version:${version}:sockets`,
  );

  if (remaining === 0)
    await getRedisCacheClient().del(`edit:version:${version}:sockets`);

  await getRedisCacheClient().del(`edit:socket:${socketId}`);
};

const getEditSessionSockets = async (version: number) => {
  const sockets = await getRedisCacheClient().smembers(
    `edit:version:${version}:sockets`,
  );

  return sockets || [];
};

export { startEditSession, endEditSession, getEditSessionSockets };
