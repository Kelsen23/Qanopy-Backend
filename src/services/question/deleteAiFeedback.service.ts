import mongoose from "mongoose";

import HttpError from "../../utils/httpError.util.js";

import AiAnswerFeedback from "../../models/aiAnswerFeedback.model.js";

const deleteFeedbackOnAiAnswer = async (
  userId: string,
  { feedbackId }: { feedbackId: string },
) => {
  if (!mongoose.Types.ObjectId.isValid(feedbackId))
    throw new HttpError("Invalid feedbackId", 400);

  const foundFeedback = await AiAnswerFeedback.findById(feedbackId)
    .select("_id userId isDeleted isActive")
    .lean();

  if (!foundFeedback) throw new HttpError("AI feedback not found", 404);
  if (foundFeedback.userId !== userId)
    throw new HttpError("Unauthorized to delete AI feedback", 403);
  if (foundFeedback.isDeleted || !foundFeedback.isActive)
    throw new HttpError("AI feedback not active", 410);

  await AiAnswerFeedback.findByIdAndUpdate(feedbackId, {
    isDeleted: true,
    isActive: false,
  });

  return {
    message: "Successfully deleted AI answer feedback",
  };
};

export default deleteFeedbackOnAiAnswer;
