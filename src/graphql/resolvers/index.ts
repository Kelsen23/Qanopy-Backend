import { mergeResolvers } from "@graphql-tools/merge";

import userResolvers from "./user.resolvers.js";
import questionResolvers from "./question.resolvers.js";

const resolvers = mergeResolvers([userResolvers, questionResolvers]);

export default resolvers;
