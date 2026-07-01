import mongoose from "mongoose";

import HttpError from "../../../../utils/http/httpError.util.js";
import { makeJobId } from "../../../../utils/job/makeJobId.util.js";
import queueUserInterest from "../../../../utils/question/queueUserInterest.util.js";

import AiAnswer from "../../../../models/aiAnswer.model.js";
import AiAnswerFeedback from "../../../../models/aiAnswerFeedback.model.js";
import Question from "../../../../models/question.model.js";
import QuestionVersion from "../../../../models/questionVersion.model.js";

import contentModerationQueue from "../../../../queues/contentModeration.queue.js";

import { toPublicAiAnswerFeedback } from "../../question.response.js";

const createFeedbackOnAiAnswerService = async (
  userId: string,
  {
    aiAnswerId,
    type,
    body,
    questionVersionAtFeedback,
  }: {
    aiAnswerId: string;
    type: "HELPFUL" | "NOT_HELPFUL";
    body?: string;
    questionVersionAtFeedback: number;
  },
) => {
  if (!mongoose.Types.ObjectId.isValid(aiAnswerId))
    throw new HttpError("Invalid aiAnswerId", 400);

  const foundAiAnswer = await AiAnswer.findById(aiAnswerId)
    .select("_id questionId isPublished")
    .lean();

  if (!foundAiAnswer) throw new HttpError("AI answer not found", 404);
  if (!foundAiAnswer.isPublished)
    throw new HttpError("AI answer must be published before feedback", 400);

  const foundQuestionVersion = await QuestionVersion.findOne({
    questionId: foundAiAnswer.questionId,
    version: questionVersionAtFeedback,
  })
    .select("_id")
    .lean();

  if (!foundQuestionVersion)
    throw new HttpError("Question version not found", 404);

  const existingFeedback = await AiAnswerFeedback.findOne({
    aiAnswerId,
    userId,
    isActive: true,
    isDeleted: false,
  })
    .select("_id")
    .lean();

  if (existingFeedback)
    throw new HttpError("Feedback already exists for this AI answer", 409);

  const newFeedback = await AiAnswerFeedback.create({
    aiAnswerId,
    userId,
    type,
    body: body ?? null,
    questionVersionAtFeedback,
  });

  await contentModerationQueue.add(
    "AI_ANSWER_FEEDBACK",
    {
      contentId: newFeedback._id,
      moderationRevision: newFeedback.moderationRevision,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId(
        "contentModeration",
        "AI_ANSWER_FEEDBACK",
        newFeedback._id,
      ),
    },
  );

  const foundQuestion = (await Question.findById(foundAiAnswer.questionId)
    .select("_id tags isActive isDeleted")
    .lean()) as {
    tags?: string[] | null;
    isActive?: boolean;
    isDeleted?: boolean;
  } | null;

  if (
    foundQuestion?.isActive &&
    !foundQuestion.isDeleted &&
    foundQuestion.tags?.length
  ) {
    queueUserInterest({
      userId,
      tags: foundQuestion.tags,
      action: "AI_ANSWER_FEEDBACK",
    }).catch(() => {});
  }

  return {
    message: "Successfully created AI answer feedback",
    feedback: toPublicAiAnswerFeedback(newFeedback),
  };
};

export default createFeedbackOnAiAnswerService;
