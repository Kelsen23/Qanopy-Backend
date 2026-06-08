import { mergeResolvers } from "@graphql-tools/merge";

import commonScalarsResolver from "./common/scalars.resolver.js";
import userBadgesResolver from "./user/resolvers/user.badges.resolver.js";
import userBaseResolver from "./user/resolvers/user.base.resolver.js";
import userNotificationsResolver from "./user/resolvers/user.notifications.resolver.js";

const userResolver = mergeResolvers([
  commonScalarsResolver,
  userBadgesResolver,
  userBaseResolver,
  userNotificationsResolver,
]);

export default userResolver;
