import { makeUniqueJobId } from "../job/makeJobId.util.js";

import userInterestQueue from "../../queues/userInterest.queue.js";

export type UserInterestAction =
  | "VIEW"
  | "UPVOTE"
  | "ANSWER"
  | "AI_ANSWER_FEEDBACK";

type QueueUserInterestParams = {
  userId: string;
  tags: string[];
  action: UserInterestAction;
};

const queueUserInterest = async ({
  userId,
  tags,
  action,
}: QueueUserInterestParams) => {
  await userInterestQueue.add(
    action,
    {
      userId,
      tags,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeUniqueJobId("userInterest", action, userId, ...tags),
    },
  );
};

export default queueUserInterest;
