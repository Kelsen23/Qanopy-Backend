import { Redis } from "ioredis";
import createRedisClient from "../utils/createRedisClient.util.js";

import dotenv from "dotenv";
dotenv.config();

let redisCacheClient: Redis | null = null;
let redisMessagingClient: Redis | null = null;

const getRedisCacheClient = (): Redis => {
  if (!redisCacheClient) {
    redisCacheClient = createRedisClient(
      process.env.REDIS_CACHE_URL || "redis://localhost:6379",
      "CACHE",
    );
  }
  return redisCacheClient;
};

const getRedisMessagingClient = (): Redis => {
  if (!redisMessagingClient) {
    redisMessagingClient = createRedisClient(
      process.env.REDIS_MESSAGING_URL || "redis://localhost:6379",
      "MESSAGING",
    );
  }
  return redisMessagingClient;
};

const redisMessagingClientConnection = {
  url: process.env.REDIS_MESSAGING_URL || "redis://localhost:6379",
};

export {
  redisCacheClient,
  redisMessagingClient,
  getRedisCacheClient,
  getRedisMessagingClient,
  redisMessagingClientConnection,
};
