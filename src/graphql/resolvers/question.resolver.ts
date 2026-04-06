import mongoose from "mongoose";
import { Redis } from "ioredis";
import { GraphQLScalarType, Kind } from "graphql";

import Question from "../../models/question.model.js";
import Answer from "../../models/answer.model.js";
import Reply from "../../models/reply.model.js";
import QuestionVersion from "../../models/questionVersion.model.js";
import AiAnswer from "../../models/aiAnswer.model.js";

import HttpError from "../../utils/httpError.util.js";
import interests from "../../utils/interests.util.js";

import { Interest, User } from "../../generated/prisma/index.js";

type RecommendedQuestionsCursor = {
  id: string;
  upvoteCount: number;
  searchScore: number;
};

type LoadMoreAnswersDefaultCursor = {
  id: string;
  ownerPriority: number;
  bestPriority: number;
  acceptedPriority: number;
  upvoteCount: number;
};

type LoadMoreAnswersCursor = {
  id: string;
  ownerPriority?: number;
  bestPriority?: number;
  acceptedPriority?: number;
  upvoteCount?: number;
};

type LoadMoreRepliesCursor = {
  id: string;
  upvoteCount: number;
};

type SearchQuestionsCursor = {
  id: string;
  createdAt?: string;
  searchScore?: number;
  upvoteCount?: number;
};

type VersionHistoryCursor = {
  id: string;
};

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

const isInterest = (tag: string): tag is Interest =>
  interests.includes(tag as Interest);

const parseJsonLiteral = (ast: any): any => {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.OBJECT: {
      const value: Record<string, any> = {};
      for (const field of ast.fields) {
        value[field.name.value] = parseJsonLiteral(field.value);
      }
      return value;
    }
    case Kind.LIST:
      return ast.values.map(parseJsonLiteral);
    case Kind.NULL:
      return null;
    default:
      return null;
  }
};

const jsonScalar = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value",
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: parseJsonLiteral,
});

