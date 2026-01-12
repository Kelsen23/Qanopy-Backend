import { gql } from "graphql-tag";

const userTypeDefs = gql`
  enum Role {
    ADMIN
    MOD
    USER
  }

  type Achievement {
    id: ID!
    userId: String!
    name: String!
    description: String!
    createdAt: String!
  }

  type User {
    id: ID!
    username: String!
    email: String!
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

  type Query {
    getUserById(id: ID!): User
  }
`;

export default userTypeDefs;
