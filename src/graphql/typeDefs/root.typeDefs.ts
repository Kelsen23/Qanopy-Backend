import { gql } from "graphql-tag";

const rootTypeDefs = gql`
  type Query {
    _empty: String
  }
`;

export default rootTypeDefs;
