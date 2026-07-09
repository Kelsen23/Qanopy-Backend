type ContentFinalizeJobName =
  | "QUESTION"
  | "ANSWER"
  | "REPLY"
  | "AI_ANSWER_FEEDBACK";

type ContentFinalizeJobData = {
  userId: string;
  entityId: string;
  version?: number;
  basedOnVersion?: number;
  title?: string;
  body?: string;
  tags?: string[];
  moderationStatus?: string;
  moderationUpdatedAt?: Date | null;
  topicStatus?: string;
  embeddingStatus?: string;
};

type MutableBodyEntity = {
  _id: string;
  body?: string | null;
  moderationRevision?: number | null;
  save: () => Promise<unknown>;
};

const assertContentFinalizeJobName = (
  jobName: string,
): ContentFinalizeJobName => {
  if (
    jobName === "QUESTION" ||
    jobName === "ANSWER" ||
    jobName === "REPLY" ||
    jobName === "AI_ANSWER_FEEDBACK"
  ) {
    return jobName;
  }

  throw new Error(`Invalid job type: ${jobName}`);
};

const assertQuestionFinalizeSnapshot = (data: ContentFinalizeJobData) => {
  if (
    data.version === undefined ||
    data.title === undefined ||
    data.body === undefined ||
    !Array.isArray(data.tags)
  ) {
    throw new Error("Missing question finalize snapshot");
  }
};

export type {
  ContentFinalizeJobData,
  ContentFinalizeJobName,
  MutableBodyEntity,
};

export { assertContentFinalizeJobName, assertQuestionFinalizeSnapshot };
