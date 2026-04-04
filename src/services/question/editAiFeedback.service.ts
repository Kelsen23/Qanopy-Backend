import mongoose from "mongoose";

import HttpError from "../../utils/httpError.util.js";

import AiAnswerFeedback from "../../models/aiAnswerFeedback.model.js";

import contentModerationQueue from "../../queues/contentModeration.queue.js";

const editFeedbackOnAiAnswer = async (
  userId: string,
  {
    aiFeedbackId,
    type,
    body,
  }: {
    aiFeedbackId: string;
    type: "HELPFUL" | "NOT_HELPFUL" | "FLAG";
    body: string;
  },
) => {
  if (!mongoose.Types.ObjectId.isValid(aiFeedbackId))
    throw new HttpError("Invalid aiFeedbackId", 400);

  if (!type || body === undefined)
    throw new HttpError("Both type and body are required", 400);

  const foundFeedback = await AiAnswerFeedback.findById(aiFeedbackId)
    .select("userId aiAnswerId type body isDeleted isActive")
    .lean();

  if (!foundFeedback) throw new HttpError("AI feedback not found", 404);
  if (foundFeedback.userId !== userId)
    throw new HttpError("Unauthorized to edit AI feedback", 403);
  if (foundFeedback.isDeleted || !foundFeedback.isActive)
    throw new HttpError("AI feedback not active", 410);

  const hasNoChanges =
    type === foundFeedback.type && body === (foundFeedback.body ?? null);

  if (hasNoChanges)
    throw new HttpError("At least one feedback field must be changed", 400);

  const duplicateFeedback = await AiAnswerFeedback.findOne({
    _id: { $ne: aiFeedbackId },
    aiAnswerId: foundFeedback.aiAnswerId,
    userId,
    isActive: true,
    isDeleted: false,
  })
    .select("_id")
    .lean();

  if (duplicateFeedback)
    throw new HttpError("Feedback already exists for this AI answer", 409);

  const editedFeedback = await AiAnswerFeedback.findByIdAndUpdate(
    aiFeedbackId,
    {
      type,
      body,
      moderationStatus: "PENDING",
      moderationUpdatedAt: null,
    },
    { new: true },
  );

  await contentModerationQueue.add("AI_ANSWER_FEEDBACK", {
    contentId: aiFeedbackId,
  });

  return {
    message: "Successfully edited AI answer feedback",
    feedback: editedFeedback,
  };
};

export default editFeedbackOnAiAnswer;
