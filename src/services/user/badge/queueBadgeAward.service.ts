import { badgeTriggers, type BadgeTrigger } from "./badge.shared.js";

import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import badgeQueue from "../../../queues/badge.queue.js";

type QueueBadgeAwardInput = {
  userId: string;
  trigger?: BadgeTrigger;
};

const queueBadgeAward = async ({
  userId,
  trigger = badgeTriggers.ACCOUNT_CREATED,
}: QueueBadgeAwardInput) => {
  await badgeQueue.add(
    trigger,
    {
      userId,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("badge", trigger, userId),
    },
  );
};

export default queueBadgeAward;
