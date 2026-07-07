import { makeJobId } from "../job/makeJobId.util.js";

import Question from "../../models/question.model.js";

import contentPipelineRouter from "../../queues/contentPipelineRouter.queue.js";
import questionVersioningQueue from "../../queues/questionVersioning.queue.js";

const updateLiveQuestionBodyIfCurrent = async ({
  entityId,
  version,
  body,
}: {
  entityId: string;
  version?: number;
  body: string;
}) => {
  await Question.findOneAndUpdate(
    {
      _id: entityId,
      currentVersion: version,
    },
    {
      $set: {
        body,
      },
    },
  );
};

const queueQuestionContentPipeline = async (
  entityId: string,
  version?: number,
) =>
  contentPipelineRouter.add(
    "QUESTION",
    { contentId: entityId, version },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("contentPipelineRoute", entityId, version),
    },
  );

const queueNonQuestionContentPipeline = async (
  jobName: "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK",
  entityId: string,
) =>
  contentPipelineRouter.add(
    jobName,
    { contentId: entityId },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("contentPipelineRoute", jobName, entityId),
    },
  );

const queueQuestionVersionCreation = async ({
  questionId,
  intendedVersion,
  basedOnVersion,
  userId,
  title,
  body,
  tags,
  moderationStatus,
  moderationUpdatedAt,
  topicStatus,
  embeddingStatus,
}: {
  questionId: string;
  intendedVersion?: number;
  basedOnVersion?: number;
  userId: string;
  title?: string;
  body: string;
  tags?: string[];
  moderationStatus?: string;
  moderationUpdatedAt?: Date | null;
  topicStatus?: string;
  embeddingStatus?: string;
}) =>
  questionVersioningQueue.add(
    "CREATE_NEW_QUESTION_VERSION",
    {
      questionId,
      intendedVersion,
      basedOnVersion,
      userId,
      title,
      body,
      tags,
      moderationStatus,
      moderationUpdatedAt,
      topicStatus,
      embeddingStatus,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId(
        "questionVersioning",
        "CREATE_NEW_QUESTION_VERSION",
        questionId,
        intendedVersion,
      ),
    },
  );

export {
  queueNonQuestionContentPipeline,
  queueQuestionContentPipeline,
  queueQuestionVersionCreation,
  updateLiveQuestionBodyIfCurrent,
};
