import createUserLoader from "../../src/dataloaders/user.loader.js";
import authenticateGraphQLUser from "../../src/middlewares/graphqlAuth.middleware.js";

import prisma from "../../src/config/prisma.config.js";
import { getRedisCacheClient } from "../../src/config/redis.config.js";

const createGraphqlAuthContext = async (req: {
  cookies?: {
    token?: string;
  };
  headers?: {
    authorization?: string;
  };
}) => {
  const user = await authenticateGraphQLUser(req as any);

  return {
    token: req.headers?.authorization,
    prisma,
    getRedisCacheClient,
    user,
    loaders: {
      userLoader: createUserLoader(),
    },
  };
};

export default createGraphqlAuthContext;
