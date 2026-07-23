import { addUserSocket } from "../redis/presence.service.js";

const initializeSocketUserSession = async (
  userId: string,
  socketId: string,
) => {
  await addUserSocket(userId, socketId);
};

export default initializeSocketUserSession;
