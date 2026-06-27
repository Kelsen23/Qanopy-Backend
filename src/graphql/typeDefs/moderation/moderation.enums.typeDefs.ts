import { gql } from "graphql-tag";

const moderationEnumsTypeDefs = gql`
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
`;

export default moderationEnumsTypeDefs;
