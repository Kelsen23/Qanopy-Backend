import { badgeTriggers, type BadgeTrigger } from "../badge/badge.shared.js";

import awardBadge from "../badge/awardBadge.service.js";

const isBadgeTrigger = (value: string): value is BadgeTrigger =>
  Object.values(badgeTriggers).includes(value as BadgeTrigger);

const processBadgeJob = async (
  jobName: string,
  jobData: { userId: string },
) => {
  if (!isBadgeTrigger(jobName)) {
    throw new Error(`Unsupported badge trigger: ${jobName}`);
  }

  return awardBadge({
    userId: jobData.userId,
    trigger: jobName,
  });
};

export default processBadgeJob;
