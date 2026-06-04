import { mergeTypeDefs } from "@graphql-tools/merge";

import rootTypeDefs from "./root.typeDefs.js";
import scalarsTypeDefs from "./common/scalars.typeDefs.js";
import userTypeDefs from "./user.typeDefs.js";
import questionTypeDefs from "./question.typeDefs.js";
import moderationTypeDefs from "./moderation.typeDefs.js";

const typeDefs = mergeTypeDefs([
  rootTypeDefs,
  scalarsTypeDefs,
  userTypeDefs,
  questionTypeDefs,
  moderationTypeDefs,
]);

export default typeDefs;
