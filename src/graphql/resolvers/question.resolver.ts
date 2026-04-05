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
        topAnswerId,
        cursor,
        limitCount = 10,
      }: {
        questionId: string;
        topAnswerId: string;
        cursor?: string;
        limitCount: number;
      },
      {
        loaders,
        getRedisCacheClient,
      }: { loaders: any; getRedisCacheClient: () => Redis },
    ) => {
      const cachedAnswers = await getRedisCacheClient().get(
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
            upvoteCount: 1,
            downvoteCount: 1,
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

      const answersWithUsers = answers.map((a) => ({
        ...a,
        user: userMap.get(a.userId) || null,
      }));

      const result = {
        answers: answersWithUsers,
        nextCursor:
          answersWithUsers.length === limitCount
            ? answersWithUsers[answersWithUsers.length - 1].id
            : null,
        hasMore: answersWithUsers.length === limitCount,
      };

      await getRedisCacheClient().set(
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
      {
        loaders,
        getRedisCacheClient,
      }: { loaders: any; getRedisCacheClient: () => Redis },
    ) => {
      const cachedReplies = await getRedisCacheClient().get(
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
            upvoteCount: 1,
            downvoteCount: 1,
            isActive: 1,
            isDeleted: 1,
            createdAt: 1,
          },
        },
      ]);

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
          repliesWithUsers.length === limitCount
            ? repliesWithUsers[repliesWithUsers.length - 1].id
            : null,
        hasMore: repliesWithUsers.length === limitCount,
      };

      await getRedisCacheClient().set(
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
      { getRedisCacheClient }: { getRedisCacheClient: () => Redis },
    ) => {
      const cachedSuggestions = await getRedisCacheClient().get(
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

        { $limit: limitCount },

        { $project: { id: "$_id", _id: 0, title: 1 } },
      ]);

      const suggestions = results.map((r) => r.title);

      await getRedisCacheClient().set(
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
      {
        getRedisCacheClient,
        loaders,
      }: { getRedisCacheClient: () => Redis; loaders: any },
    ) => {
      if (!["LATEST", "TOP"].includes(sortOption))
        throw new HttpError(
          `Invalid sort option. Allowed values: ${["LATEST", "TOP"].join(", ")}`,
          400,
        );

      const invalidTags = tags.filter((tag) => !isInterest(tag));

      if (invalidTags.length > 0)
        throw new HttpError(`Invalid tags: ${invalidTags.join(", ")}`, 400);

      const cachedQuestions = await getRedisCacheClient().get(
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
        topicStatus: "VALID",
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
            upvoteCount: 1,
            downvoteCount: 1,
            answerCount: 1,
            currentVersion: 1,
            topicStatus: 1,
            moderationStatus: 1,
            isDeleted: 1,
            isActive: 1,
            createdAt: 1,
          },
        },
      ]);

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
          questionsWithUsers.length === limitCount
            ? questionsWithUsers[questionsWithUsers.length - 1].id
            : null,
        hasMore: questionsWithUsers.length === limitCount,
      };

      await getRedisCacheClient().set(
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
      {
        getRedisCacheClient,
        loaders,
      }: { getRedisCacheClient: () => Redis; loaders: any },
    ) => {
      const cachedVersionHistory = await getRedisCacheClient().get(
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
          versionHistoryWithUser.length === limitCount
            ? versionHistoryWithUser[versionHistoryWithUser.length - 1].id
            : null,
        hasMore: versionHistoryWithUser.length === limitCount,
      };

      await getRedisCacheClient().set(
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
