import {
  redisCacheClient,
  redisMessagingClient,
} from "../config/redis.config.js";
import { redisPub, redisSub } from "../redis/redis.pubsub.js";

const closeAllRedisConnections = async (): Promise<void> => {
  const connections = [
    redisCacheClient,
    redisMessagingClient,
    redisPub,
    redisSub,
  ];

  await Promise.all(
    connections.map((client) => client?.quit().catch(console.error)),
  );

  console.log("All Redis connections closed");
};

export default closeAllRedisConnections;
