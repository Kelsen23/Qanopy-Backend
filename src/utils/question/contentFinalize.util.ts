import { makeJobId } from "../job/makeJobId.util.js";
import ensureJobIsQueued from "../job/ensureJobIsQueued.util.js";

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
) => {
  const jobId = makeJobId("contentPipelineRoute", entityId, version);
  const alreadyQueued = await ensureJobIsQueued({
    queue: contentPipelineRouter,
    jobId,
  });

  if (alreadyQueued) return;

  return contentPipelineRouter.add(
    "QUESTION",
    { contentId: entityId, version },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId,
    },
  );
};

const queueNonQuestionContentPipeline = async (
  jobName: "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK",
  entityId: string,
  moderationRevision?: number,
) => {
  const jobId = makeJobId(
    "contentPipelineRoute",
    jobName,
    entityId,
    moderationRevision,
  );
  const alreadyQueued = await ensureJobIsQueued({
    queue: contentPipelineRouter,
    jobId,
  });

  if (alreadyQueued) return;

  return contentPipelineRouter.add(
    jobName,
    { contentId: entityId, moderationRevision },
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
  queueQuestionVersionCreation,
  updateLiveQuestionBodyIfCurrent,
};
