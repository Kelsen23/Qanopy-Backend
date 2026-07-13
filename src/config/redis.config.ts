import { Redis } from "ioredis";
import dotenv from "dotenv";

import createRedisClient from "../utils/redis/createRedisClient.util.js";

import { redisConfigSchema } from "../validations/config.schema.js";

dotenv.config();

const redisConfig = redisConfigSchema.parse(process.env);

let redisCacheClient: Redis | null = null;
let redisMessagingClient: Redis | null = null;

const getRedisCacheClient = (): Redis => {
  if (!redisCacheClient) {
    redisCacheClient = createRedisClient(redisConfig.REDIS_CACHE_URL, "CACHE");
  }
  return redisCacheClient;
};

const getRedisMessagingClient = (): Redis => {
  if (!redisMessagingClient) {
    redisMessagingClient = createRedisClient(
      redisConfig.REDIS_MESSAGING_URL,
      "MESSAGING",
    );
  }
  return redisMessagingClient;
};

const redisMessagingClientConnection = new Redis(
  redisConfig.REDIS_MESSAGING_URL,
  {
    maxRetriesPerRequest: null,
  },
);

export {
  redisCacheClient,
  redisMessagingClient,
  getRedisCacheClient,
  getRedisMessagingClient,
  redisMessagingClientConnection,
};
