type ContentModerationJobName =
  | "QUESTION"
  | "ANSWER"
  | "REPLY"
  | "AI_ANSWER_FEEDBACK";

type ModerationActionJobName = "BAN_PERM" | "BAN_TEMP" | "WARN" | "IGNORE";

const createWorkerEventHandlers = (workerName: string) => ({
  completed: (job: { id?: string | number }) => {
    console.log(`[${workerName}] Job ${job.id} completed`);
  },
  failed: (job: { id?: string | number } | undefined, err: unknown) => {
    console.error(`[${workerName}] Job ${job?.id} failed:`, err);
  },
  error: (err: unknown) => {
    console.error(`[${workerName}] Worker crashed:`, err);
  },
});

const assertContentModerationJobName = (
  name: string,
): ContentModerationJobName => {
  if (
    name === "QUESTION" ||
    name === "ANSWER" ||
    name === "REPLY" ||
    name === "AI_ANSWER_FEEDBACK"
  ) {
    return name;
  }

  throw new Error(`Unsupported moderation job type: ${name}`);
};

const assertModerationActionJobName = (
  name: string,
): ModerationActionJobName => {
  if (
    name === "BAN_PERM" ||
    name === "BAN_TEMP" ||
    name === "WARN" ||
    name === "IGNORE"
  ) {
    return name;
  }

  throw new Error(`Unsupported moderation action job type: ${name}`);
};

const getModerationRevisionFromJob = (
  contentType: ContentModerationJobName,
  jobData: { version?: number; moderationRevision?: number },
) =>
  contentType === "QUESTION" ? jobData.version : jobData.moderationRevision;

export type { ContentModerationJobName, ModerationActionJobName };

export {
  createWorkerEventHandlers,
  assertContentModerationJobName,
  assertModerationActionJobName,
  getModerationRevisionFromJob,
};