const questionResolver = {
  JSON: jsonScalar,
  Query: {
    recommendedQuestions: async (
      _: any,
      {
        cursor,
        limitCount = 10,
      }: {
        cursor?: RecommendedQuestionsCursor;
        limitCount: number;
      },
      {
        user,
        getRedisCacheClient,
        loaders,
      }: {
        user: User;
        getRedisCacheClient: () => Redis;
        loaders: any;
      },
    ) => {
      const normalizedLimitCount =
        Number.isInteger(limitCount) && Number(limitCount) > 0
          ? Number(limitCount)
          : 10;

      const interests = user.interests || [];
      const sortedInterests = [...interests].sort().join(",");
      const cursorCacheKey = cursor
        ? `${cursor.id}:${cursor.upvoteCount}:${cursor.searchScore}`
        : "initial";

      const cachedQuestions = await getRedisCacheClient().get(
        `recommendedQuestions:${sortedInterests}:${cursorCacheKey}:${normalizedLimitCount}`,
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

      if (searchStage) {
        pipeline.push(searchStage);
      }

      pipeline.push({
        $addFields: {
          searchScore: searchStage
            ? { $ifNull: [{ $meta: "searchScore" }, 0] }
            : 0,
        },
      });

      const matchStage: any = {
        isDeleted: false,
        isActive: true,
        topicStatus: "VALID",
        moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
      };

      if (cursor) {
        if (
          !mongoose.isValidObjectId(cursor.id) ||
          !Number.isFinite(cursor.upvoteCount) ||
          (searchStage && !Number.isFinite(cursor.searchScore))
        )
          throw new HttpError("Invalid cursor", 400);

        const cursorObjectId = new mongoose.Types.ObjectId(cursor.id);

        if (searchStage) {
          matchStage.$or = [
            { searchScore: { $lt: cursor.searchScore } },

            {
              searchScore: cursor.searchScore,
              upvoteCount: { $lt: cursor.upvoteCount },
            },

            {
              searchScore: cursor.searchScore,
              upvoteCount: cursor.upvoteCount,
              _id: { $lt: cursorObjectId },
            },
          ];
        } else {
          matchStage.$or = [
            { upvoteCount: { $lt: cursor.upvoteCount } },

            {
              upvoteCount: cursor.upvoteCount,
              _id: { $lt: cursorObjectId },
            },
          ];
        }
      }

      pipeline.push(
        { $match: matchStage },

        {
          $sort: {
            ...(searchStage ? { searchScore: -1 } : {}),
            upvoteCount: -1,
            _id: -1,
          } as any,
        },

        { $limit: normalizedLimitCount },

        {
          $project: {
            id: "$_id",
            _id: 0,
            searchScore: 1,
            title: 1,
            tags: 1,
            userId: 1,
            upvoteCount: 1,
            downvoteCount: 1,
            answerCount: 1,
            currentVersion: 1,
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
          user = null;
        }

        return { ...q, user };
      });

      const result = {
        questions: questionsWithUsers,
        nextCursor:
          questionsWithUsers.length === normalizedLimitCount
            ? ({
                id: questions[questions.length - 1].id,
                upvoteCount: questions[questions.length - 1].upvoteCount,
                searchScore: questions[questions.length - 1].searchScore,
              } as RecommendedQuestionsCursor)
            : null,
        hasMore: questionsWithUsers.length === normalizedLimitCount,
      };

      await getRedisCacheClient().set(
        `recommendedQuestions:${sortedInterests}:${cursorCacheKey}:${normalizedLimitCount}`,
        JSON.stringify(result),
        "EX",
        60 * 5,
      );

      return result;
    },

    question: async (
      _: any,
      { id }: { id: string },
      {
        getRedisCacheClient,
        loaders,
      }: { user: User; getRedisCacheClient: () => Redis; loaders: any },
    ) => {
      if (!mongoose.isValidObjectId(id))
        throw new HttpError("Invalid questionId", 400);

      const cachedQuestion = await getRedisCacheClient().get(`question:${id}`);
      if (cachedQuestion) {
        const parsedCachedQuestion = JSON.parse(cachedQuestion);
        const {
          isActive: _isActive,
          isDeleted: _isDeleted,
          embedding: _embedding,
          topicStatus: _topicStatus,
          moderationStatus: _moderationStatus,
          ...publicQuestion
        } = parsedCachedQuestion;
        return publicQuestion;
      }

      const [question, aiAnswer] = await Promise.all([
        Question.findOne({
          _id: new mongoose.Types.ObjectId(id),
          isActive: true,
          isDeleted: false,
        })
          .select(
            "_id userId title body tags upvoteCount downvoteCount answerCount currentVersion topicStatus moderationStatus isActive isDeleted embedding createdAt",
          )
          .lean(),
        AiAnswer.findOne({
          questionId: new mongoose.Types.ObjectId(id),
          isPublished: true,
        })
          .select("questionVersion body confidence meta")
          .lean(),
      ]);

      if (!question) return null;

      const user = question.userId
        ? await loaders.userLoader.load(question.userId.toString())
        : null;

      const result = {
        id: question._id,
        userId: question.userId,
        title: question.title,
        body: question.body,
        tags: question.tags,
        upvoteCount: question.upvoteCount,
        downvoteCount: question.downvoteCount,
        answerCount: question.answerCount,
        currentVersion: question.currentVersion,
        canGenerateAiAnswer:
          question.topicStatus === "VALID" &&
          ["APPROVED", "REJECTED"].includes(String(question.moderationStatus)),
        createdAt: question.createdAt,
        user: user && !(user as any)?.error ? user : null,
        aiAnswer: aiAnswer
          ? {
              questionVersion: aiAnswer.questionVersion,
              body: aiAnswer.body,
              confidence: {
                overall: aiAnswer.confidence?.overall,
                note: aiAnswer.confidence?.note || null,
                sections: Array.isArray(aiAnswer.confidence?.sections)
                  ? aiAnswer.confidence.sections
                  : [],
              },
              meta: aiAnswer.meta ?? {},
            }
          : null,
      };

      const cachePayload = {
        ...result,
        isActive: question.isActive,
        isDeleted: question.isDeleted,
        embedding: Array.isArray(question.embedding) ? question.embedding : [],
        topicStatus: question.topicStatus,
        moderationStatus: question.moderationStatus,
      };

      await getRedisCacheClient().set(
        `question:${id}`,
        JSON.stringify(cachePayload),
        "EX",
        60 * 15,
      );

      return result;
    },

    loadMoreAnswers: async (
      _: any,
      {
        questionId,
        sortOption = "DEFAULT",
        cursor,
        limitCount = 10,
      }: {
        questionId: string;
        sortOption: "DEFAULT" | "RECENT";
        cursor?: LoadMoreAnswersCursor;
        limitCount: number;
      },
      {
        user,
        loaders,
        getRedisCacheClient,
      }: { user: User; loaders: any; getRedisCacheClient: () => Redis },
    ) => {
      if (!mongoose.isValidObjectId(questionId))
        throw new HttpError("Invalid questionId", 400);

      if (!["DEFAULT", "RECENT"].includes(sortOption))
        throw new HttpError(
          `Invalid sort option. Allowed values: ${["DEFAULT", "RECENT"].join(", ")}`,
          400,
        );

      const normalizedLimitCount =
        Number.isInteger(limitCount) && Number(limitCount) > 0
          ? Number(limitCount)
          : 10;

      const requesterUserId = String(user.id);

      const cursorCacheKey = cursor
        ? [
            cursor.id,
            cursor.ownerPriority ?? "",
            cursor.bestPriority ?? "",
            cursor.acceptedPriority ?? "",
            cursor.upvoteCount ?? "",
          ].join(":")
        : "initial";

      const cachedAnswers = await getRedisCacheClient().get(
        `answers:${questionId}:${sortOption}:${requesterUserId}:${cursorCacheKey}:${normalizedLimitCount}`,
      );
      if (cachedAnswers) return JSON.parse(cachedAnswers);

      const matchStage: Record<string, any> = {
        questionId: new mongoose.Types.ObjectId(questionId),
        isDeleted: false,
        isActive: true,
        $or: [
          { moderationStatus: { $in: ["APPROVED", "FLAGGED"] } },
          { userId: requesterUserId },
        ],
      };

      const pipeline: any[] = [{ $match: matchStage }];

      if (sortOption === "RECENT") {
        if (cursor) {
          if (!mongoose.isValidObjectId(cursor.id))
            throw new HttpError("Invalid cursor", 400);

          pipeline.push({
            $match: { _id: { $lt: new mongoose.Types.ObjectId(cursor.id) } },
          });
        }

        pipeline.push({
          $sort: {
            _id: -1,
          },
        });
      } else {
        pipeline.push({
          $addFields: {
            ownerPriority: {
              $cond: [{ $eq: ["$userId", requesterUserId] }, 0, 1],
            },
            bestPriority: { $cond: ["$isBestAnswerByAsker", 0, 1] },
            acceptedPriority: { $cond: ["$isAccepted", 0, 1] },
          },
        });

        if (cursor) {
          if (
            !mongoose.isValidObjectId(cursor.id) ||
            !Number.isFinite(cursor.ownerPriority) ||
            !Number.isFinite(cursor.bestPriority) ||
            !Number.isFinite(cursor.acceptedPriority) ||
            !Number.isFinite(cursor.upvoteCount)
          )
            throw new HttpError("Invalid cursor", 400);

          const parsedCursor: LoadMoreAnswersDefaultCursor = {
            id: cursor.id,
            ownerPriority: Number(cursor.ownerPriority),
            bestPriority: Number(cursor.bestPriority),
            acceptedPriority: Number(cursor.acceptedPriority),
            upvoteCount: Number(cursor.upvoteCount),
          };

          const cursorObjectId = new mongoose.Types.ObjectId(parsedCursor.id);

          pipeline.push({
            $match: {
              $or: [
                { ownerPriority: { $gt: parsedCursor.ownerPriority } },

                {
                  ownerPriority: parsedCursor.ownerPriority,
                  bestPriority: { $gt: parsedCursor.bestPriority },
                },

                {
                  ownerPriority: parsedCursor.ownerPriority,
                  bestPriority: parsedCursor.bestPriority,
                  acceptedPriority: { $gt: parsedCursor.acceptedPriority },
                },

                {
                  ownerPriority: parsedCursor.ownerPriority,
                  bestPriority: parsedCursor.bestPriority,
                  acceptedPriority: parsedCursor.acceptedPriority,
                  upvoteCount: { $lt: parsedCursor.upvoteCount },
                },

                {
                  ownerPriority: parsedCursor.ownerPriority,
                  bestPriority: parsedCursor.bestPriority,
                  acceptedPriority: parsedCursor.acceptedPriority,
                  upvoteCount: parsedCursor.upvoteCount,
                  _id: { $lt: cursorObjectId },
                },
              ],
            },
          });
        }

        pipeline.push({
          $sort: {
            ownerPriority: 1,
            bestPriority: 1,
            acceptedPriority: 1,
            upvoteCount: -1,
            _id: -1,
          },
        });
      }

      pipeline.push(
        { $limit: normalizedLimitCount },

        {
          $project: {
            id: "$_id",
            _id: 0,
            userId: 1,
            body: 1,
            replyCount: 1,
            isAccepted: 1,
            isBestAnswerByAsker: 1,
            upvoteCount: 1,
            downvoteCount: 1,
            questionVersion: 1,
            createdAt: 1,
            ownerPriority: { $ifNull: ["$ownerPriority", null] },
            bestPriority: { $ifNull: ["$bestPriority", null] },
            acceptedPriority: { $ifNull: ["$acceptedPriority", null] },
          },
        },
      );

      const answers = await Answer.aggregate(pipeline);

      const uniqueUserIds = [...new Set(answers.map((a) => a.userId))];

      const users = await loaders.userLoader.loadMany(uniqueUserIds);

      const userMap = new Map(users.map((u: any) => [u?.id, u]));

      const answersWithUsers = answers.map((a) => ({
        id: a.id,
        userId: a.userId,
        body: a.body,
        replyCount: a.replyCount,
        isAccepted: a.isAccepted,
        isBestAnswerByAsker: a.isBestAnswerByAsker,
        upvoteCount: a.upvoteCount,
        downvoteCount: a.downvoteCount,
        questionVersion: a.questionVersion,
        createdAt: a.createdAt,
        user: userMap.get(a.userId) || null,
      }));

      const result = {
        answers: answersWithUsers,
        nextCursor:
          answersWithUsers.length === normalizedLimitCount
            ? sortOption === "RECENT"
              ? { id: answersWithUsers[answersWithUsers.length - 1].id }
              : ({
                  ownerPriority: answers[answers.length - 1].ownerPriority ?? 1,
                  bestPriority: answers[answers.length - 1].bestPriority ?? 1,
                  acceptedPriority:
                    answers[answers.length - 1].acceptedPriority ?? 1,
                  upvoteCount: answers[answers.length - 1].upvoteCount,
                  id: answers[answers.length - 1].id,
                } as LoadMoreAnswersDefaultCursor)
            : null,
        hasMore: answersWithUsers.length === normalizedLimitCount,
      };

      await getRedisCacheClient().set(
        `answers:${questionId}:${sortOption}:${requesterUserId}:${cursorCacheKey}:${normalizedLimitCount}`,
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
      }: {
        answerId: string;
        cursor?: LoadMoreRepliesCursor;
        limitCount: number;
      },
      {
        user,
        loaders,
        getRedisCacheClient,
      }: { user: User; loaders: any; getRedisCacheClient: () => Redis },
    ) => {
      if (!mongoose.isValidObjectId(answerId))
        throw new HttpError("Invalid answerId", 400);

      const normalizedLimitCount =
        Number.isInteger(limitCount) && Number(limitCount) > 0
          ? Number(limitCount)
          : 10;

      const requesterUserId = String(user.id);
      const cursorCacheKey = cursor
        ? `${cursor.id}:${cursor.upvoteCount}`
        : "initial";

      const cachedReplies = await getRedisCacheClient().get(
        `replies:${answerId}:${requesterUserId}:${cursorCacheKey}:${normalizedLimitCount}`,
      );

      if (cachedReplies) return JSON.parse(cachedReplies);

      const matchStage: any = {
        answerId: new mongoose.Types.ObjectId(answerId),
        isDeleted: false,
        isActive: true,
        $or: [
          { moderationStatus: { $in: ["APPROVED", "FLAGGED"] } },
          { userId: requesterUserId },
        ],
      };

      const pipeline: any[] = [{ $match: matchStage }];

      if (cursor) {
        if (
          !mongoose.isValidObjectId(cursor.id) ||
          !Number.isFinite(cursor.upvoteCount)
        )
          throw new HttpError("Invalid cursor", 400);

        pipeline.push({
          $match: {
            $or: [
              {
                upvoteCount: { $lt: cursor.upvoteCount },
              },

              {
                upvoteCount: cursor.upvoteCount,
                _id: { $lt: new mongoose.Types.ObjectId(cursor.id) },
              },
            ],
          },
        });
      }

      pipeline.push({
        $sort: {
          upvoteCount: -1,
          _id: -1,
        },
      });

      pipeline.push(
        { $limit: normalizedLimitCount },

        {
          $project: {
            id: "$_id",
            _id: 0,
            userId: 1,
            body: 1,
            upvoteCount: 1,
            downvoteCount: 1,
            createdAt: 1,
          },
        },
      );

      const replies = await Reply.aggregate(pipeline);

      const uniqueUserIds = [...new Set(replies.map((a) => a.userId))];

      const users = await loaders.userLoader.loadMany(uniqueUserIds);

      const userMap = new Map(users.map((u: any) => [u?.id, u]));

      const repliesWithUsers = replies.map((r) => ({
        ...r,
        user: userMap.get(r.userId) || null,
      }));

      const result = {
        replies: repliesWithUsers,
        nextCursor:
          repliesWithUsers.length === normalizedLimitCount
            ? {
                id: repliesWithUsers[repliesWithUsers.length - 1].id,
                upvoteCount:
                  repliesWithUsers[repliesWithUsers.length - 1].upvoteCount,
              }
            : null,
        hasMore: repliesWithUsers.length === normalizedLimitCount,
      };

      await getRedisCacheClient().set(
        `replies:${answerId}:${requesterUserId}:${cursorCacheKey}:${normalizedLimitCount}`,
        JSON.stringify(result),
        "EX",
        5 * 60,
      );

      return result;
    },

    searchSuggestions: async (
      _: any,
      {
        searchKeyword,
        limitCount = 10,
      }: { searchKeyword: string; limitCount: number },
      { getRedisCacheClient }: { getRedisCacheClient: () => Redis },
    ) => {
      const normalizedKeyword = String(searchKeyword || "").trim();
      if (!normalizedKeyword) return [];

      const normalizedLimitCount =
        Number.isInteger(limitCount) && Number(limitCount) > 0
          ? Math.min(Number(limitCount), 20)
          : 10;

      const cachedSuggestions = await getRedisCacheClient().get(
        `searchSuggestions:${normalizedKeyword}:${normalizedLimitCount}`,
      );

      if (cachedSuggestions) return JSON.parse(cachedSuggestions);

      const results = await Question.aggregate([
        {
          $search: {
            index: "questions_autocomplete",
            autocomplete: {
              query: normalizedKeyword,
              path: "title",
              fuzzy: { maxEdits: 1 },
            },
          },
        },

        {
          $match: {
            topicStatus: "VALID",
            isDeleted: false,
            isActive: true,
          },
        },
        
        {
          $group: {
            _id: "$title",
            title: { $first: "$title" },
          },
        },

        { $limit: normalizedLimitCount },

        { $project: { id: "$_id", _id: 0, title: 1 } },
      ]);

      const suggestions = results.map((r) => r.title);

      await getRedisCacheClient().set(
        `searchSuggestions:${normalizedKeyword}:${normalizedLimitCount}`,
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
        sortOption: "LATEST" | "RELEVANT";
        cursor?: SearchQuestionsCursor;
      },
      {
        getRedisCacheClient,
        loaders,
      }: { getRedisCacheClient: () => Redis; loaders: any },
    ) => {
      if (!["LATEST", "RELEVANT"].includes(sortOption))
        throw new HttpError(
          `Invalid sort option. Allowed values: ${["LATEST", "RELEVANT"].join(", ")}`,
          400,
        );

      const normalizedSearchKeyword = String(searchKeyword || "").trim();
      if (!normalizedSearchKeyword) {
        return { questions: [], nextCursor: null, hasMore: false };
      }

      const normalizedLimitCount =
        Number.isInteger(limitCount) && Number(limitCount) > 0
          ? Number(limitCount)
          : 10;

      const invalidTags = tags.filter((tag) => !isInterest(tag));

      if (invalidTags.length > 0)
        throw new HttpError(`Invalid tags: ${invalidTags.join(", ")}`, 400);

      const sortedTags = [...tags].sort().join(", ");

      const cursorCacheKey = cursor
        ? [
            cursor.id,
            cursor.createdAt ?? "",
            cursor.searchScore ?? "",
            cursor.upvoteCount ?? "",
          ].join(":")
        : "initial";

      const cachedQuestions = await getRedisCacheClient().get(
        `searchQuestions:${normalizedSearchKeyword}:${sortedTags}:${sortOption}:${cursorCacheKey}:${normalizedLimitCount}`,
      );

      if (cachedQuestions) return JSON.parse(cachedQuestions);

      const searchStage: SearchQuestionStage = {
        $search: {
          index: "search_index",
          compound: {
            must: [
              {
                text: {
                  query: normalizedSearchKeyword,
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
        topicStatus: "VALID",
        moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
      };

      const pipeline: any[] = [searchStage];

      if (sortOption === "RELEVANT") {
        pipeline.push({
          $addFields: {
            searchScore: { $ifNull: [{ $meta: "searchScore" }, 0] },
          },
        });
      }

      pipeline.push({ $match: matchStage });

      if (cursor) {
        if (!mongoose.isValidObjectId(cursor.id))
          throw new HttpError("Invalid cursor", 400);

        const cursorObjectId = new mongoose.Types.ObjectId(cursor.id);

        if (sortOption === "LATEST") {
          const cursorCreatedAt = cursor.createdAt
            ? new Date(cursor.createdAt)
            : null;

          if (!cursorCreatedAt || Number.isNaN(cursorCreatedAt.getTime()))
            throw new HttpError("Invalid cursor", 400);

          pipeline.push({
            $match: {
              $or: [
                { createdAt: { $lt: cursorCreatedAt } },
                { createdAt: cursorCreatedAt, _id: { $lt: cursorObjectId } },
              ],
            },
          });
        } else {
          if (
            !Number.isFinite(cursor.searchScore) ||
            !Number.isFinite(cursor.upvoteCount)
          )
            throw new HttpError("Invalid cursor", 400);

          pipeline.push({
            $match: {
              $or: [
                { searchScore: { $lt: cursor.searchScore } },

                {
                  searchScore: cursor.searchScore,
                  upvoteCount: { $lt: cursor.upvoteCount },
                },
                
                {
                  searchScore: cursor.searchScore,
                  upvoteCount: cursor.upvoteCount,
                  _id: { $lt: cursorObjectId },
                },
              ],
            },
          });
        }
      }

      pipeline.push(
        {
          $sort:
            sortOption === "LATEST"
              ? { createdAt: -1, _id: -1 }
              : { searchScore: -1, upvoteCount: -1, _id: -1 },
        },

        { $limit: normalizedLimitCount },

        {
          $project: {
            id: "$_id",
            _id: 0,
            title: 1,
            body: 1,
            tags: 1,
            userId: 1,
            upvoteCount: 1,
            downvoteCount: 1,
            answerCount: 1,
            currentVersion: 1,
            createdAt: 1,
            searchScore: { $ifNull: ["$searchScore", null] },
          },
        },
      );

      const questions = await Question.aggregate(pipeline);

      const uniqueUserIds = [...new Set(questions.map((q) => q.userId))];

      const users = await loaders.userLoader.loadMany(uniqueUserIds);

      const userMap = new Map(users.map((u: any) => [u?.id, u]));

      const questionsWithUsers = questions.map((q) => ({
        ...q,
        user: userMap.get(q.userId) || null,
      }));

      const result = {
        questions: questionsWithUsers,
        nextCursor:
          questionsWithUsers.length === normalizedLimitCount
            ? sortOption === "LATEST"
              ? {
                  id: questionsWithUsers[questionsWithUsers.length - 1].id,
                  createdAt:
                    questionsWithUsers[questionsWithUsers.length - 1].createdAt,
                }
              : {
                  id: questionsWithUsers[questionsWithUsers.length - 1].id,
                  searchScore:
                    questionsWithUsers[questionsWithUsers.length - 1]
                      .searchScore,
                  upvoteCount:
                    questionsWithUsers[questionsWithUsers.length - 1]
                      .upvoteCount,
                }
            : null,
        hasMore: questionsWithUsers.length === normalizedLimitCount,
      };

      await getRedisCacheClient().set(
        `searchQuestions:${normalizedSearchKeyword}:${sortedTags}:${sortOption}:${cursorCacheKey}:${normalizedLimitCount}`,
        JSON.stringify(result),
        "EX",
        60 * 15,
      );

      return result;
    },

    versionHistory: async (
      _: any,
      {
        questionId,
        cursor,
        limitCount = 10,
      }: { questionId: string; cursor?: VersionHistoryCursor; limitCount: number },
      {
        getRedisCacheClient,
        loaders,
      }: { getRedisCacheClient: () => Redis; loaders: any },
    ) => {
      if (!mongoose.isValidObjectId(questionId))
        throw new HttpError("Invalid questionId", 400);

      const normalizedLimitCount =
        Number.isInteger(limitCount) && Number(limitCount) > 0
          ? Number(limitCount)
          : 10;
      const cursorCacheKey = cursor ? cursor.id : "initial";

      const cachedVersionHistory = await getRedisCacheClient().get(
        `v:question:${questionId}:${cursorCacheKey}:${normalizedLimitCount}`,
      );

      if (cachedVersionHistory) return JSON.parse(cachedVersionHistory);

      const matchStage: any = {
        questionId: new mongoose.Types.ObjectId(questionId),
      };

      if (cursor) {
        if (!mongoose.isValidObjectId(cursor.id))
          throw new HttpError("Invalid cursor", 400);

        matchStage._id = { $lt: new mongoose.Types.ObjectId(cursor.id) };
      }

      const foundVersionHistory = await QuestionVersion.aggregate([
        { $match: matchStage },

        { $sort: { _id: -1 } },

        { $limit: normalizedLimitCount },

        {
          $project: {
            id: "$_id",
            _id: 0,
            questionId: 1,
            userId: 1,
            title: 1,
            body: 1,
            tags: 1,
            topicStatus: 1,
            moderationStatus: 1,
            supersededByRollback: 1,
            version: 1,
            basedOnVersion: 1,
            isActive: 1,
          },
        },
      ]);

      const uniqueUserIds = [
        ...new Set(foundVersionHistory.map((v) => v.userId)),
      ];

      const users = await loaders.userLoader.loadMany(uniqueUserIds);

      const userMap = new Map(users.map((u: any) => [u?.id, u]));

      const versionHistoryWithUser = foundVersionHistory.map((v) => {
        if (v.userId) {
          return { ...v, user: userMap.get(v.userId) || null };
        } else {
          return { ...v, user: null };
        }
      });

      const result = {
        questionVersions: versionHistoryWithUser,
        nextCursor:
          versionHistoryWithUser.length === normalizedLimitCount
            ? { id: versionHistoryWithUser[versionHistoryWithUser.length - 1].id }
            : null,
        hasMore: versionHistoryWithUser.length === normalizedLimitCount,
      };

      await getRedisCacheClient().set(
        `v:question:${questionId}:${cursorCacheKey}:${normalizedLimitCount}`,
        JSON.stringify(result),
        "EX",
        60 * 60,
      );

      return result;
    },

    getQuestionVersion: async (
      _: any,
      { questionId, version }: { questionId: string; version: number },
      {
        getRedisCacheClient,
        loaders,
      }: { getRedisCacheClient: () => Redis; loaders: any },
    ) => {
      const cachedVersion = await getRedisCacheClient().get(
        `v:${version}:question:${questionId}`,
      );

      if (cachedVersion) return JSON.parse(cachedVersion);

      const foundVersion = await QuestionVersion.findOne({
        questionId: new mongoose.Types.ObjectId(questionId),
        version,
      }).lean();

      if (!foundVersion) throw new HttpError("Version not found", 404);

      let user = null;

      if (foundVersion.userId) {
        user = await loaders.userLoader.load(foundVersion.userId);
        if (!user) user = null;
      }

      const result = {
        ...foundVersion,
        id: foundVersion._id,
        user,
      };

      await getRedisCacheClient().set(
        `v:${version}:question:${questionId}`,
        JSON.stringify(result),
        "EX",
        60 * 60,
      );

      return result;
    },
  },
};

export default questionResolver;
