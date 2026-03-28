import { suggestionGenerationClient } from "../../config/deepseek.config.js";

import HttpError from "../../utils/httpError.util.js";

import interests from "../../utils/interests.util.js";

import aiSuggestionSchema from "../../validations/aiSuggestion.schema.js";

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
  Improve questions while preserving Markdown.
  
  Always output valid JSON with fields:
  {
    "suggestions": {
        "title": "string",
        "body": "string",
        "tags": ["array of allowed tags"]
    },
    "notes": ["array of notes"],
    "confidence": 0.0 - 1.0
  }
  
  **Instructions:**
  - Only use tags from: ${interests.map((i) => `"${i}"`).join(", ")}
  - Preserve all Markdown formatting:
    - links \\[text](url)
    - images \\!\\[alt](url)
    - bold **text** and italic _text_
    - inline code \\\`someCode\\\`
    - code blocks \\\`\`\`javascript ... \\\`\`\`
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
    const raw = content.trim();
    const jsonString = raw.replace(/^```json\s*/, "").replace(/```$/, "");
    const parsed: AISuggestion = JSON.parse(jsonString);
    const validated = aiSuggestionSchema.parse(parsed);
    return validated;
  } catch (error) {
    console.error("Invalid AI suggestion response:", error);
    console.error("Raw AI response:", content);
    throw new Error("Invalid AI suggestion returned by DeepSeek");
  }
};

export default generateSuggestion;
