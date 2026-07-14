type PipelineRouterJobName =
  | "QUESTION"
  | "ANSWER"
  | "REPLY"
  | "AI_ANSWER_FEEDBACK";

type QuestionPipelineRouterJob = {
  contentType: "QUESTION";
  contentId: string;
  version: number;
};

type NonQuestionPipelineRouterJob = {
  contentType: Exclude<PipelineRouterJobName, "QUESTION">;
  contentId: string;
  moderationRevision?: number;
};

type PipelineRouterJobData =
  | QuestionPipelineRouterJob
  | NonQuestionPipelineRouterJob;

const assertPipelineRouterJobName = (
  jobName: string,
): PipelineRouterJobName => {
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

const normalizePipelineRouterJobData = ({
  jobName,
  contentId,
  version,
  moderationRevision,
}: {
  jobName: string;
  contentId: unknown;
  version?: unknown;
  moderationRevision?: unknown;
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
  PipelineRouterJobData,
  PipelineRouterJobName,
  QuestionPipelineRouterJob,
};
