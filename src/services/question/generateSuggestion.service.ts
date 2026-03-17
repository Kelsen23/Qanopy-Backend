import { suggestionGenerationClient } from "../../config/deepseek.config.js";

import HttpError from "../../utils/httpError.util.js";

interface AISuggestion {
  suggestions: {
    title: string;
    body: string;
    tags: string[];
  };
  notes: string[];
  confidence: number;
}

const generateSuggestion = async (questionText: string) => {
  const systemPrompt = `
    You are a senior, experienced software engineer and educator. 
    Your goal is to improve the clarity, correctness, and completeness of a question provided by a user.
    Always output a structured JSON with the following fields:

    {
    "suggestions": {
        "title": "string, improved title",
        "body": "string, improved body",
        "tags": ["array", "of", "tags"]
    },
    "notes": ["array of short suggestions like 'Consider adding a code snippet'", ...],
    "confidence": 0.0 - 1.0 (how confident you are in your improvements)
    }

    Only output valid JSON. Do not add extra text outside JSON.
`;

  const userPrompt = `
    Improve the following question:

    ${questionText}
`;

  const res = await suggestionGenerationClient.chat.completions.create({
    model: "deepseek/deepseek-chat",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 1500,
  });

  const content = res.choices?.[0]?.message?.content;

  if (!content) throw new HttpError("No suggestion returned by DeepSeek", 500);

  try {
    const parsed: AISuggestion = JSON.parse(content);
    return parsed;
  } catch (err) {
    console.error("Failed to parse AI suggestion JSON:", content);
    throw new Error("Invalid JSON returned by DeepSeek");
  }
};

export default generateSuggestion;
