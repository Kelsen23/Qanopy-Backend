import { gql } from "graphql-tag";

const userBaseTypeDefs = gql`
  type User {
    id: String!
    username: String!
    displayName: String
    email: String!
    profilePictureKey: String
    profilePictureUrl: String
    bio: String
    reputationPoints: Int!
    role: Role!
    questionsAsked: Int!
    answersGiven: Int!
    bestAnswers: Int!
    status: String!
    isVerified: Boolean!
    createdAt: String!
  }

  extend type Query {
    user(id: String!): User
  }
`;

export default userBaseTypeDefs;
