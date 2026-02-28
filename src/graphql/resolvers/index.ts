import { mergeResolvers } from "@graphql-tools/merge";

import userResolver from "./user.resolver.js";
import questionResolver from "./question.resolver.js";
import moderationResolver from "./moderation.resolver.js";

const resolvers = mergeResolvers([
  userResolver,
  questionResolver,
  moderationResolver,
]);

export default resolvers;
