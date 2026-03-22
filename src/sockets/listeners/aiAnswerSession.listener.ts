import { Socket } from "socket.io";

import { getRedisCacheClient } from "../../config/redis.config.js";

import {
  endAiAnswerSession,
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
      await startAiAnswerSession(socket.id, questionId, questionVersion);
    },
  );

  socket.on(
    "cancelAiAnswerSession",
    async (questionId: string, questionVersion: string) => {
      await getRedisCacheClient().set(
        `cancel:aiAnswer:question:${questionId}:version:${questionVersion}`,
        "1",
        "EX",
        60,
      );

      await endAiAnswerSession(socket.id);
    },
  );

  socket.on("endAiAnswerSession", async () => {
    await endAiAnswerSession(socket.id);
  });

  socket.on("disconnect", async () => {
    await endAiAnswerSession(socket.id);
  });
};

export default initAiAnswerSessionListener;
