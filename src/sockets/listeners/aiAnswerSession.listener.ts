import { Socket } from "socket.io";

import {
  endAiAnswerSession,
  setAiAnswerCancelFlagFromSocketBinding,
  startAiAnswerSession,
} from "../../services/redis/aiAnswerSession.service.js";

const initAiAnswerSessionListener = (socket: Socket) => {
  socket.on(
    "startAiAnswerSession",
    async ({
      questionId,
      questionVersion,
    }: {
      questionId: string;
      questionVersion: number;
    }) => {
      await startAiAnswerSession(
        socket.id,
        socket.data.userId,
        questionId,
        questionVersion,
      );
    },
  );

  socket.on("cancelAiAnswerSession", async () => {
    await setAiAnswerCancelFlagFromSocketBinding(socket.id);

    await endAiAnswerSession(socket.id);
  });

  socket.on("endAiAnswerSession", async () => {
    await endAiAnswerSession(socket.id);
  });

  socket.on("disconnect", async () => {
    await endAiAnswerSession(socket.id);
  });
};

export default initAiAnswerSessionListener;
