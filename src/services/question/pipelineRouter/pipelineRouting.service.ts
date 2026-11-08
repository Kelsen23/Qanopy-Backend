import type { Queue } from "bullmq";

import type {
  ModeratablePipelineRouterJobData,
  PipelineRouterJobData,
} from "./pipelineRouter.shared.js";

import ensureJobIsQueued from "../../../utils/job/ensureJobIsQueued.util.js";
import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import contentModerationQueue from "../../../queues/moderation/contentModeration.queue.js";
import contentPipelineRouter from "../../../queues/question/contentPipelineRouter.queue.js";
import questionEmbeddingQueue from "../../../queues/question/questionEmbedding.queue.js";
import questionEligibilityGateQueue from "../../../queues/question/questionEligibilityGate.queue.js";
import questionSecurityVerifierQueue from "../../../queues/question/questionSecurityVerifier.queue.js";
import similarQuestionSearchQueue from "../../../queues/question/similarQuestionSearch.queue.js";

export type QuestionPipelineStep =
  | "ELIGIBILITY_GATE"
  | "QUESTION_SECURITY_VERIFIER"
  | "EMBED"
  | "SIMILAR";

const queueJobIfNeeded = async ({
  queue,
  jobName,
  data,
  jobId,
}: {
  queue: Pick<Queue, "add" | "getJob">;
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

const makeContentPipelineRouterJobId = (job: PipelineRouterJobData) =>
  job.contentType === "QUESTION"
    ? makeJobId("contentPipelineRouter", job.contentId, job.version)
    : job.contentType === "AI_ANSWER"
      ? makeJobId(
          "contentPipelineRouter",
          job.contentType,
          job.contentId,
          job.routeKey,
        )
      : makeJobId(
          "contentPipelineRouter",
          job.contentType,
          job.contentId,
          job.moderationRevision,
        );

const queueAiAnswerRoute = (generationId: string, routeKey?: string) =>
  queueContentPipelineRoute({
    contentType: "AI_ANSWER",
    contentId: generationId,
    routeKey,
  });

const queueContentPipelineRoute = async (job: PipelineRouterJobData) =>
  queueJobIfNeeded({
    queue: contentPipelineRouter,
    jobName: job.contentType,
    data:
      job.contentType === "QUESTION"
        ? { contentId: job.contentId, version: job.version }
        : job.contentType === "AI_ANSWER"
          ? { contentId: job.contentId, routeKey: job.routeKey }
          : {
              contentId: job.contentId,
              moderationRevision: job.moderationRevision,
            },
    jobId: makeContentPipelineRouterJobId(job),
  });

const queueContentModerationRoute = async (
  job: ModeratablePipelineRouterJobData,
) =>
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
        ? makeJobId("contentModeration", job.contentId, job.version)
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
  refresh = false,
}: {
  questionId: string;
  version: number;
  step: QuestionPipelineStep;
  refresh?: boolean;
}) => {
  if (step === "ELIGIBILITY_GATE") {
    return queueJobIfNeeded({
      queue: questionEligibilityGateQueue,
      jobName: "ELIGIBILITY_GATE",
      data: { questionId, version },
      jobId: makeJobId("questionEligibilityGate", questionId, version),
    });
  }

  if (step === "QUESTION_SECURITY_VERIFIER") {
    return queueJobIfNeeded({
      queue: questionSecurityVerifierQueue,
      jobName: "QUESTION_SECURITY_VERIFIER",
      data: { questionId, version },
      jobId: makeJobId("questionSecurityVerifier", questionId, version),
    });
  }

  if (step === "EMBED") {
    return queueJobIfNeeded({
      queue: questionEmbeddingQueue,
      jobName: "QUESTION_EMBEDDING",
      data: { questionId, version },
      jobId: makeJobId("questionEmbedding", questionId, version),
    });
  }

  return queueJobIfNeeded({
    queue: similarQuestionSearchQueue,
    jobName: "SIMILAR_QUESTION_SEARCH",
    data: { questionId, version, ...(refresh ? { refresh: true } : {}) },
    jobId: makeJobId("similarQuestionSearch", questionId, version),
  });
};

export {
  queueContentModerationRoute,
  queueContentPipelineRoute,
  queueAiAnswerRoute,
  queueQuestionPipelineStep,
};
