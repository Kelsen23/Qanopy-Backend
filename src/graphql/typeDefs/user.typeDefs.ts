import { gql } from "graphql-tag";

const userTypeDefs = gql`
  type Achievement {
    id: String!
    userId: String!
    name: String!
    description: String!
    createdAt: String!
  }

  type User {
    id: String!
    username: String!
    email: String!
    profilePictureKey: String
    profilePictureUrl: String
    bio: String
    reputationPoints: Int!
    role: Role!
    questionsAsked: Int!
    answersGiven: Int!
    bestAnswers: Int!
    achievements: [Achievement!]!
    status: String!
    isVerified: Boolean!
    createdAt: String!
  }

  type Notification {
    id: String!

    recipientId: String!
    actorId: String
    actor: User

    event: NotificationEvent!

    target: NotificationTarget!

    meta: JSON!

    seen: Boolean!

    createdAt: String!
    updatedAt: String!
  }

  type NotificationTarget {
    entityType: NotificationEntityType!
    entityId: String!
    parentId: String
  }

  # Connections

  type NotificationConnection {
    notifications: [Notification!]!
    nextCursor: NotificationCursor
    hasMore: Boolean!
    unreadCount: Int!
  }

  # Enums

  enum Role {
    ADMIN
    MOD
    USER
  }

  enum NotificationEvent {
    UPVOTE
    DOWNVOTE

    ANSWER_CREATED
    REPLY_CREATED

    ANSWER_ACCEPTED
    ANSWER_MARKED_BEST

    AI_SUGGESTION_UNLOCKED
    AI_ANSWER_UNLOCKED

    SIMILAR_QUESTIONS_READY
    AI_SUGGESTION_READY
    AI_ANSWER_READY

    WARN
    STRIKE
    REPORT_UPDATE
    REMOVE_CONTENT
  }

  enum NotificationEntityType {
    QUESTION
    ANSWER
    REPLY
    AI_ANSWER_FEEDBACK
    REPORT
    USER
  }

  # Cursor Outputs

  type NotificationCursor {
    id: String!
    createdAt: String!
  }

  # Cursor Inputs

  input NotificationCursorInput {
    id: String!
    createdAt: String!
  }

  extend type Query {
    user(id: String!): User

    notifications(
      cursor: NotificationCursorInput
      limitCount: Int
    ): NotificationConnection
  }
`;

export default userTypeDefs;
