import { mergeTypeDefs } from "@graphql-tools/merge";

import userTypeDefs from "./user.typeDefs.js";
import questionTypeDefs from "./question.typeDefs.js";

const typeDefs = mergeTypeDefs([userTypeDefs, questionTypeDefs]);

export default typeDefs;
