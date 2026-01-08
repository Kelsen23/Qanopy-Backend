import mongoose from "mongoose";

import Question from "../../models/questionModel.js";
import Answer from "../../models/answerModel.js";
import Reply from "../../models/replyModel.js";
import QuestionVersion from "../../models/questionVersionModel.js";

import UserWithoutSensitiveInfo from "../../types/userWithoutSensitiveInfo.js";

import HttpError from "../../utils/httpError.js";
import interests from "../../utils/interests.js";

interface SearchQuestionStage {
  $search: {
    index: string;
    compound: {
      must: any[];
      should?: any[];
      minimumShouldMatch?: number;
    };
  };
}

const questionResolvers = {
  Query: {
    getRecommendedQuestions: async (
      _: any,
      { cursor, limitCount = 10 }: { cursor?: string; limitCount: number },
      {
        user,
        redisCacheClient,
        loaders,
      }: {
        user: UserWithoutSensitiveInfo;
        redisCacheClient: any;
        loaders: any;
      },
    ) => {
      const interests = user.interests || [];
      const sortedInterests = [...interests].sort().join(",");

      const cachedQuestions = await redisCacheClient.get(
        `recommendedQuestions:${sortedInterests}:${cursor || "initial"}`,
      );
      if (cachedQuestions) return JSON.parse(cachedQuestions);

      const searchStage = interests.length
        ? ({
            $search: {
              index: "recommended_index",
              compound: {
                should: interests.map((interest) => ({
                  text: {
                    query: interest,
                    path: ["title", "body", "tags"],
                    fuzzy: { maxEdits: 1, prefixLength: 2 },
                  },
                })),
                minimumShouldMatch: 1,
              },
            },
          } as any)
        : null;

      const pipeline: any[] = [];

      if (searchStage) pipeline.push(searchStage);

      const matchStage: any = {
        isDeleted: false,
        isActive: true,
      };

      if (cursor) {
        matchStage._id = { $lt: new mongoose.Types.ObjectId(cursor) };
      }

      pipeline.push(
        { $match: matchStage },

        {
          $sort: {
            upvoteCount: -1,
            _id: -1,
          } as any,
        },

        { $limit: limitCount },

        {
          $project: {
            id: "$_id",
            _id: 0,
            title: 1,
            body: 1,
            tags: 1,
            userId: 1,
            upvotes: "$upvoteCount",
            downvotes: "$downvoteCount",
            answerCount: 1,
            currentVersion: 1,
            isDeleted: 1,
            isActive: 1,
            createdAt: 1,
          },
        },
      );

      const questions = await Question.aggregate(pipeline);

      const uniqueUserIds = [...new Set(questions.map((q) => q.userId))];

      const users = await loaders.userLoader.loadMany(uniqueUserIds);

      const userMap = new Map(users.map((u: any) => [u?.id, u]));

      const questionsWithUsers = questions.map((q) => {
        let user = userMap.get(q.userId);

        if (!user) {
          user = {
            id: q.userId,
            username: "Deleted User",
            email: "deleted@user.com",
            profilePictureUrl: null,
            bio: null,
            reputationPoints: 0,
            role: "USER",
            questionsAsked: 0,
            answersGiven: 0,
            bestAnswers: 0,
            achievements: [],
            status: "TERMINATED",
            isVerified: false,
            createdAt: new Date(0).toISOString(),
          };
        }

        return { ...q, user };
      });

      const result = {
        questions: questionsWithUsers,
        nextCursor:
          questionsWithUsers.length === limitCount
            ? questionsWithUsers[questionsWithUsers.length - 1].id
            : null,
        hasMore: questionsWithUsers.length === limitCount,
      };

      await redisCacheClient.set(
        `recommendedQuestions:${sortedInterests}:${cursor || "initial"}`,
        JSON.stringify(result),
        "EX",
        60 * 5,
      );

      return result;
    },

    getQuestionById: async (
      _: any,
      { id }: { id: string },
      { redisCacheClient, loaders }: { redisCacheClient: any; loaders: any },
    ) => {
      const cachedQuestion = await redisCacheClient.get(`question:${id}`);
      if (cachedQuestion) return JSON.parse(cachedQuestion);

      const questionData = await Question.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(id) } },

        {
          $lookup: {
            from: "answers",
            localField: "_id",
            foreignField: "questionId",
            as: "answers",
          },
        },

        {
          $addFields: {
            answers: {
              $filter: {
                input: "$answers",
                as: "a",
                cond: {
                  $and: [
                    { $eq: ["$$a.isActive", true] },
                    { $eq: ["$$a.isDeleted", false] },
                  ],
                },
              },
            },
          },
        },

        {
          $addFields: {
            topAnswer: {
              $cond: {
                if: { $eq: [{ $size: "$answers" }, 0] },
                then: null,
                else: {
                  $let: {
                    vars: {
                      filteredTop: {
                        $filter: {
                          input: "$answers",
                          as: "a",
                          cond: { $eq: ["$$a.isBestAnswerByAsker", true] },
                        },
                      },
                    },
                    in: {
                      $cond: {
                        if: {
                          $gt: [
                            { $size: { $ifNull: ["$$filteredTop", []] } },
                            0,
                          ],
                        },
                        then: { $first: "$$filteredTop" },
                        else: {
                          $first: {
                            $sortArray: {
                              input: "$answers",
                              sortBy: { upvoteCount: -1, createdAt: 1 },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },

        {
          $lookup: {
            from: "replies",
            let: { topAnswerId: "$topAnswer._id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$answerId", "$$topAnswerId"] },
                  isActive: true,
                  isDeleted: false,
                },
              },
              { $sort: { upvoteCount: -1, _id: -1 } },
            ],
            as: "topReplies",
          },
        },

        {
          $project: {
            id: "$_id",
            _id: 0,
            userId: 1,
            title: 1,
            body: 1,
            tags: 1,
            upvotes: "$upvoteCount",
            downvotes: "$downvoteCount",
            answerCount: 1,
            currentVersion: 1,
            isActive: 1,
            isDeleted: 1,
            createdAt: 1,
            topAnswer: {
              $cond: {
                if: {
                  $and: [
                    { $ne: ["$topAnswer", null] },
                    { $ne: ["$topAnswer._id", null] },
                  ],
                },
                then: {
                  id: "$topAnswer._id",
                  userId: "$topAnswer.userId",
                  body: "$topAnswer.body",
                  upvotes: "$topAnswer.upvoteCount",
                  downvotes: "$topAnswer.downvoteCount",
                  isAccepted: "$topAnswer.isAccepted",
                  isBestAnswerByAsker: "$topAnswer.isBestAnswerByAsker",
                  questionVersion: "$topAnswer.questionVersion",
                  isActive: "$topAnswer.isActive",
                  isDeleted: "$topAnswer.isDeleted",
                  createdAt: "$topAnswer.createdAt",
                  replyCount: "$topAnswer.replyCount",
                  replies: {
                    $map: {
                      input: "$topReplies",
                      as: "reply",
                      in: {
                        id: "$$reply._id",
                        userId: "$$reply.userId",
                        body: "$$reply.body",
                        upvotes: "$$reply.upvoteCount",
                        downvotes: "$$reply.downvoteCount",
                        isActive: "$$reply.isActive",
                        isDeleted: "$$reply.isDeleted",
                        createdAt: "$$reply.createdAt",
                      },
                    },
                  },
                },
                else: null,
              },
            },
          },
        },
      ]);

      const question = questionData[0];

      if (!question) {
        return null;
      }

      const userIds = new Set<string>();

      if (question.userId) {
        userIds.add(question.userId.toString());
      }

      if (question.topAnswer?.userId) {
        userIds.add(question.topAnswer.userId.toString());
      }

      if (
        question.topAnswer?.replies &&
        Array.isArray(question.topAnswer.replies)
      ) {
        question.topAnswer.replies.forEach((r: any) => {
          if (r?.userId) userIds.add(r.userId.toString());
        });
      }

      const allUserIds = Array.from(userIds);

      if (allUserIds.length > 0) {
        const users = await loaders.userLoader.loadMany(allUserIds);
        const userMap = new Map();

        users.forEach((u: any) => {
          if (u && !u.error && u.id) {
            userMap.set(u.id.toString(), u);
          }
        });

        if (question.userId) {
          question.user = userMap.get(question.userId.toString()) || {
            id: question.userId,
            username: "Deleted User",
            email: "deleted@user.com",
            profilePictureUrl: null,
            bio: null,
            reputationPoints: 0,
            role: "USER",
            questionsAsked: 0,
            answersGiven: 0,
            bestAnswers: 0,
            achievements: [],
            status: "TERMINATED",
            isVerified: false,
            createdAt: new Date(0).toISOString(),
          };
        }

        if (question.topAnswer?.userId) {
          question.topAnswer.user = userMap.get(
            question.topAnswer.userId.toString(),
          ) || {
            id: question.topAnswer.userId,
            username: "Deleted User",
            email: "deleted@user.com",
            profilePictureUrl: null,
            bio: null,
            reputationPoints: 0,
            role: "USER",
            questionsAsked: 0,
            answersGiven: 0,
            bestAnswers: 0,
            achievements: [],
            status: "TERMINATED",
            isVerified: false,
            createdAt: new Date(0).toISOString(),
          };
        }

        if (
          question.topAnswer?.replies &&
          Array.isArray(question.topAnswer.replies)
        ) {
          question.topAnswer.replies = question.topAnswer.replies.map(
            (r: any) => ({
              ...r,
              user: r?.userId
                ? userMap.get(r.userId.toString()) || {
                    id: r.userId,
                    username: "Deleted User",
                    email: "deleted@user.com",
                    profilePictureUrl: null,
                    bio: null,
                    reputationPoints: 0,
                    role: "USER",
                    questionsAsked: 0,
                    answersGiven: 0,
                    bestAnswers: 0,
                    achievements: [],
                    status: "TERMINATED",
                    isVerified: false,
                    createdAt: new Date(0).toISOString(),
                  }
                : null,
            }),
          );
        }
      }

      await redisCacheClient.set(
        `question:${id}`,
        JSON.stringify(question),
        "EX",
        60 * 15,
      );

      if (question.topAnswer && !question.topAnswer.id) {
        question.topAnswer = null;
      }

      return question;
    },

    loadMoreAnswers: async (
      _: any,
      {
        questionId,
        topAnswerId,
        cursor,
        limitCount = 10,
      }: {
        questionId: string;
        topAnswerId: string;
        cursor?: string;
        limitCount: number;
      },
      { loaders, redisCacheClient }: { loaders: any; redisCacheClient: any },
    ) => {
      const cachedAnswers = await redisCacheClient.get(
        `answers:${questionId}:${cursor || "initial"}`,
      );
      if (cachedAnswers) return JSON.parse(cachedAnswers);

      const matchStage: Record<string, any> = {
        questionId: new mongoose.Types.ObjectId(questionId),
        isDeleted: false,
        isActive: true,
      };

      const idConditions: any[] = [];

      if (topAnswerId) {
        idConditions.push({
          _id: { $ne: new mongoose.Types.ObjectId(topAnswerId) },
        });
      }

      if (cursor) {
        idConditions.push({
          _id: { $lt: new mongoose.Types.ObjectId(cursor) },
        });
      }

      if (idConditions.length > 0) {
        if (idConditions.length === 1) {
          Object.assign(matchStage, idConditions[0]);
        } else {
          matchStage.$and = idConditions;
        }
      }

      const answers = await Answer.aggregate([
        { $match: matchStage },

        {
          $addFields: {
            score: { $subtract: ["$upvoteCount", "$downvoteCount"] },
          },
        },

        {
          $sort: {
            score: -1,
            replyCount: -1,
            _id: -1,
          },
        },

        { $limit: limitCount },

        {
          $project: {
            id: "$_id",
            _id: 0,
            userId: 1,
            body: 1,
            replies: [],
            replyCount: 1,
            isAccepted: 1,
            isBestAnswerByAsker: 1,
            upvotes: "$upvoteCount",
            downvotes: "$downvoteCount",
            questionVersion: 1,
            isDeleted: 1,
            isActive: 1,
            createdAt: 1,
          },
        },
      ]);

      const uniqueUserIds = [...new Set(answers.map((a) => a.userId))];

      const users = await loaders.userLoader.loadMany(uniqueUserIds);

      const userMap = new Map(users.map((u: any) => [u?.id, u]));

      const answersWithUsers = answers.map((a) => {
        let user = userMap.get(a.userId);

        if (!user) {
          user = {
            id: a.userId,
            username: "Deleted User",
            email: "deleted@user.com",
            profilePictureUrl: null,
            bio: null,
            reputationPoints: 0,
            role: "USER",
            questionsAsked: 0,
            answersGiven: 0,
            bestAnswers: 0,
            achievements: [],
            status: "TERMINATED",
            isVerified: false,
            createdAt: new Date(0).toISOString(),
          };
        }

        return { ...a, user };
      });

      const result = {
        answers: answersWithUsers,
        nextCursor:
          answersWithUsers.length === limitCount
            ? answersWithUsers[answersWithUsers.length - 1].id
            : null,
        hasMore: answersWithUsers.length === limitCount,
      };

      await redisCacheClient.set(
        `answers:${questionId}:${cursor || "initial"}`,
        JSON.stringify(result),
        "EX",
        60 * 5,
      );

      return result;
    },

    loadMoreReplies: async (
      _: any,
      {
        answerId,
        cursor,
        limitCount = 10,
      }: { answerId: string; cursor?: string; limitCount: number },
      { loaders, redisCacheClient }: { loaders: any; redisCacheClient: any },
    ) => {
      const cachedReplies = await redisCacheClient.get(
        `replies:${answerId}:${cursor || "initial"}`,
      );

      if (cachedReplies) return JSON.parse(cachedReplies);

      const matchStage: any = {
        answerId: new mongoose.Types.ObjectId(answerId),
        isDeleted: false,
        isActive: true,
      };

      if (cursor) {
        matchStage._id = { $lt: new mongoose.Types.ObjectId(cursor) };
      }

      const replies = await Reply.aggregate([
        { $match: matchStage },

        {
          $addFields: {
            score: { $subtract: ["$upvoteCount", "$downvoteCount"] },
          },
        },

        {
          $sort: {
            score: -1,
            _id: -1,
          },
        },

        { $limit: limitCount },

        {
          $project: {
            id: "$_id",
            _id: 0,
            userId: 1,
            body: 1,
            upvotes: "$upvoteCount",
            downvotes: "$downvoteCount",
            isActive: 1,
            isDeleted: 1,
            createdAt: 1,
          },
        },
      ]);

      const uniqueUserIds = [...new Set(replies.map((a) => a.userId))];

      const users = await loaders.userLoader.loadMany(uniqueUserIds);

      const userMap = new Map(users.map((u: any) => [u?.id, u]));

      const repliesWithUsers = replies.map((r) => {
        let user = userMap.get(r.userId);

        if (!user) {
          user = {
            id: r.userId,
            username: "Deleted User",
            email: "deleted@user.com",
            profilePictureUrl: null,
            bio: null,
            reputationPoints: 0,
            role: "USER",
            questionsAsked: 0,
            answersGiven: 0,
            bestAnswers: 0,
            achievements: [],
            status: "TERMINATED",
            isVerified: false,
            createdAt: new Date(0).toISOString(),
          };
        }

        return { ...r, user };
      });

      const result = {
        replies: repliesWithUsers,
        nextCursor:
          repliesWithUsers.length === limitCount
            ? repliesWithUsers[repliesWithUsers.length - 1].id
            : null,
        hasMore: repliesWithUsers.length === limitCount,
      };

      await redisCacheClient.set(
        `replies:${answerId}:${cursor || "initial"}`,
        JSON.stringify(result),
        "EX",
        5 * 60,
      );

      return result;
    },

    getSearchSuggestions: async (
      _: any,
      {
        searchKeyword,
        limitCount = 10,
      }: { searchKeyword: string; limitCount: number },
      { redisCacheClient }: { redisCacheClient: any },
    ) => {
      const cachedSuggestions = await redisCacheClient.get(
        `searchSuggestions:${searchKeyword}`,
      );

      if (cachedSuggestions) return JSON.parse(cachedSuggestions);

      const results = await Question.aggregate([
        {
          $search: {
            index: "questions_autocomplete",
            autocomplete: {
              query: searchKeyword,
              path: "title",
              fuzzy: { maxEdits: 1 },
            },
          },
        },

        {
          $group: {
            _id: "$title",
            title: { $first: "$title" },
          },
        },

        { $limit: limitCount },

        { $project: { id: "$_id", _id: 0, title: 1 } },
      ]);

      const suggestions = results.map((r) => r.title);

      await redisCacheClient.set(
        `searchSuggestions:${searchKeyword}`,
        JSON.stringify(suggestions),
        "EX",
        60 * 60,
      );

      return suggestions;
    },

    searchQuestions: async (
      _: any,
      {
        searchKeyword,
        tags,
        sortOption,
        cursor,
        limitCount = 1,
      }: {
        searchKeyword: string;
        limitCount: number;
        tags: string[];
        sortOption: string;
        cursor?: string;
      },
      { redisCacheClient, loaders }: { redisCacheClient: any; loaders: any },
    ) => {
      if (!["LATEST", "TOP"].includes(sortOption))
        throw new HttpError(
          `Invalid sort option. Allowed values: ${["LATEST", "TOP"].join(", ")}`,
          400,
        );

      const invalidTags = tags.filter((tag) => !interests.includes(tag));

      if (invalidTags.length > 0)
        throw new HttpError(`Invalid tags: ${invalidTags.join(", ")}`, 400);

      const cachedQuestions = await redisCacheClient.get(
        `searchQuestions:${searchKeyword}:${tags.sort().join(", ")}:${sortOption}:${cursor || "initial"}`,
      );

      if (cachedQuestions) return JSON.parse(cachedQuestions);

      const sortMapping: Record<string, any> = {
        LATEST: { createdAt: -1, _id: -1 },
        TOP: {
          answerCount: -1,
          upvoteCount: -1,
          _id: -1,
        },
      };

      const searchStage: SearchQuestionStage = {
        $search: {
          index: "search_index",
          compound: {
            must: [
              {
                text: {
                  query: searchKeyword,
                  path: ["title", "body"],
                  fuzzy: { maxEdits: 1, prefixLength: 2 },
                },
              },
            ],
          },
        },
      };

      if (tags.length > 0) {
        searchStage.$search.compound.should = tags.map((tag) => ({
          text: {
            query: tag,
            path: ["title", "body", "tags"],
            fuzzy: { maxEdits: 1, prefixLength: 2 },
          },
        }));

        searchStage.$search.compound.minimumShouldMatch = 1;
      }

      const matchStage: any = {
        isDeleted: false,
        isActive: true,
      };

      if (cursor) {
        matchStage._id = { $lt: new mongoose.Types.ObjectId(cursor) };
      }

      const questions = await Question.aggregate([
        searchStage,

        { $match: matchStage },

        { $sort: sortMapping[sortOption] },

        { $limit: limitCount },

        {
          $project: {
            id: "$_id",
            _id: 0,
            title: 1,
            body: 1,
            tags: 1,
            userId: 1,
            upvotes: "$upvoteCount",
            downvotes: "$downvoteCount",
            answerCount: 1,
            currentVersion: 1,
            isDeleted: 1,
            isActive: 1,
            createdAt: 1,
          },
        },
      ]);

      const uniqueUserIds = [...new Set(questions.map((q) => q.userId))];

      const users = await loaders.userLoader.loadMany(uniqueUserIds);

      const userMap = new Map(users.map((u: any) => [u?.id, u]));

      const questionsWithUsers = questions.map((q) => {
        let user = userMap.get(q.userId);

        if (!user) {
          user = {
            id: q.userId,
            username: "Deleted User",
            email: "deleted@user.com",
            profilePictureUrl: null,
            bio: null,
            reputationPoints: 0,
            role: "USER",
            questionsAsked: 0,
            answersGiven: 0,
            bestAnswers: 0,
            achievements: [],
            status: "TERMINATED",
            isVerified: false,
            createdAt: new Date(0).toISOString(),
          };
        }

        return { ...q, user };
      });

      const result = {
        questions: questionsWithUsers,
        nextCursor:
          questionsWithUsers.length === limitCount
            ? questionsWithUsers[questionsWithUsers.length - 1].id
            : null,
        hasMore: questionsWithUsers.length === limitCount,
      };

      await redisCacheClient.set(
        `searchQuestions:${searchKeyword}:${tags.sort().join(", ")}:${sortOption}:${cursor || "initial"}`,
        JSON.stringify(result),
        "EX",
        60 * 15,
      );

      return result;
    },

    getVersionHistory: async (
      _: any,
      {
        questionId,
        cursor,
        limitCount = 10,
      }: { questionId: string; cursor?: string; limitCount: number },
      { redisCacheClient, loaders }: { redisCacheClient: any; loaders: any },
    ) => {
      const cachedVersionHistory = await redisCacheClient.get(
        `v:question:${questionId}:${cursor || "initial"}`,
      );

      if (cachedVersionHistory) return JSON.parse(cachedVersionHistory);

      const matchStage: any = {
        questionId: new mongoose.Types.ObjectId(questionId),
      };

      if (cursor) {
        matchStage._id = { $lt: new mongoose.Types.ObjectId(cursor) };
      }

      const foundVersionHistory = await QuestionVersion.aggregate([
        { $match: matchStage },

        { $sort: { _id: -1 } },

        { $limit: limitCount },

        {
          $project: {
            id: "$_id",
            _id: 0,
            questionId: 1,
            title: 1,
            body: 1,
            tags: 1,
            editedBy: 1,
            editorId: 1,
            supersededByRollback: 1,
            version: 1,
            basedOnVersion: 1,
            isActive: 1,
          },
        },
      ]);

      const uniqueUserIds = [
        ...new Set(foundVersionHistory.map((v) => v.editorId)),
      ];

      const users = await loaders.userLoader.ladMany(uniqueUserIds);

      const userMap = new Map(users.map((u: any) => [u?.id, u]));

      const versionHistoryWithUser = foundVersionHistory.map((v) => {
        if (v.editedBy === "USER" && v.editorId) {
          let user = userMap.get(v.editorId);

          if (!user) {
            user = {
              id: v.editorId,
              username: "Deleted User",
              email: "deleted@user.com",
              profilePictureUrl: null,
              bio: null,
              reputationPoints: 0,
              role: "USER",
              questionsAsked: 0,
              answersGiven: 0,
              bestAnswers: 0,
              achievements: [],
              status: "TERMINATED",
              isVerified: false,
              createdAt: new Date(0).toISOString(),
            };
          }

          return { ...v, user };
        } else {
          return { ...v, user: null };
        }
      });

      const result = {
        questionVersions: versionHistoryWithUser,
        nextCursor:
          versionHistoryWithUser.length === limitCount
            ? versionHistoryWithUser[versionHistoryWithUser.length - 1].id
            : null,
        hasMore: versionHistoryWithUser.length === limitCount,
      };

      await redisCacheClient.set(
        `v:question:${questionId}:${cursor || "initial"}`,
        JSON.stringify(result),
        "EX",
        60 * 60,
      );

      return result;
    },

    getQuestionVersion: async (
      _: any,
      { questionId, version }: { questionId: string; version: number },
      { redisCacheClient, loaders }: { redisCacheClient: any; loaders: any },
    ) => {
      const cachedVersion = await redisCacheClient.get(
        `v:${version}:question:${questionId}`,
      );

      if (cachedVersion) return JSON.parse(cachedVersion);

      const foundVersion = await QuestionVersion.findOne({
        questionId: new mongoose.Types.ObjectId(questionId),
        version,
      }).lean();

      if (!foundVersion) throw new HttpError("Version not found", 404);

      let user = null;

      if (foundVersion.editedBy === "USER" && foundVersion.editorId) {
        user = await loaders.userLoader.load(foundVersion.editorId);

        if (!user) {
          user = {
            id: foundVersion.editorId,
            username: "Deleted User",
            email: "deleted@user.com",
            profilePictureUrl: null,
            bio: null,
            reputationPoints: 0,
            role: "USER",
            questionsAsked: 0,
            answersGiven: 0,
            bestAnswers: 0,
            achievements: [],
            status: "TERMINATED",
            isVerified: false,
            createdAt: new Date(0).toISOString(),
          };
        }
      }

      const result = {
        ...foundVersion,
        id: foundVersion._id,
        user,
      };

      await redisCacheClient.set(
        `v:${version}:question:${questionId}`,
        JSON.stringify(result),
        "EX",
        60 * 60,
      );

      return result;
    },
  },
};

export default questionResolvers;
