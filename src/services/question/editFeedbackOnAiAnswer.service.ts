import mongoose from "mongoose";

import HttpError from "../../utils/httpError.util.js";

import AiAnswer from "../../models/aiAnswer.model.js";
import AiAnswerFeedback from "../../models/aiAnswerFeedback.model.js";
import QuestionVersion from "../../models/questionVersion.model.js";

import contentModerationQueue from "../../queues/contentModeration.queue.js";

const editFeedbackOnAiAnswer = async (
  userId: string,
  {
    feedbackId,
    type,
    body,
    questionVersionAtFeedback,
  }: {
    feedbackId: string;
    type: "HELPFUL" | "NOT_HELPFUL";
    body: string;
    questionVersionAtFeedback: number;
  },
) => {
  if (!mongoose.Types.ObjectId.isValid(feedbackId))
    throw new HttpError("Invalid feedbackId", 400);

  const foundFeedback = await AiAnswerFeedback.findById(feedbackId)
    .select(
      "userId aiAnswerId type body questionVersionAtFeedback isDeleted isActive",
    )
    .lean();

  if (!foundFeedback) throw new HttpError("AI feedback not found", 404);
  if (foundFeedback.userId !== userId)
    throw new HttpError("Unauthorized to edit AI feedback", 403);
  if (foundFeedback.isDeleted || !foundFeedback.isActive)
    throw new HttpError("AI feedback not active", 410);

  const foundAiAnswer = await AiAnswer.findById(foundFeedback.aiAnswerId)
    .select("questionId")
    .lean();

  if (!foundAiAnswer) throw new HttpError("AI answer not found", 404);

  const foundQuestionVersion = await QuestionVersion.findOne({
    questionId: foundAiAnswer.questionId,
    version: questionVersionAtFeedback,
  })
    .select("_id")
    .lean();

  if (!foundQuestionVersion)
    throw new HttpError("Question version not found", 404);

  const hasNoChanges =
    type === foundFeedback.type &&
    body === (foundFeedback.body ?? null)

  if (hasNoChanges)
    throw new HttpError("No changes made to the feedback", 400);

  const editedFeedback = await AiAnswerFeedback.findByIdAndUpdate(
    feedbackId,
    {
      type,
      body,
      questionVersionAtFeedback,
      moderationStatus: "PENDING",
      moderationUpdatedAt: null,
    },
    { new: true },
  );

  await contentModerationQueue.add("AI_ANSWER_FEEDBACK", {
    contentId: feedbackId,
  }, { removeOnComplete: true, removeOnFail: false });

  return {
    message: "Successfully edited AI answer feedback",
    feedback: editedFeedback,
  };
};

export default editFeedbackOnAiAnswer;
