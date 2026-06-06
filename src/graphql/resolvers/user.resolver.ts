import { mergeResolvers } from "@graphql-tools/merge";

import commonScalarsResolver from "./common/scalars.resolver.js";
import userBadgesResolver from "./user/user.badges.resolver.js";
import userBaseResolver from "./user/user.base.resolver.js";
import userNotificationsResolver from "./user/user.notifications.resolver.js";

const userResolver = mergeResolvers([
  commonScalarsResolver,
  userBadgesResolver,
  userBaseResolver,
  userNotificationsResolver,
]);

export default userResolver;
