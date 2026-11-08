type PipelineRouterJobName =
  | "QUESTION"
  | "ANSWER"
  | "REPLY"
  | "AI_ANSWER_FEEDBACK"
  | "AI_ANSWER";

type QuestionPipelineRouterJob = {
  contentType: "QUESTION";
  contentId: string;
  version: number;
};

type NonQuestionPipelineRouterJob = {
  contentType: Exclude<PipelineRouterJobName, "QUESTION" | "AI_ANSWER">;
  contentId: string;
  moderationRevision?: number;
};

type AiAnswerPipelineRouterJob = {
  contentType: "AI_ANSWER";
  contentId: string;
  routeKey?: string;
};

type PipelineRouterJobData =
  | QuestionPipelineRouterJob
  | AiAnswerPipelineRouterJob
  | NonQuestionPipelineRouterJob;

type ModeratablePipelineRouterJobData =
  | QuestionPipelineRouterJob
  | NonQuestionPipelineRouterJob;

const assertPipelineRouterJobName = (
  jobName: string,
): PipelineRouterJobName => {
  if (
    jobName === "QUESTION" ||
    jobName === "ANSWER" ||
    jobName === "REPLY" ||
    jobName === "AI_ANSWER_FEEDBACK" ||
    jobName === "AI_ANSWER"
  ) {
    return jobName;
  }

  throw new Error(`Invalid content pipeline router job type: ${jobName}`);
};

const normalizePipelineRouterJobData = ({
  jobName,
  contentId,
  version,
  moderationRevision,
  routeKey,
}: {
  jobName: string;
  contentId: unknown;
  version?: unknown;
  moderationRevision?: unknown;
  routeKey?: unknown;
}): PipelineRouterJobData => {
  const contentType = assertPipelineRouterJobName(jobName);

  if (typeof contentId !== "string" || contentId.length === 0) {
    throw new Error("Missing content pipeline router contentId");
  }

  if (contentType === "QUESTION") {
    if (typeof version !== "number") {
      throw new Error("QUESTION content pipeline router job requires version");
    }

    return {
      contentType,
      contentId,
      version,
    };
  }

  if (contentType === "AI_ANSWER") {
    return {
      contentType,
      contentId,
      routeKey: typeof routeKey === "string" ? routeKey : undefined,
    };
  }

  return {
    contentType,
    contentId,
    moderationRevision:
      typeof moderationRevision === "number" ? moderationRevision : undefined,
  };
};

export { assertPipelineRouterJobName, normalizePipelineRouterJobData };

export type {
  NonQuestionPipelineRouterJob,
  AiAnswerPipelineRouterJob,
  ModeratablePipelineRouterJobData,
  PipelineRouterJobData,
  PipelineRouterJobName,
  QuestionPipelineRouterJob,
};
