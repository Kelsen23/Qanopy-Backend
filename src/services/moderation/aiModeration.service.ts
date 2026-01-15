import client from "../../config/openai.config.js";

interface AiModerationResult {
  confidence: number;
  reasons: string[];
  severity: number;
}

const aiModerateReport = async (
  content: string,
): Promise<AiModerationResult> => {
  try {
    const response = await client.moderations.create({
      model: "omni-moderation-latest",
      input: content,
    });

    const result = response.results[0];
    let maxConfidence = 0;
    let severity = 0;
    const reasons: string[] = [];

    if (!result.flagged) {
      maxConfidence = 1;
      severity = 0;
      reasons.push("No violations detected");
    } else {
      const hateScore = Math.max(
        result.category_scores["harassment"] || 0,
        result.category_scores["harassment/threatening"] || 0,
        result.category_scores["hate"] || 0,
        result.category_scores["hate/threatening"] || 0,
      );
      if (hateScore > 0) {
        maxConfidence = Math.max(maxConfidence, hateScore);

        reasons.push("Hate/Harassment detected");

        severity = Math.max(severity, Math.round(hateScore * 100));
      }

      const violenceScore = Math.max(
        result.category_scores["sexual"] || 0,
        result.category_scores["sexual/minors"] || 0,
        result.category_scores["violence"] || 0,
        result.category_scores["violence/graphic"] || 0,
      );
      if (violenceScore > 0) {
        maxConfidence = Math.max(maxConfidence, violenceScore);

        reasons.push("Inappropriate/Violent content detected");

        severity = Math.max(severity, Math.round(violenceScore * 120));
      }

      if (severity === 0) {
        reasons.push("Flagged but unclear");
        severity = 50;
      }
    }

    return { confidence: maxConfidence, reasons, severity };
  } catch (error: any) {
    console.error("AI moderation error:", error);
    return { confidence: 0, reasons: [], severity: 50 };
  }
};

export default aiModerateReport;
