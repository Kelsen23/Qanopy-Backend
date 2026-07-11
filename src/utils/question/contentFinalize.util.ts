import { makeJobId } from "../job/makeJobId.util.js";
import ensureJobIsQueued from "../job/ensureJobIsQueued.util.js";

import { queueContentPipelineRoute } from "./pipelineRouting.util.js";

import Question from "../../models/question.model.js";

import contentFinalizeQueue from "../../queues/contentFinalize.queue.js";
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
  version === undefined
    ? undefined
    : queueContentPipelineRoute({
        contentType: "QUESTION",
        contentId: entityId,
        version,
      });

const queueNonQuestionContentPipeline = async (
  jobName: "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK",
  entityId: string,
  moderationRevision?: number,
) =>
  queueContentPipelineRoute({
    contentType: jobName,
    contentId: entityId,
    moderationRevision,
  });

const queueQuestionContentFinalize = async ({
  userId,
  entityId,
  version,
  basedOnVersion,
  title,
  body,
  tags,
  moderationStatus,
  moderationUpdatedAt,
  topicStatus,
  embeddingStatus,
}: {
  userId: string;
  entityId: string;
  version: number;
  basedOnVersion: number;
  title: string;
  body: string;
  tags: string[];
  moderationStatus?: string;
  moderationUpdatedAt?: Date | null;
  topicStatus?: string;
  embeddingStatus?: string;
}) => {
  const jobId = makeJobId("contentFinalize", "QUESTION", entityId, version);
  const alreadyQueued = await ensureJobIsQueued({
    queue: contentFinalizeQueue,
    jobId,
  });

  if (alreadyQueued) return;

  return contentFinalizeQueue.add(
    "QUESTION",
    {
      userId,
      entityId,
      version,
      basedOnVersion,
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
      jobId,
    },
  );
};

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
}) => {
  const jobId = makeJobId(
    "questionVersioning",
    "CREATE_NEW_QUESTION_VERSION",
    questionId,
    intendedVersion,
  );
  const alreadyQueued = await ensureJobIsQueued({
    queue: questionVersioningQueue,
    jobId,
  });

  if (alreadyQueued) return;

  return questionVersioningQueue.add(
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
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId,
    },
  );
};

export {
  queueNonQuestionContentPipeline,
  queueQuestionContentPipeline,
  queueQuestionContentFinalize,
  queueQuestionVersionCreation,
  updateLiveQuestionBodyIfCurrent,
};
