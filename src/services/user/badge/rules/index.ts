import type { BadgeRule, BadgeTrigger } from "../badge.shared.js";

import foundingMemberRule from "./foundingMember.rule.js";

const badgeRules: BadgeRule[] = [foundingMemberRule];

const getBadgeRulesForTrigger = (trigger: BadgeTrigger) =>
  badgeRules.filter((rule) => rule.triggers.includes(trigger));

export { badgeRules, getBadgeRulesForTrigger };
