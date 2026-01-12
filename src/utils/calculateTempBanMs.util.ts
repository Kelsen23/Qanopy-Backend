const calculateTempBanMs = (severity: number, confidence: number): number => {
  if (severity < 70) return 0;

  const baseDays = 3 + ((severity - 70) / 19) * 4;
  const adjustedDays = baseDays * (1 + confidence * 0.5);
  return Math.round(adjustedDays * 24 * 60 * 60 * 1000);
};

export default calculateTempBanMs;
