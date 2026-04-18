import { Socket } from "socket.io";
import {
  startQuestionSession,
  endQuestionSession,
} from "../../services/redis/questionSession.service.js";

const initQuestionSessionListener = (socket: Socket) => {
  socket.on("startQuestionSession", async (questionId: string) => {
    await startQuestionSession(socket.id, questionId);
  });

  socket.on("endQuestionSession", async () => {
    await endQuestionSession(socket.id);
  });

  socket.on("disconnect", async () => {
    await endQuestionSession(socket.id);
  });
};

export default initQuestionSessionListener;
