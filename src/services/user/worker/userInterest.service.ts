import type { UserInterestAction } from "../../../utils/question/queueUserInterest.util.js";

import UserInterest from "../../../models/userInterest.model.js";

const actionScores = {
  VIEW: 1,
  UPVOTE: 3,
  ANSWER: 5,
} as const;

const isUserInterestAction = (action: string): action is UserInterestAction =>
  action in actionScores;

const applyInterestScore = async (
  userId: string,
  tag: string,
  score: number,
) => {
  await UserInterest.updateOne(
    { userId },
    [
      {
        $set: {
          userId,
          interests: {
            $let: {
              vars: {
                existingInterests: { $ifNull: ["$interests", []] },
                existingTags: {
                  $map: {
                    input: { $ifNull: ["$interests", []] },
                    as: "interest",
                    in: "$$interest.tag",
                  },
                },
              },
              in: {
                $cond: [
                  { $in: [tag, "$$existingTags"] },
                  {
                    $map: {
                      input: "$$existingInterests",
                      as: "interest",
                      in: {
                        $cond: [
                          { $eq: ["$$interest.tag", tag] },
                          {
                            tag: "$$interest.tag",
                            score: { $add: ["$$interest.score", score] },
                          },
                          "$$interest",
                        ],
                      },
                    },
                  },
                  {
                    $concatArrays: ["$$existingInterests", [{ tag, score }]],
                  },
                ],
              },
            },
          },
        },
      },
    ],
    { upsert: true },
  );
};

const processUserInterestJob = async (
  jobName: string,
  jobData: { userId: string; tags: string[] },
) => {
  if (!isUserInterestAction(jobName)) {
    throw new Error(`Unsupported user interest action: ${jobName}`);
  }

  const score = actionScores[jobName];
  const uniqueTags = [...new Set(jobData.tags)];

  for (const tag of uniqueTags) {
    await applyInterestScore(jobData.userId, tag, score);
  }
};

export default processUserInterestJob;
