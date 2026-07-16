import prisma from "../../../config/prisma.config.js";

import {
  assertModerationActionJobName,
  assertModerationReviewer,
  type ModerationActionJobName,
  type ModerationReviewer,
} from "../../../utils/moderation/shared.js";

const getTrustScoreDelta = (jobName: ModerationActionJobName) => {
  switch (jobName) {
    case "BAN_PERM":
      return -0.25;
    case "BAN_TEMP":
      return -0.1;
    case "WARN":
      return -0.03;
    case "IGNORE":
      return 0.01;
  }
};

const processModerationMetricsJob = async (
  jobName: string,
  jobData: { userId: string; reviewedBy: ModerationReviewer },
) => {
  const actionName = assertModerationActionJobName(jobName);
  const reviewedBy = assertModerationReviewer(jobData.reviewedBy);
  const { userId } = jobData;

  const stats = await prisma.moderationStats.findUnique({
    where: { userId },
  });

  if (!stats) {
    throw new Error("Moderation stats not found");
  }

  const trustScore = Math.max(
    0,
    Math.min(1, stats.trustScore + getTrustScoreDelta(actionName)),
  );

  if (actionName === "IGNORE") {
    await prisma.moderationStats.update({
      where: { userId },
      data: { trustScore },
    });

    return;
  }

  if (actionName === "BAN_PERM") {
    await prisma.moderationStats.update({
      where: { userId },
      data:
        reviewedBy === "AI_MODERATION"
          ? {
              lastStrikeAt: new Date(),
              trustScore,
              totalStrikes: { increment: 1 },
            }
          : {
              trustScore,
              rejectedCount: { increment: 1 },
            },
    });

    return;
  }

  if (actionName === "BAN_TEMP") {
    await prisma.moderationStats.update({
      where: { userId },
      data: {
        trustScore,
        rejectedCount: { increment: 1 },
      },
    });

    return;
  }

  await prisma.moderationStats.update({
    where: { userId },
    data: {
      trustScore,
      flaggedCount: { increment: 1 },
    },
  });
};

export default processModerationMetricsJob;
