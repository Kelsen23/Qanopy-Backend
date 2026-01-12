import dotenv from "dotenv";
dotenv.config();

import { Redis } from "ioredis";

const redisPub = new Redis(
  process.env.REDIS_MESSAGING_URL || "redis://localhost:6379",
);
const redisSub = new Redis(
  process.env.REDIS_MESSAGING_URL || "redis://localhost:6379",
);

redisPub.on("connect", () => {
  console.log("Redis PUB connected");
});

redisSub.on("connect", () => {
  console.log("Redis SUB connected");
});

type SocketEventHandler = (payload: any) => void;

const handlers = new Map<string, SocketEventHandler>();

const registerSubscriber = (channel: string, handler: SocketEventHandler) => {
  handlers.set(channel, handler);
  redisSub.subscribe(channel);
};

redisSub.on("message", (channel, message) => {
  const handler = handlers.get(channel);
  if (!handler) return;

  handler(JSON.parse(message));
});

export { redisPub, redisSub, registerSubscriber };
