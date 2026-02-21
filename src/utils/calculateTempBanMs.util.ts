const calculateTempBanMs = (
  severity: number,
  confidence: number,
  totalStrikes: number,
  trustScore: number,
): number => {
  if (severity < 70) return 0;

  const baseDays = 3 + ((severity - 70) / 30) * 4;

  const confidenceMultiplier = 1 + confidence * 0.5;

  const strikeMultiplier = 1 + totalStrikes * 0.25;

  const trustMultiplier = 1 / Math.max(trustScore, 0.01);

  const adjustedDays =
    baseDays * confidenceMultiplier * strikeMultiplier * trustMultiplier;

  return Math.round(adjustedDays * 24 * 60 * 60 * 1000);
};

export default calculateTempBanMs;
