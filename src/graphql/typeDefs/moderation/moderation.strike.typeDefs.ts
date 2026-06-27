import { gql } from "graphql-tag";

const moderationStrikeTypeDefs = gql`
  type ModerationStrike {
    id: String!
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

    adminId: String
    strikeComment: String

    reviewedBy: String
    reviewComment: String
    actionTaken: ReportActionTaken!
    isRemovingContent: Boolean!
    reviewedAt: String

    targetUser: User
    admin: User

    createdAt: String!
    updatedAt: String!
  }

  type ModerationStrikeConnection {
    strikes: [ModerationStrike!]!
    nextCursor: StrikeCursor
    hasMore: Boolean!
  }

  type StrikeCursor {
    id: String!
    createdAt: String!
  }

  input StrikeCursorInput {
    id: String!
    createdAt: String!
  }
`;

export default moderationStrikeTypeDefs;
