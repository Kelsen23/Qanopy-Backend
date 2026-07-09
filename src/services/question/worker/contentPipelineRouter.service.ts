import answerPipelineRouterService from "../pipelineRouter/answerPipelineRouter.service.js";
import aiAnswerFeedbackPipelineRouterService from "../pipelineRouter/aiAnswerFeedbackPipelineRouter.service.js";
import questionPipelineRouterService from "../pipelineRouter/questionPipelineRouter.service.js";
import replyPipelineRouterService from "../pipelineRouter/replyPipelineRouter.service.js";

type ContentPipelineRouterJobName =
  | "QUESTION"
  | "ANSWER"
  | "REPLY"
  | "AI_ANSWER_FEEDBACK";

const assertContentPipelineRouterJobName = (
  jobName: string,
): ContentPipelineRouterJobName => {
  if (
    jobName === "QUESTION" ||
    jobName === "ANSWER" ||
    jobName === "REPLY" ||
    jobName === "AI_ANSWER_FEEDBACK"
  ) {
    return jobName;
  }

  throw new Error(`Invalid content pipeline router job type: ${jobName}`);
};

const processContentPipelineRouterJob = async (
  contentType: ContentPipelineRouterJobName,
  contentId: string,
  version?: number,
  moderationRevision?: number,
) => {
  switch (contentType) {
    case "QUESTION":
      await questionPipelineRouterService(contentId, version as number);
      break;
    case "ANSWER":
      await answerPipelineRouterService(contentId, moderationRevision);
      break;
    case "REPLY":
      await replyPipelineRouterService(contentId, moderationRevision);
      break;
    case "AI_ANSWER_FEEDBACK":
      await aiAnswerFeedbackPipelineRouterService(
        contentId,
        moderationRevision,
      );
      break;
  }
};

export default processContentPipelineRouterJob;
export { assertContentPipelineRouterJobName };
