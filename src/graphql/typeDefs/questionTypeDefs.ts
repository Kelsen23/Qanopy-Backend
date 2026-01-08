import { gql } from "graphql-tag";

const questionTypeDefs = gql`
  type Question {
    id: ID!
    userId: String!
    title: String!
    body: String!
    upvotes: Int!
    downvotes: Int!
    tags: [String]!
    answerCount: Int!
    currentVersion: Int!
    isDeleted: Boolean!
    isActive: Boolean!
    createdAt: String!
    user: User!
  }

  type Reply {
    id: ID!
    userId: String!
    body: String!
    upvotes: Int!
    downvotes: Int!
    isActive: Boolean!
    isDeleted: Boolean!
    createdAt: String!
    user: User!
  }

  type Answer {
    id: ID!
    userId: String!
    body: String!
    upvotes: Int!
    downvotes: Int!
    replyCount: Int!
    replies: [Reply!]!
    isAccepted: Boolean!
    isBestAnswerByAsker: Boolean!
    questionVersion: Int!
    isActive: Boolean!
    isDeleted: Boolean!
    createdAt: String!
    user: User!
  }

  type QuestionDetails {
    id: ID!
    userId: String!
    title: String!
    body: String!
    tags: [String]!
    upvotes: Int!
    downvotes: Int!
    answerCount: Int!
    topAnswer: Answer
    currentVersion: Int!
    isActive: Boolean!
    isDeleted: Boolean!
    createdAt: String!
    user: User!
  }

  type QuestionConnection {
    questions: [Question!]!
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

  enum EditedBy {
    USER
    AI
  }

  type QuestionVersion {
    id: ID!
    questionId: ID!
    title: String!
    body: String!
    tags: [String]!
    editedBy: EditedBy!
    editorId: ID
    supersededByRollback: Boolean!
    version: Int!
    basedOnVersion: Int!
    isActive: Boolean!
  }

  type QuestionVersionConnection {
    questionVersions: [QuestionVersion!]!
    nextCursor: String
    hasMore: Boolean!
  }

  type Query {
    getRecommendedQuestions(
      cursor: String
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
    ): QuestionConnection!

    getVersionHistory(questionId: String! cursor: ID limitCount: Int): QuestionVersionConnection!
  }
`;

export default questionTypeDefs;
