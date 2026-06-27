import { mergeTypeDefs } from "@graphql-tools/merge";

import moderationEnumsTypeDefs from "./moderation/moderation.enums.typeDefs.js";
import moderationQueryTypeDefs from "./moderation/moderation.query.typeDefs.js";
import moderationReportTypeDefs from "./moderation/moderation.report.typeDefs.js";
import moderationStrikeTypeDefs from "./moderation/moderation.strike.typeDefs.js";

const moderationTypeDefs = mergeTypeDefs([
  moderationEnumsTypeDefs,
  moderationReportTypeDefs,
  moderationStrikeTypeDefs,
  moderationQueryTypeDefs,
]);

export default moderationTypeDefs;
