import { gql } from "graphql-tag";

const userNotificationsTypeDefs = gql`
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
    questionVersion: Int
  }

  type NotificationConnection {
    notifications: [Notification!]!
    nextCursor: NotificationCursor
    hasMore: Boolean!
    unreadCount: Int!
  }

  type NotificationCursor {
    id: String!
    createdAt: String!
  }

  input NotificationCursorInput {
    id: String!
    createdAt: String!
  }

  extend type Query {
    notifications(
      cursor: NotificationCursorInput
      limitCount: Int
    ): NotificationConnection
  }
`;

export default userNotificationsTypeDefs;
