import { gql } from "graphql-tag";

const questionTypeDefs = gql`
  scalar JSON

  type Question {
    id: String!
    userId: String!
    title: String!
    body: String
    tags: [String]!

    upvoteCount: Int!
    downvoteCount: Int!

    answerCount: Int!
    acceptedAnswerCount: Int

    currentVersion: Int!

    createdAt: String!
    updatedAt: String

    user: User

    searchScore: Float

    canGenerateAiSuggestion: Boolean
    canGenerateAiAnswer: Boolean

    aiAnswer: QuestionAiAnswer
  }

  type QuestionVersion {
    id: String!
    questionId: String!
    userId: String!
    title: String!
    body: String!
    tags: [String]!

    supersededByRollback: Boolean!
    version: Int!
    basedOnVersion: Int!
    isActive: Boolean!

    user: User
  }

  type Answer {
    id: String!
    userId: String!
    body: String!

    upvoteCount: Int!
    downvoteCount: Int!
    replyCount: Int!

    isAccepted: Boolean!
    isBestAnswerByAsker: Boolean!

    questionVersion: Int!

    createdAt: String!
    updatedAt: String

    user: User
  }

  type Reply {
    id: String!
    userId: String!
    body: String!

    upvoteCount: Int!
    downvoteCount: Int!

    createdAt: String!
    updatedAt: String

    user: User
  }

  type QuestionAiAnswerConfidenceSection {
    sectionName: String!
    confidence: Float
    note: String
  }

  type QuestionAiAnswerConfidence {
    overall: Float!
    note: String
    sections: [QuestionAiAnswerConfidenceSection!]!
  }

  type QuestionAiAnswer {
    questionVersion: Int!
    body: String!
    confidence: QuestionAiAnswerConfidence!
    meta: JSON!
    isPublished: Boolean
  }

  type AiAnswerFeedback {
    id: String!
    aiAnswerId: String!
    userId: String!

    type: AiAnswerFeedbackType!

    body: String

    questionVersionAtFeedback: Int!

    createdAt: String!
    updatedAt: String
  }

  # Connections

  type RecommendedQuestionConnection {
    questions: [Question!]!
    nextCursor: RecommendedQuestionsCursor
    hasMore: Boolean!
  }

  type AnswerConnection {
    answers: [Answer!]!
    nextCursor: AnswerCursor
    hasMore: Boolean!
  }

  type ReplyConnection {
    replies: [Reply!]!
    nextCursor: ReplyCursor
    hasMore: Boolean!
  }

  type SearchQuestionConnection {
    questions: [Question!]!
    nextCursor: SearchQuestionCursor
    hasMore: Boolean!
  }

  type QuestionVersionConnection {
    questionVersions: [QuestionVersion!]!
    nextCursor: VersionHistoryCursor
    hasMore: Boolean!
  }

  type UserQuestionsConnection {
    questions: [Question!]!
    nextCursor: UserQuestionsCursor
    hasMore: Boolean!
  }

  type UserAnswersConnection {
    answers: [Answer!]!
    nextCursor: UserAnswersCursor
    hasMore: Boolean!
  }

  type RecentQuestionsNeedingHelpConnection {
    questions: [Question!]!
    nextCursor: RecentQuestionsNeedingHelpCursor
    hasMore: Boolean!
  }

  type UnansweredQuestionsByUserConnection {
    questions: [Question!]!
    nextCursor: UnansweredQuestionsByUserCursor
    hasMore: Boolean!
  }

  type AiAnswersConnection {
    aiAnswers: [QuestionAiAnswer!]!
    nextCursor: AiAnswersCursor
    hasMore: Boolean!
  }

  type FeedbacksOnAiAnswerConnection {
    feedbacks: [AiAnswerFeedback!]!
    nextCursor: FeedbacksOnAiAnswerCursor
    hasMore: Boolean!
  }

  # Enums

  enum AnswerSortOption {
    DEFAULT
    RECENT
  }

  enum SearchQuestionSortOption {
    LATEST
    RELEVANT
  }

  enum UserQuestionsSortOption {
    LAST_UPDATED
    OLDEST
    NEWEST
    MOST_UPVOTED
  }

  enum UserAnswersSortOption {
    LAST_ACTIVE
    NEWEST
    OLDEST
    RELEVANT
  }

  enum AiAnswersSortOption {
    NEWEST
    OLDEST
  }

  enum FeedbacksOnAiAnswerSortOption {
    NEWEST
    OLDEST
  }

  enum AiAnswerFeedbackType {
    HELPFUL
    NOT_HELPFUL
  }

  # Cursor Outputs

  type RecommendedQuestionsCursor {
    id: String!
    upvoteCount: Int!
    searchScore: Float!
  }

  type AnswerCursor {
    id: String!
    ownerPriority: Int
    bestPriority: Int
    acceptedPriority: Int
    upvoteCount: Int
  }

  type ReplyCursor {
    id: String!
    upvoteCount: Int!
  }

  type VersionHistoryCursor {
    id: String!
  }

  type SearchQuestionCursor {
    id: String!
    createdAt: String
    searchScore: Float
    upvoteCount: Int
  }

  type UserQuestionsCursor {
    id: String!
    createdAt: String
    updatedAt: String
    upvoteCount: Int
  }

  type UserAnswersCursor {
    id: String!
    createdAt: String
    updatedAt: String
    bestPriority: Int
    acceptedPriority: Int
    upvoteCount: Int
  }

  type RecentQuestionsNeedingHelpCursor {
    id: String!
  }

  type UnansweredQuestionsByUserCursor {
    id: String!
  }

  type AiAnswersCursor {
    id: String!
    createdAt: String!
    publishedPriority: Int!
  }

  type FeedbacksOnAiAnswerCursor {
    id: String!
    createdAt: String!
    publishedPriority: Int!
  }

  # Cursor Inputs

  input RecommendedQuestionsCursorInput {
    id: String!
    upvoteCount: Int!
    searchScore: Float!
  }

  input AnswerCursorInput {
    id: String!
    ownerPriority: Int
    bestPriority: Int
    acceptedPriority: Int
    upvoteCount: Int
  }

  input ReplyCursorInput {
    id: String!
    upvoteCount: Int!
  }

  input SearchQuestionCursorInput {
    id: String!
    createdAt: String
    searchScore: Float
    upvoteCount: Int
  }

  input VersionHistoryCursorInput {
    id: String!
  }

  input UserQuestionsCursorInput {
    id: String!
    createdAt: String
    updatedAt: String
    upvoteCount: Int
  }

  input UserAnswersCursorInput {
    id: String!
    createdAt: String
    updatedAt: String
    bestPriority: Int
    acceptedPriority: Int
    upvoteCount: Int
  }

  input RecentQuestionsNeedingHelpCursorInput {
    id: String!
  }

  input UnansweredQuestionsByUserCursorInput {
    id: String!
  }

  input AiAnswersCursorInput {
    id: String!
    createdAt: String!
    publishedPriority: Int!
  }

  input FeedbacksOnAiAnswerCursorInput {
    id: String!
    createdAt: String!
    publishedPriority: Int!
  }

  extend type Query {
    recommendedQuestions(
      cursor: RecommendedQuestionsCursorInput
      limitCount: Int
    ): RecommendedQuestionConnection!

    question(id: String!): Question

    answer(id: String!): Answer

    reply(id: String!): Reply

    loadMoreAnswers(
      questionId: String!
      sortOption: AnswerSortOption!
      cursor: AnswerCursorInput
      limitCount: Int
    ): AnswerConnection!

    loadMoreReplies(
      answerId: String!
      cursor: ReplyCursorInput
      limitCount: Int
    ): ReplyConnection!

    searchSuggestions(searchKeyword: String!, limitCount: Int): [String!]!

    searchQuestions(
      searchKeyword: String!
      tags: [String]!
      sortOption: SearchQuestionSortOption!
      cursor: SearchQuestionCursorInput
      limitCount: Int
    ): SearchQuestionConnection!

    versionHistory(
      questionId: String!
      cursor: VersionHistoryCursorInput
      limitCount: Int
    ): QuestionVersionConnection!
    questionVersion(questionId: String!, version: Int!): QuestionVersion!

    userQuestions(
      userId: String!
      sortOption: UserQuestionsSortOption!
      cursor: UserQuestionsCursorInput
      limitCount: Int
    ): UserQuestionsConnection!

    userAnswers(
      userId: String!
      sortOption: UserAnswersSortOption!
      cursor: UserAnswersCursorInput
      limitCount: Int
    ): UserAnswersConnection!

    recentQuestionsNeedingHelp(
      userId: String!
      cursor: RecentQuestionsNeedingHelpCursorInput
      limitCount: Int
    ): RecentQuestionsNeedingHelpConnection!

    unansweredQuestionsByUser(
      userId: String!
      cursor: UnansweredQuestionsByUserCursorInput
      limitCount: Int
    ): UnansweredQuestionsByUserConnection

    aiAnswers(
      questionId: String!
      sortOption: AiAnswersSortOption!
      cursor: AiAnswersCursorInput
      limitCount: Int
    ): AiAnswersConnection

    feedbacksOnAiAnswer(
      aiAnswerId: String!
      sortOption: FeedbacksOnAiAnswerSortOption!
      cursor: FeedbacksOnAiAnswerCursorInput
      limitCount: Int
    ): FeedbacksOnAiAnswerConnection
  }
`;

export default questionTypeDefs;
