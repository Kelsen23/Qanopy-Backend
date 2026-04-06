import http from "http";

import { Server as SocketServer, Socket } from "socket.io";

import initSocketEmitSubscriber from "./subscribers/socketEmit.subscriber.js";
import initSocketDisconnectSubscriber from "./subscribers/socketDisconnect.subscriber.js";

import decodeSocketToken from "../services/socket/decodeSocketToken.service.js";
import { removeUserSocket } from "../services/redis/presence.service.js";

import validateSocketUser from "../services/socket/validateSocketUser.service.js";
import initializeSocketUserSession from "../services/socket/initializeSocketUserSession.service.js";

import initEditSessionListener from "./listeners/editSession.listener.js";
import initAiAnswerSessionListener from "./listeners/aiAnswerSession.listener.js";

export let io: SocketServer;

const initSocket = (server: http.Server) => {
  io = new SocketServer(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  if (!io) {
    console.warn("Socket not ready yet, skipping emit");
    return;
  }

  initSocketEmitSubscriber();
  initSocketDisconnectSubscriber();

  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) return next(new Error("Not authenticated: no token"));
      
      const userId = decodeSocketToken(token);
      await validateSocketUser(userId);

      socket.data.userId = userId;

      return next();
    } catch (error) {
      return next(new Error("Authentication failed"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    try {
      console.log("Socket connected:", socket.id);

      const userId = socket.data.userId;
      if (!userId) {
        socket.disconnect(true);
        return;
      }

      await initializeSocketUserSession(userId, socket.id);

      console.log(`Registering user ${userId} with socket ${socket.id}`);

      initEditSessionListener(socket);
      initAiAnswerSessionListener(socket);

      socket.on("disconnect", async () => {
        await removeUserSocket(socket.id);

        console.log("Socket disconnected:", socket.id);
      });
    } catch (error) {
      socket.disconnect(true);
    }
  });
};

export default initSocket;
