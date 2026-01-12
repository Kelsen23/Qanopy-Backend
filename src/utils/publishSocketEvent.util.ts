import { redisPub } from "../redis/redis.pubsub.js";

const publishSocketEvent = async (userId: string, event: string, data: any) => {
  redisPub.publish("socket:emit", JSON.stringify({ userId, event, data }));
};

export default publishSocketEvent;
