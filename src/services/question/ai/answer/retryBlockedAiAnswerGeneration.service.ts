import withAiAnswerRequestLock from "./aiAnswerRequest.lock.js";

import HttpError from "../../../../utils/http/httpError.util.js";
import { queueAiAnswerRoute } from "../../pipelineRouter/pipelineRouting.service.js";

import AiAnswerGeneration from "../../../../models/aiAnswerGeneration.model.js";
import AiAnswer from "../../../../models/aiAnswer.model.js";
import Question from "../../../../models/question.model.js";
import QuestionSettings from "../../../../models/questionSettings.model.js";

const retryBlockedAiAnswerGeneration = async ({
  userId,
  questionId,
  questionVersion,
}: {
  userId: string;
  questionId: string;
  questionVersion: number;
}) =>
  withAiAnswerRequestLock(questionId, async (assertLockHeld) => {
    const question = await Question.findOne({ _id: questionId, userId })
      .select("currentVersion isActive isDeleted")
      .lean();

    if (!question) throw new HttpError("Question not found", 404);
    if (!question.isActive || question.isDeleted)
      throw new HttpError("Question not active", 410);
    if (question.currentVersion !== questionVersion)
      throw new HttpError("Cannot retry an AI Answer for a stale version", 409);

    const settings = await QuestionSettings.findOne({ questionId })
      .select("aiAnswerAutoGeneration")
      .lean();
    if (settings?.aiAnswerAutoGeneration) {
      throw new HttpError(
        "Manual AI answer retry is unavailable while auto-generation is enabled",
        409,
      );
    }

    const generation = await AiAnswerGeneration.findOne({
      userId,
      questionId,
      questionVersion,
      aiAnswerVersion: 1,
    });

    if (!generation || generation.generationReason !== "INITIAL_MANUAL")
      throw new HttpError("Blocked manual AI Answer generation not found", 404);
    if (
      await AiAnswer.exists({ questionId, questionVersion, aiAnswerVersion: 1 })
    )
      return { status: "ALREADY_ANSWERED" as const };
    if (generation.paymentStatus !== "BLOCKED_INSUFFICIENT_TOKENS")
      return { status: "IN_PROGRESS" as const };
    if (!generation.generationPlanId)
      throw new HttpError("AI Answer generation plan is missing", 409);

    await assertLockHeld();
    const queuedGeneration = await AiAnswerGeneration.findOneAndUpdate(
      {
        _id: generation._id,
        paymentStatus: "BLOCKED_INSUFFICIENT_TOKENS",
      },
      {
        $set: { paymentStatus: "RETRY_QUEUED", status: "ACTIVE" },
        $inc: { manualRetryCount: 1 },
      },
      { returnDocument: "after" },
    );

    if (!queuedGeneration) return { status: "IN_PROGRESS" as const };

    const routeKey = `MANUAL_RETRY_${queuedGeneration.manualRetryCount}`;
    await queueAiAnswerRoute(String(queuedGeneration._id), routeKey);

    return { status: "RETRY_QUEUED" as const };
  });

export default retryBlockedAiAnswerGeneration;
