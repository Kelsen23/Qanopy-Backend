import type { BadgeTrigger } from "./badge.shared.js";
import { getBadgeRulesForTrigger } from "./rules/index.js";

import prisma from "../../../config/prisma.config.js";

type AwardBadgeInput = {
  userId: string;
  trigger: BadgeTrigger;
};

const awardBadge = async ({ userId, trigger }: AwardBadgeInput) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      registeredStage: true,
      isDeleted: true,
    },
  });

  if (!user || user.isDeleted) {
    throw new Error(`Badge user not found: ${userId}`);
  }

  const rules = getBadgeRulesForTrigger(trigger);

  if (!rules.length) {
    throw new Error(`Unsupported badge trigger: ${trigger}`);
  }

  for (const rule of rules) {
    const shouldAward = await rule.shouldAward({
      trigger,
      user,
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
          userId: user.id,
          badgeId: badge.id,
        },
      },
      create: {
        userId: user.id,
        badgeId: badge.id,
        source: trigger,
      },
      update: {
        source: trigger,
      },
    });
  }
};

export default awardBadge;
