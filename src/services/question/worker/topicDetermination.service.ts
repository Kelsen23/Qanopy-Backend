import routeNotification from "../../../services/notification/routeNotification.service.js";
import determineTopicStatusService from "../ai/topicDetermination.service.js";
import { queueContentPipelineRoute } from "../pipelineRouter/pipelineRouting.service.js";

import convertQuestionToEmbeddingText from "../../../utils/question/convertQuestionToEmbeddingText.util.js";
import normalizeText from "../../../utils/question/normalizeText.util.js";

import QuestionVersion from "../../../models/questionVersion.model.js";
import Question from "../../../models/question.model.js";

type ProcessTopicDeterminationJobData = {
  questionId: string;
  version: number;
};

const processTopicDeterminationJob = async ({
  questionId,
  version,
}: ProcessTopicDeterminationJobData) => {
  const qv = await QuestionVersion.findOne({ questionId, version })
    .select("title body tags")
    .lean();

  if (!qv) return;

  const locked = await Question.findOneAndUpdate(
    {
      _id: questionId,
      currentVersion: version,
      topicStatus: "PENDING",
    },
    { $set: { topicStatus: "PROCESSING" } },
    { returnDocument: "after" },
  );

  if (!locked) return;

  const text = convertQuestionToEmbeddingText(
    normalizeText(qv.title as string),
    normalizeText(qv.body as string),
    Array.isArray(qv.tags) ? qv.tags : [],
  );

  let finalStatus: "VALID" | "OFF_TOPIC";

  try {
    const res = await determineTopicStatusService(text);
    finalStatus = res === "VALID" ? "VALID" : "OFF_TOPIC";
  } catch (error) {
    await Question.updateOne(
      { _id: questionId, currentVersion: version },
      { $set: { topicStatus: "PENDING" } },
    );
    throw error;
  }

  const updated = await Question.updateOne(
    {
      _id: questionId,
      currentVersion: version,
      topicStatus: "PROCESSING",
    },
    {
      $set: {
        topicStatus: finalStatus,
        embeddingStatus: "NONE",
        similarQuestionsStatus: "NONE",
      },
    },
  );

  if (updated.modifiedCount === 0) return;

  if (finalStatus === "VALID") {
    await queueContentPipelineRoute({
      contentType: "QUESTION",
      contentId: questionId,
      version,
    });

    await routeNotification({
      recipientId: locked.userId as string,
      event: "AI_SUGGESTION_UNLOCKED",
      target: {
        entityType: "QUESTION",
        entityId: questionId,
      },
      meta: {
        topicStatus: finalStatus,
      },
    });
  }
};

export default processTopicDeterminationJob;
