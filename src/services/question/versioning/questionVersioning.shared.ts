type ModerationStatus = "PENDING" | "APPROVED" | "FLAGGED" | "REJECTED";

type ProcessQuestionVersioningJobData = {
  questionId: string;
  intendedVersion: number;
  userId: string;
  title: string;
  body: string;
  tags: string[];
  moderationStatus: ModerationStatus;
  moderationUpdatedAt: Date | null;
  basedOnVersion?: number;
};

type CurrentQuestionVersionState = {
  currentVersion: number;
  moderationStatus: ModerationStatus;
  moderationUpdatedAt: Date | null;
  moderationSourceVersion: number | null;
};

type QueuedQuestionVersionSnapshot = {
  moderationStatus?: ModerationStatus;
  moderationUpdatedAt?: Date | null;
};

const assertProcessQuestionVersioningJobData = (
  data: ProcessQuestionVersioningJobData,
) => {
  if (!data.questionId) throw new Error("Missing questionId");
  if (!data.userId) throw new Error("Missing userId");
  if (!data.title) throw new Error("Missing title");
  if (data.body === undefined) throw new Error("Missing body");
  if (!Array.isArray(data.tags)) throw new Error("Missing tags");
  if (data.intendedVersion === undefined || Number(data.intendedVersion) < 1) {
    throw new Error("Invalid intendedVersion");
  }
};

const isRetryableQuestionVersioningError = (error: unknown) => {
  const code = (error as { code?: number })?.code;
  if (code === 11000) return true;

  const hasErrorLabel = (
    error as { hasErrorLabel?: (label: string) => boolean }
  )?.hasErrorLabel;

  if (typeof hasErrorLabel === "function") {
    if (hasErrorLabel("TransientTransactionError")) return true;
    if (hasErrorLabel("UnknownTransactionCommitResult")) return true;
  }

  return false;
};

const resolveQuestionVersionSeedState = ({
  currentQuestion,
  nextVersion,
  queuedSnapshot,
}: {
  currentQuestion: CurrentQuestionVersionState;
  nextVersion: number;
  queuedSnapshot: QueuedQuestionVersionSnapshot;
}) => {
  const isCurrentLiveVersion =
    Number(currentQuestion.currentVersion) === nextVersion;
  const shouldInheritParentModeration =
    Number(currentQuestion.moderationSourceVersion) === nextVersion;

  return {
    isCurrentLiveVersion,
    moderationStatus: shouldInheritParentModeration
      ? (currentQuestion.moderationStatus ??
        queuedSnapshot.moderationStatus ??
        "PENDING")
      : (queuedSnapshot.moderationStatus ?? "PENDING"),
    moderationUpdatedAt: shouldInheritParentModeration
      ? (currentQuestion.moderationUpdatedAt ??
        queuedSnapshot.moderationUpdatedAt ??
        null)
      : (queuedSnapshot.moderationUpdatedAt ?? null),
  };
};

export {
  assertProcessQuestionVersioningJobData,
  isRetryableQuestionVersioningError,
  resolveQuestionVersionSeedState,
};

export type {
  CurrentQuestionVersionState,
  ProcessQuestionVersioningJobData,
  QueuedQuestionVersionSnapshot,
};
