import { ApolloServer } from "@apollo/server";
import { mergeResolvers } from "@graphql-tools/merge";
import { mergeTypeDefs } from "@graphql-tools/merge";
import type { GraphQLFormattedError } from "graphql";

import rootTypeDefs from "../../../src/graphql/typeDefs/root.typeDefs.js";
import scalarsTypeDefs from "../../../src/graphql/typeDefs/common/scalars.typeDefs.js";
import userTypeDefs from "../../../src/graphql/typeDefs/user.typeDefs.js";
import moderationTypeDefs from "../../../src/graphql/typeDefs/moderation.typeDefs.js";

import commonScalarsResolver from "../../../src/graphql/resolvers/common/scalars.resolver.js";
import moderationResolver from "../../../src/graphql/resolvers/moderation.resolver.js";

const typeDefs = mergeTypeDefs([
  rootTypeDefs,
  scalarsTypeDefs,
  userTypeDefs,
  moderationTypeDefs,
]);
const resolvers = mergeResolvers([commonScalarsResolver, moderationResolver]);

type RedisCacheClient = {
  get: (key: string) => Promise<string | null>;
  set: (...args: unknown[]) => Promise<unknown>;
};

export type ModerationGraphqlContext = {
  user: {
    id: string;
    role: string;
    [key: string]: unknown;
  };
  prisma: any;
  getRedisCacheClient: () => RedisCacheClient;
  loaders: {
    userLoader: {
      loadMany: (keys: readonly string[]) => Promise<unknown[]>;
    };
  };
};

const createServer = async () => {
  const server = new ApolloServer<ModerationGraphqlContext>({
    typeDefs,
    resolvers: resolvers as never,
  });

  await server.start();

  return server;
};

const serverPromise = createServer();

type ExecuteModerationGraphqlParams = {
  query: string;
  variables?: Record<string, unknown>;
  contextValue: ModerationGraphqlContext;
};

type ExecuteModerationGraphqlResult<TData> = {
  data?: TData | null;
  errors?: readonly GraphQLFormattedError[];
};

const executeModerationGraphql = async <TData>({
  query,
  variables,
  contextValue,
}: ExecuteModerationGraphqlParams): Promise<
  ExecuteModerationGraphqlResult<TData>
> => {
  const server = await serverPromise;
  const response = await server.executeOperation(
    {
      query,
      variables,
    },
    {
      contextValue,
    },
  );

  if (response.body.kind !== "single") {
    throw new Error("Expected single GraphQL response body");
  }

  return response.body.singleResult as ExecuteModerationGraphqlResult<TData>;
};

export default executeModerationGraphql;
