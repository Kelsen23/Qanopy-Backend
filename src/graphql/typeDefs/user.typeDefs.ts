import { mergeTypeDefs } from "@graphql-tools/merge";

import userBaseTypeDefs from "./user/user.base.typeDefs.js";
import userEnumsTypeDefs from "./user/user.enums.typeDefs.js";
import userNotificationsTypeDefs from "./user/user.notifications.typeDefs.js";

const userTypeDefs = mergeTypeDefs([
  userEnumsTypeDefs,
  userBaseTypeDefs,
  userNotificationsTypeDefs,
]);

export default userTypeDefs;
