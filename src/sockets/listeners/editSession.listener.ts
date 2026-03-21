import { Socket } from "socket.io";
import {
  endEditSession,
  startEditSession,
} from "../../services/redis/editSession.service.js";

const initEditSessionListener = (socket: Socket) => {
  socket.on("startEditSession", async (version: number) => {
    await startEditSession(socket.id, version);
  });

  socket.on("endEditSession", async () => {
    await endEditSession(socket.id);
  });

  socket.on("disconnect", async () => {
    await endEditSession(socket.id);
  });
};

export default initEditSessionListener;
