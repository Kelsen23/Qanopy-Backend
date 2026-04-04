import { gql } from "graphql-tag";

const moderationTypeDefs = gql`
  enum ReportTargetType {
    QUESTION
    ANSWER
    REPLY
    AI_ANSWER_FEEDBACK
  }

  enum StrikeTargetType {
    QUESTION
    ANSWER
    REPLY
    AI_ANSWER_FEEDBACK
  }

  enum ReportReason {
    SPAM
    HARASSMENT
    HATE_SPEECH
    INAPPROPRIATE_CONTENT
    MISINFORMATION
    OTHER
  }

  enum ReportStatus {
    PENDING
    REVIEWING
    RESOLVED
    DISMISSED
  }

  enum ReportActionTaken {
    PENDING
    BAN_TEMP
    BAN_PERM
    WARN
    IGNORE
  }

  enum Mods {
    ADMIN_MODERATION
    AI_MODERATION
  }

  enum AiDecision {
    BAN_PERM
    BAN_TEMP
    WARN
    IGNORE
  }

  enum StrikeFilter {
    AI
    ADMIN
    ALL
  }

  type Report {
    id: ID!

    reportedBy: ID!
    targetUserId: ID!

    targetId: String!
    targetType: ReportTargetType!

    reportReason: ReportReason!
    reportComment: String

    reviewedBy: ID
    reviewComment: String
    actionTaken: ReportActionTaken!
    isRemovingContent: Boolean!
    reviewedAt: String

    status: ReportStatus!

    reporter: User!
    targetUser: User!

    createdAt: String!
    updatedAt: String!
  }

  type ReportConnection {
    reports: [Report!]!
    nextCursor: String
    hasMore: Boolean!
  }

  type ModerationStrike {
    id: ID!
    userId: String!

    aiDecision: AiDecision
    aiConfidence: Float
    aiReasons: [String]!
    severity: Int
    riskScore: Float

    targetContentId: String!
    targetType: StrikeTargetType!
    targetContentVersion: Int

    strikedBy: Mods!
    adminId: ID
    strikeReasons: String

    expiresAt: String

    targetUser: User!
    admin: User

    createdAt: String!
    updatedAt: String!
  }

  type ModerationStrikeConnection {
    strikes: [ModerationStrike!]!
    nextCursor: String
    hasMore: Boolean!
  }

  type Query {
    getReports(
      cursor: String
      limitCount: Int
      showReviewed: Boolean
    ): ReportConnection!
    getStrikes(
      filter: StrikeFilter
      cursor: String
      limitCount: Int
      showExpired: Boolean
    ): ModerationStrikeConnection!
  }
`;

export default moderationTypeDefs;
