import { mergeResolvers } from "@graphql-tools/merge";

import userResolver from "./user.resolver.js";
import questionResolver from "./question.resolver.js";

const resolvers = mergeResolvers([userResolver, questionResolver]);

export default resolvers;
