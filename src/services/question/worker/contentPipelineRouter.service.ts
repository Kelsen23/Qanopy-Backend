import {
  type NonQuestionPipelineRouterJob,
  type PipelineRouterJobData,
  type QuestionPipelineRouterJob,
} from "../pipelineRouter/pipelineRouter.shared.js";

import aiAnswerFeedbackRouter from "../pipelineRouter/aiAnswerFeedbackRouter.service.js";
import answerRouter from "../pipelineRouter/answerRouter.service.js";
import questionRouter from "../pipelineRouter/questionRouter.service.js";
import replyRouter from "../pipelineRouter/replyRouter.service.js";

const processQuestionPipelineRoute = async (
  job: QuestionPipelineRouterJob,
) => questionRouter(job.contentId, job.version);

const processAnswerPipelineRoute = async (
  job: NonQuestionPipelineRouterJob,
) => answerRouter(job.contentId, job.moderationRevision);

const processReplyPipelineRoute = async (
  job: NonQuestionPipelineRouterJob,
) => replyRouter(job.contentId, job.moderationRevision);

const processAiAnswerFeedbackPipelineRoute = async (
  job: NonQuestionPipelineRouterJob,
) =>
  aiAnswerFeedbackRouter(job.contentId, job.moderationRevision);

const contentPipelineRouteHandlers = {
  QUESTION: processQuestionPipelineRoute,
  ANSWER: processAnswerPipelineRoute,
  REPLY: processReplyPipelineRoute,
  AI_ANSWER_FEEDBACK: processAiAnswerFeedbackPipelineRoute,
} as const;

const processContentPipelineRouterJob = async (
  job: PipelineRouterJobData,
) => {
  const handler = contentPipelineRouteHandlers[job.contentType] as (
    routeJob: typeof job,
  ) => Promise<void>;

  await handler(job);
};

export default processContentPipelineRouterJob;
