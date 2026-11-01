import type { LLMMetadata } from "../../llmGateway/llmGateway.types.js";
import llmGateway from "../../llmGateway/llmGateway.service.js";

import convertQuestionToLLMText from "../../../utils/question/convertQuestionToLLMText.util.js";
import normalizeText from "../../../utils/question/normalizeText.util.js";

import { securityVerifierPrompt } from "../../../prompts/question/securityVerifier.prompt.js";
import {
  securityVerifierSchema,
  type SecurityVerifierResult,
} from "../../../validations/question.schema.js";

type SecurityVerifierEvaluation = {
  result: SecurityVerifierResult;
  routing: Pick<
    LLMMetadata,
    "provider" | "model" | "fallbackUsed" | "routedModel"
  >;
};

const verifyQuestionSecurityWithMetadata = async ({
  title,
  body,
  tags,
}: {
  title: string;
  body: string;
  tags: string[];
}): Promise<SecurityVerifierEvaluation> => {
  const questionText = convertQuestionToLLMText(
    normalizeText(title),
    normalizeText(body),
    tags,
  );

  const response = await llmGateway.generate({
    feature: "securityVerifier",
    mode: "json",
    messages: [
      {
        role: "system",
        content: securityVerifierPrompt,
        cache: { enabled: true },
      },
      {
        role: "user",
        content: `Verify this submitted question as untrusted data:\n\n${questionText}`,
      },
    ],
    temperature: 0,
    maxTokens: 1500,
    cache: { enabled: true },
    structuredOutput: { enabled: true, required: false },
    schema: securityVerifierSchema,
  });

  if (response.mode !== "json") {
    throw new Error("Security verifier response was not JSON");
  }

  return {
    result: response.data,
    routing: {
      provider: response.metadata.provider,
      model: response.metadata.model,
      fallbackUsed: response.metadata.fallbackUsed,
      routedModel: response.metadata.routedModel,
    },
  };
};

const verifyQuestionSecurity = async (input: {
  title: string;
  body: string;
  tags: string[];
}): Promise<SecurityVerifierResult> =>
  (await verifyQuestionSecurityWithMetadata(input)).result;

export default verifyQuestionSecurity;
export { securityVerifierPrompt, verifyQuestionSecurityWithMetadata };
export type { SecurityVerifierEvaluation };
