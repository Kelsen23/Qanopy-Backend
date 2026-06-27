import { mergeResolvers } from "@graphql-tools/merge";

import moderationReportsResolver from "./moderation/resolvers/moderation.reports.resolver.js";
import moderationStrikesResolver from "./moderation/resolvers/moderation.strikes.resolver.js";

const moderationResolver = mergeResolvers([
  moderationReportsResolver,
  moderationStrikesResolver,
]) as never;

export default moderationResolver;
