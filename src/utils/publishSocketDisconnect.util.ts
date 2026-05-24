import { getRedisPub } from "../redis/redis.pubsub.js";

const publishSocketDisconnect = async (userId: string) => {
  console.log("[socket:disconnect:publish]", { userId });
  await getRedisPub().publish("socket:disconnect", JSON.stringify({ userId }));
};

export default publishSocketDisconnect;
