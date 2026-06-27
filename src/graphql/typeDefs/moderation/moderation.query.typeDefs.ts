import { gql } from "graphql-tag";

const moderationQueryTypeDefs = gql`
  extend type Query {
    reports(
      cursor: ReportCursorInput
      limitCount: Int
      showReviewed: Boolean
    ): ReportConnection!

    strikes(
      filter: StrikeFilter
      cursor: StrikeCursorInput
      limitCount: Int
    ): ModerationStrikeConnection!
  }
`;

export default moderationQueryTypeDefs;
