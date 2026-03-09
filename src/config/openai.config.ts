import OpenAI from "openai";

import dotenv from "dotenv";
dotenv.config();

const moderationClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY_MODERATION,
});

const topicDeterminerClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY_TOPIC_DETERMINER,
});

export { moderationClient, topicDeterminerClient };
