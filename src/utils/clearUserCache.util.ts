import { getRedisCacheClient } from "../config/redis.config.js";

const clearUserCache = async (userId: string) => {
  await getRedisCacheClient().del(`auth:user:${userId}`, `user:${userId}`);
};

export default clearUserCache;
