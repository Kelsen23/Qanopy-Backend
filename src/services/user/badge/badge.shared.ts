import type { User } from "../../../generated/prisma/index.js";

const badgeTriggers = {
  ACCOUNT_CREATED: "ACCOUNT_CREATED",
} as const;

const FOUNDING_MEMBER_BADGE_NAME = "Founding Member";
const FOUNDING_MEMBER_ELIGIBLE_STAGES = new Set(["demo", "beta", "alpha"]);

const normalizeBadgeStage = (stage: string) => stage.trim().toLowerCase();

type BadgeTrigger = (typeof badgeTriggers)[keyof typeof badgeTriggers];

type BadgeRuleContext = {
  trigger: BadgeTrigger;
  user: Pick<User, "id" | "registeredStage">;
};

type BadgeRule = {
  badgeName: string;
  triggers: BadgeTrigger[];
  shouldAward: (context: BadgeRuleContext) => boolean | Promise<boolean>;
};

export {
  badgeTriggers,
  FOUNDING_MEMBER_BADGE_NAME,
  FOUNDING_MEMBER_ELIGIBLE_STAGES,
  normalizeBadgeStage,
};
export type { BadgeRule, BadgeRuleContext, BadgeTrigger };
