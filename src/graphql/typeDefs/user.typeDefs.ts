import { gql } from "graphql-tag";

const userTypeDefs = gql`
  enum Role {
    ADMIN
    MOD
    USER
  }

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

  extend type Query {
    user(id: String!): User
  }
`;

export default userTypeDefs;
