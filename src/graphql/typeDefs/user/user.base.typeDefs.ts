import { gql } from "graphql-tag";

const userBaseTypeDefs = gql`
  type UserProfile {
    displayName: String
    bio: String
    profilePictureUrl: String
    profilePictureKey: String
  }

  type UserStats {
    reputationPoints: Int!
    questionsAsked: Int!
    answersGiven: Int!
    acceptedAnswers: Int!
    bestAnswers: Int!
  }

  type UserStatusState {
    status: String!
    isDeleted: Boolean!
  }

  type User {
    id: String!
    username: String!
    email: String!
    role: Role!
    profile: UserProfile!
    stats: UserStats!
    statusState: UserStatusState!
    createdAt: String!
  }

  extend type Query {
    user(id: String!): User
  }
`;

export default userBaseTypeDefs;
