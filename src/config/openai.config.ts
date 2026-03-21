import OpenAI from "openai";

import dotenv from "dotenv";
dotenv.config();

const moderationApiKey = process.env.OPENAI_API_KEY_MODERATION;
const topicDeterminerApiKey = process.env.OPENAI_API_KEY_TOPIC_DETERMINATION;

const moderationClient = new OpenAI({
  apiKey: moderationApiKey,
});

const topicDeterminerClient = new OpenAI({
  apiKey: topicDeterminerApiKey,
});

export { moderationClient, topicDeterminerClient };
