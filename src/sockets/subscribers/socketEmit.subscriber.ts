import { io } from "../index.js";
import { getUserSockets } from "../../services/redis/presence.service.js";
import { registerSubscriber } from "../../redis/redis.pubsub.js";

const CHANNEL = "socket:emit";

const initSocketEmitSubscriber = () => {
  registerSubscriber(CHANNEL, async ({ userId, event, data }) => {
    const socketIds = await getUserSockets(userId);

    console.log("[socket:emit]", {
      userId,
      event,
      socketCount: socketIds.length,
      socketIds,
      data,
    });

    socketIds.forEach((socketId) => {
      console.log("[socket:emit:to]", { socketId, event, data });
      io.to(socketId).emit(event, data);
    });
  });
};

export default initSocketEmitSubscriber;
