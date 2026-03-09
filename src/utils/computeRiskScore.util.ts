const computeRiskScore = (
  aiConfidence: number,
  severity: number,
  totalStrikes: number,
  trustScore: number,
) => {
  const normalizedSeverity = Math.min(1, severity / 100);

  const strikeMultiplier = 1 + totalStrikes * 0.25;

  const trustMultiplier = 1 / Math.max(trustScore, 0.01);

  let riskScore =
    normalizedSeverity * aiConfidence * strikeMultiplier * trustMultiplier * 10;

  return Math.min(riskScore, 10);
};

export default computeRiskScore;
