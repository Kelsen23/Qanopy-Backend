import { topicDeterminerClient } from "../../config/openai.config.js";

const determineTopicStatus = async (questionText: string) => {
  const prompt = `
    Classify the question for a programming Q&A site.
    
    Return ONLY:
    VALID
    OFF_TOPIC
    
    VALID = programming or software engineering related
    OFF_TOPIC = anything else
    
    If unsure return OFF_TOPIC.
    
    Question:
    ${questionText}
    `;

  const response = await topicDeterminerClient.responses.create({
    model: "gpt-4o-mini",
    input: prompt,
    temperature: 0,
    max_output_tokens: 16,
  });

  let result = response.output_text.trim();

  if (result !== "VALID" && result !== "OFF_TOPIC") {
    result = "OFF_TOPIC";
  }

  return result;
};

export default determineTopicStatus;
