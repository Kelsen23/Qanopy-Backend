import http from "http";

import { Server as SocketServer, Socket } from "socket.io";
import { addUserSocket, removeUserSocket } from "../redis/presence.service.js";

import initSocketEmitSubscriber from "./subscribers/socketEmit.subscriber.js";
import initSocketDisconnectSubscriber from "./subscribers/socketDisconnect.subscriber.js";

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

  io.on("connection", (socket: Socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("registerUser", async (userId: string) => {
      await addUserSocket(userId, socket.id);

      console.log(`Registering user ${userId} with socket ${socket.id}`);
    });

    socket.on("disconnect", async () => {
      await removeUserSocket(socket.id);

      console.log("Socket disconnected:", socket.id);
    });
  });
};

export default initSocket;
