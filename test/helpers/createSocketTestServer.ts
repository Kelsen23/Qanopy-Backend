import http from "http";
import path from "path";
import { createRequire } from "module";
import type { AddressInfo } from "net";

import type { Socket } from "socket.io";

import initSocket, { io } from "../../src/sockets/index.js";

const require = createRequire(import.meta.url);
const { io: createSocketClient } = require(
  path.resolve(
    process.cwd(),
    "node_modules/socket.io/client-dist/socket.io.js",
  ),
);

type SocketTestServer = {
  close: () => Promise<void>;
  connect: (token?: string) => Promise<Socket>;
  port: number;
  url: string;
};

const createSocketTestServer = async (): Promise<SocketTestServer> => {
  const server = http.createServer();

  initSocket(server);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
    server.listen(0, "127.0.0.1");
  });

  const address = server.address() as AddressInfo;
  const port = address.port;
  const url = `http://127.0.0.1:${port}`;

  const close = async () => {
    await new Promise<void>((resolve) => {
      io?.close(() => resolve());
    });

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  };

  const connect = (token?: string) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = createSocketClient(url, {
        auth: token ? { token } : {},
        forceNew: true,
        reconnection: false,
        timeout: 1000,
        transports: ["websocket"],
      });

      const connectTimeout = setTimeout(() => {
        socket.close();
        reject(new Error("Socket connection timed out"));
      }, 5000);

      socket.on("connect", () => {
        clearTimeout(connectTimeout);
        resolve(socket);
      });
      socket.on("connect_error", (error: Error) => {
        clearTimeout(connectTimeout);
        socket.close();
        reject(error);
      });
    });

  return {
    close,
    connect,
    port,
    url,
  };
};

export default createSocketTestServer;
