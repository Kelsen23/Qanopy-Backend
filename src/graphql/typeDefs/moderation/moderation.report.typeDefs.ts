import { gql } from "graphql-tag";

const moderationReportTypeDefs = gql`
  type Report {
    id: String!

    reportedBy: String!
    targetUserId: String!

    targetId: String!
    targetContentVersion: Int
    targetType: ReportTargetType!

    reportReason: ReportReason!
    reportComment: String

    reviewedBy: String
    reviewComment: String
    actionTaken: ReportActionTaken!
    isRemovingContent: Boolean!
    reviewedAt: String

    status: ReportStatus!

    reporter: User
    targetUser: User

    createdAt: String!
    updatedAt: String!
  }

  type ReportConnection {
    reports: [Report!]!
    nextCursor: ReportCursor
    hasMore: Boolean!
  }

  type ReportCursor {
    id: String!
  }

  input ReportCursorInput {
    id: String!
  }
`;

export default moderationReportTypeDefs;
