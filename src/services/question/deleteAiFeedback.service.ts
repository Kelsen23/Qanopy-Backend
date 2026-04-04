import mongoose from "mongoose";

import HttpError from "../../utils/httpError.util.js";

import AiAnswerFeedback from "../../models/aiAnswerFeedback.model.js";

const deleteAiFeedbackService = async (
  userId: string,
  { aiFeedbackId }: { aiFeedbackId: string },
) => {
  if (!mongoose.Types.ObjectId.isValid(aiFeedbackId))
    throw new HttpError("Invalid aiFeedbackId", 400);

  const foundFeedback = await AiAnswerFeedback.findById(aiFeedbackId)
    .select("_id userId isDeleted isActive")
    .lean();

  if (!foundFeedback) throw new HttpError("AI feedback not found", 404);
  if (foundFeedback.userId !== userId)
    throw new HttpError("Unauthorized to delete AI feedback", 403);
  if (foundFeedback.isDeleted || !foundFeedback.isActive)
    throw new HttpError("AI feedback not active", 410);

  await AiAnswerFeedback.findByIdAndUpdate(aiFeedbackId, {
    isDeleted: true,
    isActive: false,
  });

  return {
    message: "Successfully deleted AI answer feedback",
  };
};

export default deleteAiFeedbackService;
