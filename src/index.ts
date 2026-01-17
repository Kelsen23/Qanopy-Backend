import dotenv from "dotenv";
import path from "path";
import http from "http";
import cors from "cors";

import express from "express";

import initSocket from "./sockets/index.js";

import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import bodyParser from "body-parser";

import authenticateGraphQLUser from "./middlewares/graphqlAuth.middleware.js";

import UserWithoutSensitiveInfo from "./types/userWithoutSensitiveInfo.type.js";

import createUserLoader from "./dataloaders/user.loader.js";

import typeDefs from "./graphql/typeDefs/index.js";
import resolvers from "./graphql/resolvers/index.js";

import authRoute from "./routes/auth.route.js";
import userRoute from "./routes/user.route.js";
import questionRoute from "./routes/question.route.js";
import moderationRoute from "./routes/moderation.route.js";

import cookieParser from "cookie-parser";

import prisma from "./config/prisma.config.js";

import connectMongoDB from "./config/mongodb.config.js";
import { getRedisCacheClient } from "./config/redis.config.js";
import closeAllRedisConnections from "./utils/closeAllRedisConnections.util.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
});

await apolloServer.start();

const app = express();
const server = http.createServer(app);

initSocket(server);

connectMongoDB(process.env.MONGO_URI as string);

const port = Number(process.env.PORT) || 5000;

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api/auth", authRoute);
app.use("/api/user", userRoute);
app.use("/api/question", questionRoute);
app.use("/api/moderation", moderationRoute);

app.use(
  "/graphql",
  cors<cors.CorsRequest>({
    credentials: true,
  }),
  bodyParser.json(),
  expressMiddleware(apolloServer, {
    context: async ({ req }) => {
      const user: UserWithoutSensitiveInfo = await authenticateGraphQLUser(
        req as any,
      );

      return {
        token: req.headers.authorization,
        prisma,
        getRedisCacheClient,
        user,
        loaders: {
          userLoader: createUserLoader(),
        },
      };
    },
  }),
);

server.on("error", (err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});

process.on("SIGTERM", async () => {
  await closeAllRedisConnections();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await closeAllRedisConnections();
  process.exit(0);
});

server.listen(port, () =>
  console.log(`Server running on http://localhost:${port}`),
);
