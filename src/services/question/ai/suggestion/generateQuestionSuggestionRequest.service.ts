import generateQuestionImprovementSuggestion from "./questionImprovementSuggestion.service.js";
import {
  QuestionSuggestionLockConflictError,
  withQuestionSuggestionLock,
} from "./questionSuggestion.lock.js";
import {
  buildQuestionSuggestionResult,
  chargeQuestionSuggestionCredits,
  createQuestionSuggestion,
  findExistingQuestionSuggestion,
  type GenerateQuestionSuggestionRequestInput,
  type GenerateQuestionSuggestionRequestResult,
  type GenerateQuestionSuggestionRequestStatus,
  isDuplicateKeyError,
  loadQuestionSuggestionContext,
  notifyMissingQuestionSuggestionReady,
  notifyQuestionSuggestionReady,
  refundQuestionSuggestionCharge,
} from "./questionSuggestion.shared.js";

import HttpError from "../../../../utils/http/httpError.util.js";

const generateQuestionSuggestionRequest = async ({
  userId,
  questionId,
  version,
}: GenerateQuestionSuggestionRequestInput): Promise<GenerateQuestionSuggestionRequestResult> => {
  const {
    question,
    title,
    body,
    tags,
    questionText,
    eligibilityGateDiagnosis,
  } = await loadQuestionSuggestionContext({
    userId,
    questionId,
    version,
  });

  const existingSuggestion = await findExistingQuestionSuggestion(
    questionId,
    version,
  );

  if (existingSuggestion) {
    await notifyMissingQuestionSuggestionReady({
      userId,
      questionId,
      version,
      suggestion: existingSuggestion,
    });

    return buildQuestionSuggestionResult(existingSuggestion, "EXISTING");
  }

  try {
    return await withQuestionSuggestionLock(
      questionId,
      version,
      async ({ assertLockHeld }) => {
        const lockedExistingSuggestion = await findExistingQuestionSuggestion(
          questionId,
          version,
        );

        if (lockedExistingSuggestion) {
          await notifyMissingQuestionSuggestionReady({
            userId,
            questionId,
            version,
            suggestion: lockedExistingSuggestion,
          });

          return buildQuestionSuggestionResult(
            lockedExistingSuggestion,
            "EXISTING",
          );
        }

        let creditOperationKey: string | null = null;
        let creditOwnerReason: string | null = null;
        let refundChargeOnDuplicate = false;
        let refundChargeOnFailure = false;

        try {
          const chargedCredits = await chargeQuestionSuggestionCredits({
            userId,
            questionId,
            version,
            questionText,
          });

          creditOperationKey = chargedCredits.operationKey;
          creditOwnerReason = chargedCredits.ownerReason;
          refundChargeOnDuplicate = chargedCredits.refundOnDuplicate;
          refundChargeOnFailure = chargedCredits.refundOnFailure;

          const { suggestion, metadata } =
            await generateQuestionImprovementSuggestion({
              title,
              body,
              tags,
              securityVerifierStatus: question.securityVerifierStatus,
              eligibilityGateDiagnosis,
            });

          await assertLockHeld();

          const generatedAt = new Date().toISOString();
          const newSuggestion = await createQuestionSuggestion({
            userId,
            questionId,
            version,
            suggestion,
            metadata,
            generatedAt,
          });

          refundChargeOnDuplicate = false;
          refundChargeOnFailure = false;

          await notifyQuestionSuggestionReady({
            userId,
            questionId,
            version,
            generatedAt,
          });

          return buildQuestionSuggestionResult(newSuggestion, "GENERATED");
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            const duplicateSuggestion = await findExistingQuestionSuggestion(
              questionId,
              version,
            );

            if (duplicateSuggestion) {
              await refundQuestionSuggestionCharge({
                operationKey: creditOperationKey,
                ownerReason: creditOwnerReason,
                shouldRefundCharge: refundChargeOnDuplicate,
                reason: "AI suggestion already existed",
              });

              return buildQuestionSuggestionResult(
                duplicateSuggestion,
                "EXISTING",
              );
            }
          }

          const recoveredSuggestion = await findExistingQuestionSuggestion(
            questionId,
            version,
          );

          if (recoveredSuggestion) {
            await notifyMissingQuestionSuggestionReady({
              userId,
              questionId,
              version,
              suggestion: recoveredSuggestion,
            });

            return buildQuestionSuggestionResult(
              recoveredSuggestion,
              "EXISTING",
            );
          }

          await refundQuestionSuggestionCharge({
            operationKey: creditOperationKey,
            ownerReason: creditOwnerReason,
            shouldRefundCharge: refundChargeOnFailure,
            reason: "AI suggestion generation failed",
          });

          throw error;
        }
      },
    );
  } catch (error) {
    if (error instanceof QuestionSuggestionLockConflictError) {
      throw new HttpError("AI suggestion generation already in progress", 409);
    }

    throw error;
  }
};

export default generateQuestionSuggestionRequest;
export type {
  GenerateQuestionSuggestionRequestInput,
  GenerateQuestionSuggestionRequestResult,
  GenerateQuestionSuggestionRequestStatus,
};
