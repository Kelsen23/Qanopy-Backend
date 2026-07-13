import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import http from "http";
import path from "path";

import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";

import type AuthenticatedRequest from "./types/authenticatedRequest.type.js";
import type { User } from "./generated/prisma/index.js";

import prisma from "./config/prisma.config.js";
import connectMongoDB from "./config/mongodb.config.js";
import { getRedisCacheClient } from "./config/redis.config.js";

import closeAllRedisConnections from "./utils/redis/closeAllRedisConnections.util.js";

import { appEnvSchema } from "./validations/config.schema.js";
import createUserLoader from "./dataloaders/user.loader.js";
import typeDefs from "./graphql/typeDefs/index.js";
import resolvers from "./graphql/resolvers/index.js";
import authenticateGraphQLUser from "./middlewares/graphqlAuth.middleware.js";
import initSocket from "./sockets/index.js";
import createApp from "./app.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
const appEnv = appEnvSchema.parse(process.env);

const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
});

await apolloServer.start();

const app = await createApp();
const server = http.createServer(app);

initSocket(server);

connectMongoDB(appEnv.MONGO_URI);

app.use(
  "/graphql",
  cors<cors.CorsRequest>({
    credentials: true,
  }),
  bodyParser.json(),
  expressMiddleware(apolloServer, {
    context: async ({ req }) => {
      const user: User = await authenticateGraphQLUser(
        req as AuthenticatedRequest,
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

const port = appEnv.PORT;

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
