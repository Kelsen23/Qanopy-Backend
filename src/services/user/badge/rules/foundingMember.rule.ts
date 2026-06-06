import {
  badgeTriggers,
  FOUNDING_MEMBER_BADGE_NAME,
  FOUNDING_MEMBER_ELIGIBLE_STAGES,
  normalizeBadgeStage,
  type BadgeRule,
} from "../badge.shared.js";

const foundingMemberRule: BadgeRule = {
  badgeName: FOUNDING_MEMBER_BADGE_NAME,
  triggers: [badgeTriggers.ACCOUNT_CREATED],
  shouldAward: ({ user }) =>
    FOUNDING_MEMBER_ELIGIBLE_STAGES.has(
      normalizeBadgeStage(user.registeredStage),
    ),
};

export default foundingMemberRule;
