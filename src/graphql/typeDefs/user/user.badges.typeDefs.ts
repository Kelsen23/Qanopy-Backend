import { gql } from "graphql-tag";

const userBadgesTypeDefs = gql`
  type UserBadge {
    badgeId: String!
    name: String!
    description: String
    iconKey: String
    colorKey: String
    imageKey: String
    isActive: Boolean!
    awardedAt: String!
    source: String
    createdAt: String!
    updatedAt: String!
  }

  type UserBadgeConnection {
    badges: [UserBadge!]!
    nextCursor: UserBadgeCursor
    hasMore: Boolean!
  }

  type UserBadgeCursor {
    awardedAt: String!
    badgeId: String!
  }

  input UserBadgeCursorInput {
    awardedAt: String!
    badgeId: String!
  }

  extend type Query {
    badges(cursor: UserBadgeCursorInput, limitCount: Int): UserBadgeConnection!
  }
`;

export default userBadgesTypeDefs;
