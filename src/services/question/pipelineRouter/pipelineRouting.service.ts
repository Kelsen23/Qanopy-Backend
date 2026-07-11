import ensureJobIsQueued from "../../../utils/job/ensureJobIsQueued.util.js";
import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import contentModerationQueue from "../../../queues/contentModeration.queue.js";
import contentPipelineRouter from "../../../queues/contentPipelineRouter.queue.js";
import questionEmbeddingQueue from "../../../queues/questionEmbedding.queue.js";
import similarQuestionsQueue from "../../../queues/similarQuestions.queue.js";
import topicDeterminationQueue from "../../../queues/topicDetermination.queue.js";

import type { ContentPipelineRouterJobData } from "./contentPipelineRouter.shared.js";

type QuestionPipelineStep = "TOPIC" | "EMBED" | "SIMILAR";

const queueJobIfNeeded = async ({
  queue,
  jobName,
  data,
  jobId,
}: {
  queue: {
    add: (
      name: string,
      payload: Record<string, unknown>,
      options: {
        jobId: string;
        removeOnComplete: boolean;
        removeOnFail: boolean;
      },
    ) => Promise<unknown>;
    getJob: (jobId: string) => Promise<
      | {
          getState: () => Promise<string>;
          retry: () => Promise<unknown>;
        }
      | null
      | undefined
    >;
  };
  jobName: string;
  data: Record<string, unknown>;
  jobId: string;
}) => {
  const alreadyQueued = await ensureJobIsQueued({
    queue,
    jobId,
  });

  if (alreadyQueued) return;

  return queue.add(jobName, data, {
    jobId,
    removeOnComplete: true,
    removeOnFail: false,
  });
};

const makeContentPipelineRouteJobId = (job: ContentPipelineRouterJobData) =>
  job.contentType === "QUESTION"
    ? makeJobId("contentPipelineRoute", job.contentId, job.version)
    : makeJobId(
        "contentPipelineRoute",
        job.contentType,
        job.contentId,
        job.moderationRevision,
      );

const queueContentPipelineRoute = async (job: ContentPipelineRouterJobData) =>
  queueJobIfNeeded({
    queue: contentPipelineRouter,
    jobName: job.contentType,
    data:
      job.contentType === "QUESTION"
        ? { contentId: job.contentId, version: job.version }
        : {
            contentId: job.contentId,
            moderationRevision: job.moderationRevision,
          },
    jobId: makeContentPipelineRouteJobId(job),
  });

const queueContentModerationRoute = async (job: ContentPipelineRouterJobData) =>
  queueJobIfNeeded({
    queue: contentModerationQueue,
    jobName: job.contentType,
    data:
      job.contentType === "QUESTION"
        ? { contentId: job.contentId, version: job.version }
        : {
            contentId: job.contentId,
            moderationRevision: job.moderationRevision,
          },
    jobId:
      job.contentType === "QUESTION"
        ? makeJobId("moderation", job.contentId, job.version)
        : makeJobId(
            "contentModeration",
            job.contentType,
            job.contentId,
            job.moderationRevision,
          ),
  });

const queueQuestionPipelineStep = async ({
  questionId,
  version,
  step,
}: {
  questionId: string;
  version: number;
  step: QuestionPipelineStep;
}) => {
  if (step === "TOPIC") {
    return queueJobIfNeeded({
      queue: topicDeterminationQueue,
      jobName: "QUESTION_TOPIC",
      data: { questionId, version },
      jobId: makeJobId("topic", questionId, version),
    });
  }

  if (step === "EMBED") {
    return queueJobIfNeeded({
      queue: questionEmbeddingQueue,
      jobName: "QUESTION_EMBEDDING",
      data: { questionId, version },
      jobId: makeJobId("embedding", questionId, version),
    });
  }

  return queueJobIfNeeded({
    queue: similarQuestionsQueue,
    jobName: "QUESTION_SIMILARITY",
    data: { questionId, version },
    jobId: makeJobId("similar", questionId, version),
  });
};

export {
  queueContentModerationRoute,
  queueContentPipelineRoute,
  queueQuestionPipelineStep,
};
