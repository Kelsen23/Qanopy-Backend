import prisma from "../../../config/prisma.config.js";

import getCreditLimits from "./getCreditLimits.service.js";

const hasCreditCapacity = async (userId: string, amount: number) => {
  const usages = await prisma.creditPeriodUsage.findMany({
    where: { userId, periodType: { in: ["DAILY", "WEEKLY"] } },
    select: { periodType: true, used: true, resetAt: true },
  });
  const now = new Date();

  return getCreditLimits().every(({ periodType, limit }) => {
    const usage = usages.find((item) => item.periodType === periodType);
    const effectiveUsed = !usage || usage.resetAt <= now ? 0 : usage.used;
    return effectiveUsed + amount <= limit;
  });
};

export default hasCreditCapacity;
