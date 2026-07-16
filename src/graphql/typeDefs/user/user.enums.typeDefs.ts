import { gql } from "graphql-tag";

const userEnumsTypeDefs = gql`
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
    QUESTION_ELIGIBILITY_UPDATE
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
`;

export default userEnumsTypeDefs;
