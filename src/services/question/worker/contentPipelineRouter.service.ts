import {
  type ContentPipelineRouterJobData,
  type NonQuestionContentPipelineRouterJob,
  type QuestionContentPipelineRouterJob,
} from "../pipelineRouter/pipelineRouter.shared.js";

import aiAnswerFeedbackRouter from "../pipelineRouter/aiAnswerFeedbackRouter.service.js";
import answerRouter from "../pipelineRouter/answerRouter.service.js";
import questionRouter from "../pipelineRouter/questionRouter.service.js";
import replyRouter from "../pipelineRouter/replyRouter.service.js";

const processQuestionPipelineRoute = async (
  job: QuestionContentPipelineRouterJob,
) => questionRouter(job.contentId, job.version);

const processAnswerPipelineRoute = async (
  job: NonQuestionContentPipelineRouterJob,
) => answerRouter(job.contentId, job.moderationRevision);

const processReplyPipelineRoute = async (
  job: NonQuestionContentPipelineRouterJob,
) => replyRouter(job.contentId, job.moderationRevision);

const processAiAnswerFeedbackPipelineRoute = async (
  job: NonQuestionContentPipelineRouterJob,
) =>
  aiAnswerFeedbackRouter(job.contentId, job.moderationRevision);

const contentPipelineRouteHandlers = {
  QUESTION: processQuestionPipelineRoute,
  ANSWER: processAnswerPipelineRoute,
  REPLY: processReplyPipelineRoute,
  AI_ANSWER_FEEDBACK: processAiAnswerFeedbackPipelineRoute,
} as const;

const processContentPipelineRouterJob = async (
  job: ContentPipelineRouterJobData,
) => {
  const handler = contentPipelineRouteHandlers[job.contentType] as (
    routeJob: typeof job,
  ) => Promise<void>;

  await handler(job);
};

export default processContentPipelineRouterJob;
