import { describe, expect, it } from "vitest";

import {
  badgeTriggers,
  FOUNDING_MEMBER_BADGE_NAME,
  FOUNDING_MEMBER_ELIGIBLE_STAGES,
  normalizeBadgeStage,
} from "../../../../src/services/user/badge/badge.shared.js";
import foundingMemberRule from "../../../../src/services/user/badge/rules/foundingMember.rule.js";
import {
  badgeRules,
  getBadgeRulesForTrigger,
} from "../../../../src/services/user/badge/rules/index.js";

describe("user badge rule utils", () => {
  it("returns only the rules matching the trigger", () => {
    const rules = getBadgeRulesForTrigger(badgeTriggers.ACCOUNT_CREATED);

    expect(rules).toEqual([foundingMemberRule]);
    expect(badgeRules).toContain(foundingMemberRule);
  });

  it("normalizes eligible founding-member stages", () => {
    expect(normalizeBadgeStage(" Beta ")).toBe("beta");
    expect(FOUNDING_MEMBER_ELIGIBLE_STAGES.has("beta")).toBe(true);
  });

  it("awards the founding member badge for eligible registered stages", () => {
    expect(foundingMemberRule.badgeName).toBe(FOUNDING_MEMBER_BADGE_NAME);
    expect(foundingMemberRule.triggers).toEqual([
      badgeTriggers.ACCOUNT_CREATED,
    ]);

    expect(
      foundingMemberRule.shouldAward({
        trigger: badgeTriggers.ACCOUNT_CREATED,
        user: {
          id: "user_1",
          registeredStage: " Beta ",
        } as any,
      }),
    ).toBe(true);
  });

  it("does not award the founding member badge for ineligible stages", () => {
    expect(
      foundingMemberRule.shouldAward({
        trigger: badgeTriggers.ACCOUNT_CREATED,
        user: {
          id: "user_1",
          registeredStage: "production",
        } as any,
      }),
    ).toBe(false);
  });
});
