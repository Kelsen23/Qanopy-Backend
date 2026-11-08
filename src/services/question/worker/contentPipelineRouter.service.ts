import {
  type NonQuestionPipelineRouterJob,
  type AiAnswerPipelineRouterJob,
  type PipelineRouterJobData,
  type QuestionPipelineRouterJob,
} from "../pipelineRouter/pipelineRouter.shared.js";

import aiAnswerFeedbackRouter from "../pipelineRouter/aiAnswerFeedbackRouter.service.js";
import aiAnswerRouter from "../pipelineRouter/aiAnswerRouter.service.js";
import answerRouter from "../pipelineRouter/answerRouter.service.js";
import questionRouter from "../pipelineRouter/questionRouter.service.js";
import replyRouter from "../pipelineRouter/replyRouter.service.js";

const processQuestionPipelineRoute = async (job: QuestionPipelineRouterJob) =>
  questionRouter(job.contentId, job.version);

const processAnswerPipelineRoute = async (job: NonQuestionPipelineRouterJob) =>
  answerRouter(job.contentId, job.moderationRevision);

const processReplyPipelineRoute = async (job: NonQuestionPipelineRouterJob) =>
  replyRouter(job.contentId, job.moderationRevision);

const processAiAnswerFeedbackPipelineRoute = async (
  job: NonQuestionPipelineRouterJob,
) => aiAnswerFeedbackRouter(job.contentId, job.moderationRevision);

const processAiAnswerPipelineRoute = async (job: AiAnswerPipelineRouterJob) =>
  aiAnswerRouter(job.contentId);

const contentPipelineRouterHandlers = {
  QUESTION: processQuestionPipelineRoute,
  ANSWER: processAnswerPipelineRoute,
  REPLY: processReplyPipelineRoute,
  AI_ANSWER_FEEDBACK: processAiAnswerFeedbackPipelineRoute,
  AI_ANSWER: processAiAnswerPipelineRoute,
} as const;

const processContentPipelineRouterJob = async (job: PipelineRouterJobData) => {
  const handler = contentPipelineRouterHandlers[job.contentType] as (
    routeJob: typeof job,
  ) => Promise<void>;

  await handler(job);
};

export default processContentPipelineRouterJob;
