import dotenv from "dotenv";
import mongoose from "mongoose";

import type { z } from "zod";

import { mongodbConfigSchema } from "../validations/config.schema.js";

dotenv.config();

type MongoDBConfig = z.infer<typeof mongodbConfigSchema>;

let mongodbConfig: MongoDBConfig | null = null;

const getMongoDBConfig = () => {
  if (!mongodbConfig) mongodbConfig = mongodbConfigSchema.parse(process.env);

  return mongodbConfig;
};

const getRecommendedQuestionsIndexName = () =>
  getMongoDBConfig().recommendedQuestionsIndexName;

const getQuestionAutocompleteIndexName = () =>
  getMongoDBConfig().questionAutocompleteIndexName;

const getQuestionSearchIndexName = () =>
  getMongoDBConfig().questionSearchIndexName;

const getQuestionVectorSearchIndexName = () =>
  getMongoDBConfig().questionVectorSearchIndexName;

const connectMongoDB = async (mongoUrl: string) => {
  try {
    await mongoose.connect(mongoUrl);
    console.log("Successfully connected to MongoDB 🍃");
  } catch (error) {
    console.error("Couldn't connect to MongoDB ❌:", error);
    process.exit(1);
  }
};

export {
  getQuestionAutocompleteIndexName,
  getQuestionSearchIndexName,
  getQuestionVectorSearchIndexName,
  getRecommendedQuestionsIndexName,
};

export default connectMongoDB;
