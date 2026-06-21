import crypto from "crypto";

import aiModerateContent from "./aiModeration.service.js";
import loadModerationContent from "./loadModerationContent.service.js";
import handleContentModerationBan from "./handleContentModerationBan.service.js";
import handleContentModerationWarn from "./handleContentModerationWarn.service.js";
import handleContentModerationIgnore from "./handleContentModerationIgnore.service.js";
import {
  buildContentFields,
  mapSeverityToDecision,
  resolveFinalModerationDecision,
  type ModeratableContentType,
} from "./contentModeration.shared.js";

import prisma from "../../../config/prisma.config.js";

import computeRiskScore from "../../../utils/moderation/computeRiskScore.util.js";
import calculateTempBanMs from "../../../utils/moderation/calculateTempBanMs.util.js";

const processContent = async (
  contentId: string,
  contentType: ModeratableContentType,
  versionOrRevision?: number,
) => {
  const loadedContent = await loadModerationContent(
    contentId,
    contentType,
    versionOrRevision,
  );

  if (!loadedContent) return;

  const content = loadedContent.content;

  if (contentType !== "QUESTION") if (!content.isActive) return;

  if (content.moderationStatus !== "PENDING") return;

  const contentFields = buildContentFields(content);

  const aiModerationResult = await aiModerateContent(contentFields);

  if (!aiModerationResult.ok) {
    console.warn("[processContent] AI moderation skipped due to failure", {
      contentId,
      contentType,
      versionOrRevision,
    });

    throw new Error("AI moderation unavailable");
  }

  const {
    confidence: aiConfidence,
    reasons: aiReasons,
    severity,
    recommendedAction,
    flagged,
    primaryCategory,
  } = aiModerationResult;

  const userStats = await prisma.moderationStats.findUnique({
    where: { userId: content.userId as string },
    select: { totalStrikes: true, trustScore: true },
  });

  const totalStrikes = userStats?.totalStrikes ?? 0;
  const trustScore = userStats?.trustScore ?? 1;

  const riskScore = computeRiskScore(
    aiConfidence,
    severity,
    totalStrikes,
    trustScore,
  );

  const riskDecision = mapSeverityToDecision(riskScore);
  const finalDecision = resolveFinalModerationDecision({
    recommendedAction,
    riskDecision,
    primaryCategory,
    confidence: aiConfidence,
  });
  const tempBanDurationMs = calculateTempBanMs(
    severity,
    aiConfidence,
    totalStrikes,
    trustScore,
  );

  const decisionId = crypto.randomUUID();

  const baseMeta = {
    targetContentId: contentId,
    targetContentType: contentType,
    targetContentVersion:
      contentType === "QUESTION" ? versionOrRevision : undefined,
    targetContentRevision:
      contentType === "QUESTION"
        ? undefined
        : ((content as { moderationRevision?: number }).moderationRevision ??
          undefined),

    aiDecision: finalDecision,
    aiRiskDecision: riskDecision,
    aiRecommendedAction: recommendedAction,
    aiFlagged: flagged,
    aiPrimaryCategory: primaryCategory,
    aiConfidence,
    aiReasons,
    severity,
    riskScore,
  };

  const targetVersionOrRevision =
    contentType === "QUESTION"
      ? versionOrRevision
      : ((content as { moderationRevision?: number }).moderationRevision ??
        undefined);

  if (finalDecision === "BAN_PERM" || finalDecision === "BAN_TEMP") {
    await handleContentModerationBan({
      contentId,
      contentType,
      versionOrRevision: targetVersionOrRevision,
      finalDecision,
      aiConfidence,
      aiReasons,
      severity,
      riskScore,
      tempBanDurationMs,
      baseMeta,
      decisionId,
      content,
    });

    return;
  }

  if (finalDecision === "WARN") {
    await handleContentModerationWarn({
      contentId,
      contentType,
      versionOrRevision: targetVersionOrRevision,
      aiReasons,
      severity,
      baseMeta,
      decisionId,
      content,
    });

    return;
  }

  await handleContentModerationIgnore({
    contentId,
    contentType,
    versionOrRevision: targetVersionOrRevision,
    baseMeta,
    decisionId,
    content,
  });
};

export default processContent;
