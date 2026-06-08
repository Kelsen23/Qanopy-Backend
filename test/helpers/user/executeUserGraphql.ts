import { ApolloServer } from "@apollo/server";
import { mergeResolvers } from "@graphql-tools/merge";
import { mergeTypeDefs } from "@graphql-tools/merge";
import type { GraphQLFormattedError } from "graphql";

import rootTypeDefs from "../../../src/graphql/typeDefs/root.typeDefs.js";
import scalarsTypeDefs from "../../../src/graphql/typeDefs/common/scalars.typeDefs.js";
import userTypeDefs from "../../../src/graphql/typeDefs/user.typeDefs.js";
import commonScalarsResolver from "../../../src/graphql/resolvers/common/scalars.resolver.js";
import userResolver from "../../../src/graphql/resolvers/user.resolver.js";

const typeDefs = mergeTypeDefs([rootTypeDefs, scalarsTypeDefs, userTypeDefs]);
const resolvers = mergeResolvers([commonScalarsResolver, userResolver]);

type RedisCacheClient = {
  get: (key: string) => Promise<string | null>;
  set: (...args: unknown[]) => Promise<unknown>;
};

export type UserGraphqlContext = {
  user: {
    id: string;
    [key: string]: unknown;
  };
  prisma: any;
  getRedisCacheClient: () => RedisCacheClient;
  loaders: {
    userLoader: {
      loadMany: (keys: readonly string[]) => Promise<unknown[]>;
    }
  };
};

const createServer = async () => {
  const server = new ApolloServer<UserGraphqlContext>({
    typeDefs,
    resolvers: resolvers as never,
  });

  await server.start();

  return server;
};

const serverPromise = createServer();

type ExecuteUserGraphqlParams = {
  query: string;
  variables?: Record<string, unknown>;
  contextValue: UserGraphqlContext;
};

type ExecuteUserGraphqlResult<TData> = {
  data?: TData | null;
  errors?: readonly GraphQLFormattedError[];
};

const executeUserGraphql = async <TData>({
  query,
  variables,
  contextValue,
}: ExecuteUserGraphqlParams): Promise<ExecuteUserGraphqlResult<TData>> => {
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

  return response.body.singleResult as ExecuteUserGraphqlResult<TData>;
};

export default executeUserGraphql;
