type ModerationStatus = "PENDING" | "APPROVED" | "FLAGGED" | "REJECTED";
type TopicStatus = "PENDING" | "PROCESSING" | "VALID" | "OFF_TOPIC";
type EmbeddingStatus = "NONE" | "PENDING" | "PROCESSING" | "READY";

type CurrentQuestionVersionState = {
  currentVersion: number;
  moderationStatus: ModerationStatus;
  moderationUpdatedAt: Date | null;
  moderationSourceVersion: number | null;
  topicStatus: TopicStatus;
  embeddingStatus: EmbeddingStatus;
};

type QueuedQuestionVersionSnapshot = {
  moderationStatus?: ModerationStatus;
  moderationUpdatedAt?: Date | null;
  topicStatus?: TopicStatus;
  embeddingStatus?: EmbeddingStatus;
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
  const isCurrentLiveVersion = Number(currentQuestion.currentVersion) === nextVersion;
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
    topicStatus: isCurrentLiveVersion
      ? (currentQuestion.topicStatus ?? queuedSnapshot.topicStatus ?? "PENDING")
      : (queuedSnapshot.topicStatus ?? "PENDING"),
    embeddingStatus: isCurrentLiveVersion
      ? (currentQuestion.embeddingStatus ?? queuedSnapshot.embeddingStatus ?? "NONE")
      : (queuedSnapshot.embeddingStatus ?? "NONE"),
  };
};

export { resolveQuestionVersionSeedState };

export type {
  CurrentQuestionVersionState,
  QueuedQuestionVersionSnapshot,
};
