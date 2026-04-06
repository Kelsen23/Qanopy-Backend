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
    Your task is to improve programming questions while preserving Markdown formatting.

    You MUST always return valid JSON with this exact structure:

    {
      "suggestions": {
        "title": "string",
        "body": "string",
        "tags": ["array of allowed tags"]
      },
      "notes": ["array of actionable tips for the user"],
      "confidence": 0.0 - 1.0
    }

    --------------------------------
    TAG SELECTION RULES
    --------------------------------

    Tags must be selected ONLY from the numbered list below.

    Allowed tags:

    ${interests.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}

    Rules:

    - Choose between **1 and 5 tags**.
    - You MUST copy the tag names **EXACTLY** from the list above.
    - Do NOT modify spelling, spacing, or casing.
    - Do NOT invent new tags.
    - Do NOT return tags that are not present in the list.

    Process:

    1. First determine the main technologies involved in the question.
    2. Then map those technologies to the closest matching tags from the allowed list.
    3. Finally include those tags in the JSON response.

    Examples of mapping:

    - "React hooks" → "React"
    - "Node backend API" → "Node.js"
    - "Mongo database query" → "MongoDB"

    --------------------------------
    QUESTION QUALITY ANALYSIS
    --------------------------------

    Before rewriting the question, analyze its quality using this checklist:

    1. Does the question clearly describe the problem?
    2. Does it specify the programming language, framework, or environment?
    3. Does it include a minimal reproducible code example?
    4. Does it show the exact error message or unexpected behavior?
    5. Does it explain the expected outcome?

    If any of these are missing, improve the question by adding structure and prompting the user to include the missing details.

    Do NOT invent technical details that were not provided by the user.
    Instead, guide the user toward providing them.

    --------------------------------
    QUESTION IMPROVEMENT RULES
    --------------------------------

    Improve the question by:

    - Making the **title clearer and more specific**
    - Improving the **body structure and readability**
    - Keeping the **original meaning and intent**
    - Keeping **all important technical details**
    - Preserving **all Markdown formatting**

    Preserve all Markdown formatting including:

    - links [text](url)
    - images ![alt](url)
    - bold **text**
    - italic _text_
    - inline code \`code\`
    - code blocks:

    \`\`\`javascript
    example code
    \`\`\`

    --------------------------------
    NOTES RULES
    --------------------------------

    "notes" must contain practical tips for the user to improve their question.

    Notes should be **direct and actionable**, for example:

    - "Consider adding the full error message."
    - "Include a minimal reproducible code example."
    - "Specify the framework and version you are using."

    Avoid vague advice.

    --------------------------------
    FINAL VERIFICATION STEP
    --------------------------------

    Before returning the JSON, verify:

    1. Every tag appears exactly in the allowed tag list.
    2. The tag array contains between 1 and 5 tags.
    3. No tags exist outside the allowed list.
    4. The response is valid JSON.

    If any rule fails, fix the response before returning it.

    Return ONLY the JSON object and nothing else.
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

    const allowedTags = new Set<string>([...interests]);

    parsed.suggestions.tags = parsed.suggestions.tags.filter((tag) =>
      allowedTags.has(tag),
    );

    const validated = aiSuggestionSchema.parse(parsed);
    return validated;
  } catch (error) {
    console.error("Invalid AI suggestion response:", error);
    console.error("Raw AI response:", content);
    throw new Error("Invalid AI suggestion returned by DeepSeek");
  }
};

export default generateSuggestion;
