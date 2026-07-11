type ContentPipelineRouterJobName =
  | "QUESTION"
  | "ANSWER"
  | "REPLY"
  | "AI_ANSWER_FEEDBACK";

type QuestionContentPipelineRouterJob = {
  contentType: "QUESTION";
  contentId: string;
  version: number;
};

type NonQuestionContentPipelineRouterJob = {
  contentType: Exclude<ContentPipelineRouterJobName, "QUESTION">;
  contentId: string;
  moderationRevision?: number;
};

type ContentPipelineRouterJobData =
  | QuestionContentPipelineRouterJob
  | NonQuestionContentPipelineRouterJob;

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

const normalizeContentPipelineRouterJobData = ({
  jobName,
  contentId,
  version,
  moderationRevision,
}: {
  jobName: string;
  contentId: unknown;
  version?: unknown;
  moderationRevision?: unknown;
}): ContentPipelineRouterJobData => {
  const contentType = assertContentPipelineRouterJobName(jobName);

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

export {
  assertContentPipelineRouterJobName,
  normalizeContentPipelineRouterJobData,
};

export type {
  ContentPipelineRouterJobData,
  ContentPipelineRouterJobName,
  NonQuestionContentPipelineRouterJob,
  QuestionContentPipelineRouterJob,
};
