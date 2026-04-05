import { gql } from "graphql-tag";

const questionTypeDefs = gql`
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

  type RecommendedQuestionsCursor {
    id: String!
    upvoteCount: Int!
    searchScore: Float!
  }

  input RecommendedQuestionsCursorInput {
    id: String!
    upvoteCount: Int!
    searchScore: Float!
  }

  type QuestionConnection {
    questions: [Question!]!
    nextCursor: RecommendedQuestionsCursor
    hasMore: Boolean!
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
    replies: [Reply!]!
    isAccepted: Boolean!
    isBestAnswerByAsker: Boolean!
    questionVersion: Int!
    isActive: Boolean!
    isDeleted: Boolean!
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
    topAnswer: Answer
    currentVersion: Int!
    topicStatus: String!
    moderationStatus: String!
    isActive: Boolean!
    isDeleted: Boolean!
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

  type SearchQuestionConnection {
    questions: [SearchQuestion!]!
    nextCursor: String
    hasMore: Boolean!
  }

  type AnswerConnection {
    answers: [Answer!]!
    nextCursor: String
    hasMore: Boolean!
  }

  type ReplyConnection {
    replies: [Reply!]!
    nextCursor: String
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

  type Query {
    recommendedQuestions(
      cursor: RecommendedQuestionsCursorInput
      limitCount: Int
    ): QuestionConnection!

    getQuestionById(id: ID!): QuestionDetails!

    loadMoreAnswers(
      questionId: ID!
      topAnswerId: ID
      cursor: String
      limitCount: Int
    ): AnswerConnection!

    loadMoreReplies(
      answerId: ID!
      cursor: String
      limitCount: Int
    ): ReplyConnection!

    getSearchSuggestions(searchKeyword: String!, limitCount: Int): [String!]!

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
