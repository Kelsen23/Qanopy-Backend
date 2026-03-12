import { Socket } from "socket.io";
import {
  endEditSession,
  startEditSession,
} from "../../services/redis/editSession.service.js";

const initEditSessionListener = (socket: Socket) => {
  socket.on("startEditSession", async (versionId: string) => {
    await startEditSession(socket.id, versionId);
  });

  socket.on("endEditSession", async () => {
    await endEditSession(socket.id);
  });

  socket.on("disconnect", async () => {
    await endEditSession(socket.id);
  });
};

export default initEditSessionListener;
