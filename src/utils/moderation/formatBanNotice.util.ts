const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MS_PER_MINUTE = 60_000;

const pluralize = (value: number, unit: string) =>
  `${value} ${unit}${value === 1 ? "" : "s"}`;

const formatBanDurationBreakdown = (banDurationMs?: number) => {
  if (!banDurationMs || banDurationMs <= 0) {
    return "Temporary";
  }

  const totalMinutes = Math.max(1, Math.floor(banDurationMs / MS_PER_MINUTE));
  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const remainingMinutesAfterDays = totalMinutes % MINUTES_PER_DAY;
  const hours = Math.floor(remainingMinutesAfterDays / MINUTES_PER_HOUR);
  const minutes = remainingMinutesAfterDays % MINUTES_PER_HOUR;

  const parts = [
    days > 0 ? pluralize(days, "day") : null,
    hours > 0 ? pluralize(hours, "hour") : null,
    minutes > 0 ? pluralize(minutes, "minute") : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(", ") : "1 minute";
};

const formatBanNoticeExpiryUtc = (expiresAt: Date) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });

  return `${formatter.format(expiresAt)} UTC`;
};

export { formatBanDurationBreakdown, formatBanNoticeExpiryUtc };
