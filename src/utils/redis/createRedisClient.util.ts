import { Redis } from "ioredis";

const createRedisClient = (url: string, name: string): Redis => {
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on("error", (err) => {
    console.error(`Redis ${name} error:`, err);
  });

  client.on("connect", () => {
    console.log(`Redis ${name} connected`);
  });

  return client;
};

export default createRedisClient;
