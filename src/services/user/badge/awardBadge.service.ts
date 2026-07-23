import type { BadgeTrigger } from "./badge.shared.js";
import { getBadgeRulesForTrigger } from "./rules/index.js";

import prisma from "../../../config/prisma.config.js";

import { clearUserBadgesCache } from "../../../utils/cache/clearCache.util.js";

type AwardBadgeInput = {
  userId: string;
  trigger: BadgeTrigger;
};

const awardBadge = async ({ userId, trigger }: AwardBadgeInput) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      stats: {
        select: {
          registeredStage: true,
        },
      },
      statusState: {
        select: {
          isDeleted: true,
        },
      },
    },
  });

  if (!user || user.statusState?.isDeleted) {
    throw new Error(`Badge user not found: ${userId}`);
  }

  const badgeUser = {
    id: user.id,
    registeredStage: user.stats?.registeredStage ?? "DEMO",
  };

  const rules = getBadgeRulesForTrigger(trigger);

  if (!rules.length) {
    throw new Error(`Unsupported badge trigger: ${trigger}`);
  }

  for (const rule of rules) {
    const shouldAward = await rule.shouldAward({
      trigger,
      user: badgeUser,
    });

    if (!shouldAward) {
      continue;
    }

    const badge = await prisma.badge.findFirst({
      where: {
        name: rule.badgeName,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!badge) {
      throw new Error(`Badge not found: ${rule.badgeName}`);
    }

    await prisma.userBadge.upsert({
      where: {
        userId_badgeId: {
          userId: badgeUser.id,
          badgeId: badge.id,
        },
      },
      create: {
        userId: badgeUser.id,
        badgeId: badge.id,
        source: trigger,
      },
      update: {
        source: trigger,
      },
    });

    await clearUserBadgesCache(user.id);
  }
};

export default awardBadge;
