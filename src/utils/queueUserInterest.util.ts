import userInterestQueue from "../queues/userInterest.queue.js";

export type UserInterestAction = "VIEW" | "UPVOTE" | "ANSWER";

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
  await userInterestQueue.add(action, {
    userId,
    tags,
  });
};

export default queueUserInterest;
