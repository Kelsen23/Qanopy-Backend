import { getRedisPub } from "../redis/redis.pubsub.js";

const publishSocketEvent = async (userId: string, event: string, data: any) => {
  getRedisPub().publish("socket:emit", JSON.stringify({ userId, event, data }));
};

export default publishSocketEvent;
