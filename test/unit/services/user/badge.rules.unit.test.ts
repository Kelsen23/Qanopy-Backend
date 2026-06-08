import { describe, expect, it } from "vitest";

import {
  badgeTriggers,
  FOUNDING_MEMBER_BADGE_NAME,
} from "../../../../src/services/user/badge/badge.shared.js";
import foundingMemberRule from "../../../../src/services/user/badge/rules/foundingMember.rule.js";
import {
  badgeRules,
  getBadgeRulesForTrigger,
} from "../../../../src/services/user/badge/rules/index.js";

describe("user badge rules", () => {
  it("returns only the rules matching the trigger", () => {
    const rules = getBadgeRulesForTrigger(badgeTriggers.ACCOUNT_CREATED);

    expect(rules).toEqual([foundingMemberRule]);
    expect(badgeRules).toContain(foundingMemberRule);
  });

  it("awards the founding member badge for eligible registered stages", async () => {
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

  it("does not award the founding member badge for ineligible stages", async () => {
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
