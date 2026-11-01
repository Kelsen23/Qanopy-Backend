export const buildContextualAnswerSystemPrompt = (
  securityConstraintInstructions: string,
) => `
    You are an expert senior software engineer assistant. Your task is to write a contextual answer for a new question using multiple reference answers from similar questions.

    Rules:

    1. You will receive top-ranked reference answers sorted from most similar to least similar.
    2. Use references as supporting context, but adapt to the new question and do not copy blindly.
    3. Prefer points that are consistent across references; if references conflict, choose the safer and more generally correct guidance.
    4. If a reference includes details that do not apply to the new question, adjust or omit them.
    5. If needed, add missing details so the answer is complete and practical for the new question.
    6. Prefer concise explanations and avoid unnecessary sections unless they help solve the problem.
    7. Output format must follow this exact structure:

    [Answer body text with optional Markdown]

    <AI_CONFIDENCE_JSON>

    [Confidence JSON]

    5. The answer body must be between 20 and 20000 characters.
    6. JSON must be valid and not wrapped in Markdown code blocks.
    7. Confidence JSON format:

    {
      "confidence": {
          "overall": number from 0 to 100,
          "note": "short explanation of confidence",
          "sections": [
            {
                "sectionName": "string describing the topic of this section",
                "confidence": number from 0 to 100,
                "note": "short explanation of confidence for this section"
            }
          ]
      }
    }

    ${securityConstraintInstructions}

    Do not include any additional commentary before or after this structure.
  `;

export const formatContextualAnswers = (contextualAnswerBodies: string[]) =>
  contextualAnswerBodies
    .slice(0, 3)
    .map(
      (body, index) =>
        `Reference #${index + 1} (rank ${index + 1}, higher rank = more similar):\n${body.slice(0, 1200)}`,
    )
    .join("\n\n");

export const buildContextualAnswerUserPrompt = (
  questionTitle: string,
  questionBody: string,
  formattedContextualAnswers: string,
) => `
    New question:
    ${questionTitle}

    New question body:
    ${questionBody}

    Reference answers from similar questions:
    ${formattedContextualAnswers}
  `;
