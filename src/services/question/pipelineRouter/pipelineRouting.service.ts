import ensureJobIsQueued from "../../../utils/job/ensureJobIsQueued.util.js";
import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import contentModerationQueue from "../../../queues/contentModeration.queue.js";
import contentPipelineRouter from "../../../queues/contentPipelineRouter.queue.js";
import questionEmbeddingQueue from "../../../queues/questionEmbedding.queue.js";
import questionEligibilityGateQueue from "../../../queues/questionEligibilityGate.queue.js";
import securityVerifierQueue from "../../../queues/securityVerifier.queue.js";
import similarQuestionsQueue from "../../../queues/similarQuestions.queue.js";

import type { PipelineRouterJobData } from "./pipelineRouter.shared.js";

export type QuestionPipelineStep =
  | "ELIGIBILITY_GATE"
  | "SECURITY_VERIFIER"
  | "EMBED"
  | "SIMILAR";

const queueJobIfNeeded = async ({
  queue,
  jobName,
  data,
  jobId,
}: {
  queue: {
    add: (
      ...args: [
        string,
        Record<string, unknown>,
        {
          jobId: string;
          removeOnComplete: boolean;
          removeOnFail: boolean;
        },
      ]
    ) => Promise<unknown>;
    getJob: (...args: [string]) => Promise<
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

const makeContentPipelineRouteJobId = (job: PipelineRouterJobData) =>
  job.contentType === "QUESTION"
    ? makeJobId("contentPipelineRoute", job.contentId, job.version)
    : makeJobId(
        "contentPipelineRoute",
        job.contentType,
        job.contentId,
        job.moderationRevision,
      );

const queueContentPipelineRoute = async (job: PipelineRouterJobData) =>
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

const queueContentModerationRoute = async (job: PipelineRouterJobData) =>
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
  if (step === "ELIGIBILITY_GATE") {
    return queueJobIfNeeded({
      queue: questionEligibilityGateQueue,
      jobName: "ELIGIBILITY_GATE",
      data: { questionId, version },
      jobId: makeJobId("questionEligibilityGate", questionId, version),
    });
  }

  if (step === "SECURITY_VERIFIER") {
    return queueJobIfNeeded({
      queue: securityVerifierQueue,
      jobName: "SECURITY_VERIFIER",
      data: { questionId, version },
      jobId: makeJobId("securityVerifier", questionId, version),
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
