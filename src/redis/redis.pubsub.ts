import { Redis } from "ioredis";
import createRedisClient from "../utils/createRedisClient.util.js";

import dotenv from "dotenv";
dotenv.config();

let redisPub: Redis | null = null;
let redisSub: Redis | null = null;

const getRedisPub = (): Redis => {
  if (!redisPub) {
    redisPub = createRedisClient(
      process.env.REDIS_MESSAGING_URL || "redis://localhost:6379",
      "PUB",
    );
  }
  return redisPub;
};

const getRedisSub = (): Redis => {
  if (!redisSub) {
    redisSub = createRedisClient(
      process.env.REDIS_MESSAGING_URL || "redis://localhost:6379",
      "SUB",
    );
  }
  return redisSub;
};

type SocketEventHandler = (payload: any) => void;

const handlers = new Map<string, SocketEventHandler>();

const registerSubscriber = (channel: string, handler: SocketEventHandler) => {
  handlers.set(channel, handler);
  getRedisSub().subscribe(channel);
};

getRedisSub().on("message", (channel, message) => {
  const handler = handlers.get(channel);
  if (!handler) return;

  handler(JSON.parse(message));
});

export { redisPub, redisSub, getRedisPub, getRedisSub, registerSubscriber };
