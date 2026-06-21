type ModerationNotificationAction = "WARN" | "BAN_TEMP" | "BAN_PERM";

const buildAiModerationNotificationMeta = ({
  action,
  reasons,
  expiresAt,
}: {
  action: ModerationNotificationAction;
  reasons: string[];
  expiresAt?: Date;
}) => ({
  actionTaken: action,
  reasons,
  expiresAt: expiresAt?.toISOString(),
});

export default buildAiModerationNotificationMeta;
