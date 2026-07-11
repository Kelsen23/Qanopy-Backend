import {
  type ContentPipelineRouterJobData,
  type NonQuestionContentPipelineRouterJob,
  type QuestionContentPipelineRouterJob,
} from "../pipelineRouter/contentPipelineRouter.shared.js";

import answerPipelineRouterService from "../pipelineRouter/answerPipelineRouter.service.js";
import aiAnswerFeedbackPipelineRouterService from "../pipelineRouter/aiAnswerFeedbackPipelineRouter.service.js";
import questionPipelineRouterService from "../pipelineRouter/questionPipelineRouter.service.js";
import replyPipelineRouterService from "../pipelineRouter/replyPipelineRouter.service.js";

const processQuestionPipelineRoute = async (
  job: QuestionContentPipelineRouterJob,
) => questionPipelineRouterService(job.contentId, job.version);

const processAnswerPipelineRoute = async (
  job: NonQuestionContentPipelineRouterJob,
) => answerPipelineRouterService(job.contentId, job.moderationRevision);

const processReplyPipelineRoute = async (
  job: NonQuestionContentPipelineRouterJob,
) => replyPipelineRouterService(job.contentId, job.moderationRevision);

const processAiAnswerFeedbackPipelineRoute = async (
  job: NonQuestionContentPipelineRouterJob,
) =>
  aiAnswerFeedbackPipelineRouterService(job.contentId, job.moderationRevision);

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
