import { gql } from "graphql-tag";

const questionTypeDefs = gql`
  scalar JSON

  type Question {
    id: ID!
    searchScore: Float!
    userId: String!
    title: String!
    upvoteCount: Int!
    downvoteCount: Int!
    tags: [String]!
    answerCount: Int!
    currentVersion: Int!
    createdAt: String!
    user: User
  }

  type QuestionDetails {
    id: ID!
    userId: String!
    title: String!
    body: String!
    tags: [String]!
    upvoteCount: Int!
    downvoteCount: Int!
    answerCount: Int!
    currentVersion: Int!
    canGenerateAiAnswer: Boolean!
    createdAt: String!
    user: User
    aiAnswer: QuestionAiAnswer
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
  }

  type Reply {
    id: ID!
    userId: String!
    body: String!
    upvoteCount: Int!
    downvoteCount: Int!
    isActive: Boolean!
    isDeleted: Boolean!
    createdAt: String!
    user: User
  }

  type Answer {
    id: ID!
    userId: String!
    body: String!
    upvoteCount: Int!
    downvoteCount: Int!
    replyCount: Int!
    isAccepted: Boolean!
    isBestAnswerByAsker: Boolean!
    questionVersion: Int!
    createdAt: String!
    user: User
  }

  type SearchQuestion {
    id: ID!
    userId: String!
    title: String!
    body: String!
    upvoteCount: Int!
    downvoteCount: Int!
    tags: [String]!
    answerCount: Int!
    currentVersion: Int!
    topicStatus: String!
    moderationStatus: String!
    isDeleted: Boolean!
    isActive: Boolean!
    createdAt: String!
    user: User
  }

  type RecommendedQuestionsCursor {
    id: String!
    upvoteCount: Int!
    searchScore: Float!
  }

  type QuestionConnection {
    questions: [Question!]!
    nextCursor: RecommendedQuestionsCursor
    hasMore: Boolean!
  }

  type SearchQuestionConnection {
    questions: [SearchQuestion!]!
    nextCursor: String
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

  type QuestionVersion {
    id: ID!
    questionId: ID!
    userId: ID!
    title: String!
    body: String!
    tags: [String]!
    topicStatus: String!
    moderationStatus: String!
    supersededByRollback: Boolean!
    version: Int!
    basedOnVersion: Int!
    isActive: Boolean!
    user: User
  }

  type QuestionVersionConnection {
    questionVersions: [QuestionVersion!]!
    nextCursor: String
    hasMore: Boolean!
  }

  enum AnswerSortOption {
    DEFAULT
    RECENT
  }

  type ReplyCursor {
    id: String!
    upvoteCount: Int!
  }

  type AnswerCursor {
    id: String!
    ownerPriority: Int
    bestPriority: Int
    acceptedPriority: Int
    upvoteCount: Int
  }

  input RepliesCursorInput {
    id: String!
    upvoteCount: Int!
  }

  input AnswerCursorInput {
    id: String!
    ownerPriority: Int
    bestPriority: Int
    acceptedPriority: Int
    upvoteCount: Int
  }

  input RecommendedQuestionsCursorInput {
    id: String!
    upvoteCount: Int!
    searchScore: Float!
  }

  extend type Query {
    recommendedQuestions(
      cursor: RecommendedQuestionsCursorInput
      limitCount: Int
    ): QuestionConnection!

    question(id: ID!): QuestionDetails

    loadMoreAnswers(
      questionId: ID!
      sortOption: AnswerSortOption!
      cursor: AnswerCursorInput
      limitCount: Int
    ): AnswerConnection!

    loadMoreReplies(
      answerId: ID!
      cursor: RepliesCursorInput
      limitCount: Int
    ): ReplyConnection!

    searchSuggestions(searchKeyword: String!, limitCount: Int): [String!]!

    searchQuestions(
      searchKeyword: String!
      tags: [String]!
      sortOption: String!
      cursor: String
      limitCount: Int
    ): SearchQuestionConnection!

    getVersionHistory(
      questionId: String!
      cursor: ID
      limitCount: Int
    ): QuestionVersionConnection!
    getQuestionVersion(questionId: String!, version: Int!): QuestionVersion!
  }
`;

export default questionTypeDefs;
