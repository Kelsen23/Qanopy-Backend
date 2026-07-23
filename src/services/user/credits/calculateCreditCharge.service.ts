import type { CreditOperationType } from "../../../generated/prisma/client.js";

import prisma from "../../../config/prisma.config.js";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const getBaseCharge = (type: CreditOperationType) => {
  switch (type) {
    case "AI_SUGGESTION":
      return 25;
    case "AI_ANSWER":
      return 80;
  }
};

const getReputationMultiplier = (reputationPoints: number) => {
  if (reputationPoints >= 1000) return 0.85;
  if (reputationPoints >= 250) return 0.9;
  if (reputationPoints >= 50) return 1;
  if (reputationPoints >= 10) return 1.1;
  return 1.2;
};

const calculateCreditCharge = async ({
  userId,
  type,
  content,
}: {
  userId: string;
  type: CreditOperationType;
  content: string;
}) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      stats: { select: { reputationPoints: true } },
      moderationStats: {
        select: {
          trustScore: true,
          totalStrikes: true,
          flaggedCount: true,
          rejectedCount: true,
        },
      },
    },
  });

  const reputationPoints = user?.stats?.reputationPoints ?? 0;
  const moderationStats = user?.moderationStats;
  const fixedOverhead = type === "AI_ANSWER" ? 3600 : 800;
  const estimatedTokens = estimateTokens(content) + fixedOverhead;
  const contentMultiplier = clamp(1 + estimatedTokens / 6000, 1, 1.5);
  const reputationMultiplier = getReputationMultiplier(reputationPoints);
  const trustScore = moderationStats?.trustScore ?? 1;
  const moderationMultiplier = clamp(
    1 +
      (1 - trustScore) * 0.4 +
      Math.min(moderationStats?.totalStrikes ?? 0, 5) * 0.06 +
      Math.min(moderationStats?.flaggedCount ?? 0, 10) * 0.015 +
      Math.min(moderationStats?.rejectedCount ?? 0, 5) * 0.04,
    1,
    1.75,
  );

  return Math.ceil(
    getBaseCharge(type) *
      contentMultiplier *
      reputationMultiplier *
      moderationMultiplier,
  );
};

export default calculateCreditCharge;
