import aiModerateContent from "./aiModeration.service.js";
import applyAiModerationDecisionService from "./applyAiModerationDecision.service.js";

import HttpError from "../../utils/httpError.util.js";
import queueNotification from "../../utils/queueNotification.util.js";

import computeRiskScore from "../../utils/computeRiskScore.util.js";
import calculateTempBanMs from "../../utils/calculateTempBanMs.util.js";

import Question from "../../models/question.model.js";
import Answer from "../../models/answer.model.js";
import Reply from "../../models/reply.model.js";
import QuestionVersion from "../../models/questionVersion.model.js";

import prisma from "../../config/prisma.config.js";

import { ContentType } from "../../generated/prisma/index.js";

import { getRedisPub } from "../../redis/redis.pubsub.js";

import moderationMetricsQueue from "../../queues/moderationMetrics.queue.js";
import moderationAuditQueue from "../../queues/moderationAudit.queue.js";

import crypto from "crypto";

const mapSeverityToDecision = (riskScore: number) => {
  if (riskScore >= 6.0) return "BAN_PERM";
  if (riskScore >= 3.0) return "BAN_TEMP";
  if (riskScore > 0) return "WARN";
  return "IGNORE";
};

const moderationContentTypeMap: Record<
  "Question" | "Answer" | "Reply",
  ContentType
> = {
  Question: ContentType.QUESTION,
  Answer: ContentType.ANSWER,
  Reply: ContentType.REPLY,
};

async function removeTargetContent(
  contentId: string,
  contentType: "Question" | "Answer" | "Reply",
) {
  switch (contentType) {
    case "Question":
      await Question.findByIdAndUpdate(contentId, { isActive: false });
      break;
    case "Answer":
      await Answer.findByIdAndUpdate(contentId, { isActive: false });
      break;
    case "Reply":
      await Reply.findByIdAndUpdate(contentId, { isActive: false });
      break;
  }
}

const processContent = async (
  contentId: string,
  contentType: "Question" | "Answer" | "Reply",
  version?: number,
) => {
  const content = await (contentType === "Question"
    ? QuestionVersion.findOne({ questionId: contentId, version })
    : contentType === "Answer"
      ? Answer.findById(contentId)
      : Reply.findById(contentId));

  if (!content) throw new HttpError("Content not found", 404);

  if (contentType !== "Question")
    if (!content.isActive) throw new HttpError("Content not found", 404);

  if (content.moderationStatus !== "PENDING")
    throw new HttpError("Content already moderated", 500);

  const contentFields = `Title: ${content.title || ""}\nBody: ${content.body || ""}`;

  const {
    confidence: aiConfidence,
    reasons: aiReasons,
    severity,
  } = await aiModerateContent(contentFields);

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

  const aiDecision = mapSeverityToDecision(riskScore);

  const decisionId = crypto.randomUUID();

  if (aiDecision === "BAN_PERM") {
    const newStrike = await prisma.$transaction(async (tx) => {
      const createdStrike = await tx.moderationStrike.create({
        data: {
          userId: content.userId as string,
          aiDecision,
          aiConfidence,
          aiReasons,
          severity,
          riskScore,
          targetContentId: contentId,
          targetType: moderationContentTypeMap[contentType],
          targetContentVersion: version as number,
          strikedBy: "AI_MODERATION",
        },
      });

      return createdStrike;
    });

    const meta = {
      strikeId: newStrike.id,
      targetContentId: contentId,
      targetType: moderationContentTypeMap[contentType],
      targetContentVersion: version,
      aiDecision,
      aiConfidence,
      aiReasons,
      severity,
      riskScore,
    };

    await moderationAuditQueue.add("modActionLog", {
      decisionId,
      targetType: "User",
      targetId: content.userId,
      targetUserId: content.userId,
      actorType: "AI_MODERATION",
      actionTaken: "BAN_PERM",
      meta,
    });

    await queueNotification({
      userId: newStrike.userId,
      type: "STRIKE",
      referenceId: newStrike.id,
      meta,
    });

    await moderationMetricsQueue.add("BAN_PERM", {
      userId: content.userId as string,
    });
  } else if (aiDecision === "BAN_TEMP") {
    const tempBanMs = calculateTempBanMs(
      severity,
      aiConfidence,
      totalStrikes,
      trustScore,
    );
    const tempBanExpiresAt = new Date(Date.now() + tempBanMs);

    const newBan = await prisma.$transaction(async (tx) => {
      const existingPermBan = await tx.ban.findFirst({
        where: {
          userId: content.userId as string,
          banType: "PERM",
        },
        select: { id: true },
      });

      if (existingPermBan)
        throw new HttpError("User already permanently banned", 409);

      const existingTempBan = await tx.ban.findFirst({
        where: {
          userId: content.userId as string,
          banType: "TEMP",
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });

      if (existingTempBan)
        throw new HttpError("User already has an active temporary ban", 409);

      const createdBan = await tx.ban.create({
        data: {
          userId: content.userId as string,
          title: "Temporary Account Suspension",
          reasons: aiReasons,
          banType: "TEMP",
          severity,
          bannedBy: "AI_MODERATION",
          expiresAt: tempBanExpiresAt,
          durationMs: tempBanMs,
        },
      });

      await tx.user.update({
        where: { id: content.userId as string },
        data: { status: "SUSPENDED" },
      });

      return createdBan;
    });

    await applyAiModerationDecisionService(
      contentId,
      contentType,
      "REJECTED",
      contentType === "Question" ? (content.version as number) : undefined,
    );

    await removeTargetContent(contentId, contentType);

    const meta = {
      banId: newBan.id,
      targetContentId: contentId,
      targetType: moderationContentTypeMap[contentType],
      targetContentVersion: version,
      aiDecision,
      aiConfidence,
      aiReasons,
      severity,
      riskScore,
      expiresAt: tempBanExpiresAt,
      durationMs: tempBanMs,
    };

    await moderationAuditQueue.add("modActionLog", {
      decisionId,
      targetType: "User",
      targetId: content.userId,
      targetUserId: content.userId,
      actorType: "AI_MODERATION",
      actionTaken: "BAN_TEMP",
      meta,
    });

    await queueNotification({
      userId: content.userId as string,
      type: "STRIKE",
      referenceId: newBan.id,
      meta,
    });

    await moderationMetricsQueue.add("BAN_TEMP", {
      userId: content.userId as string,
    });

    getRedisPub().publish(
      "socket:disconnect",
      JSON.stringify(content.userId as string),
    );
  } else if (aiDecision === "WARN") {
    const title =
      aiReasons.length > 0 ? `${aiReasons[0]}` : "Community Guideline Warning";
    const warningExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const newWarning = await prisma.warning.create({
      data: {
        userId: content.userId as string,
        title,
        reasons: aiReasons,
        severity,
        warnedBy: "AI_MODERATION",
        expiresAt: warningExpiresAt,
      },
    });

    await applyAiModerationDecisionService(
      contentId,
      contentType,
      "FLAGGED",
      contentType === "Question" ? (content.version as number) : undefined,
    );

    const meta = {
      warningId: newWarning.id,
      targetContentId: contentId,
      targetType: moderationContentTypeMap[contentType],
      targetContentVersion: version,
      aiDecision,
      aiConfidence,
      aiReasons,
      severity,
      riskScore,
      expiresAt: warningExpiresAt,
    };

    await moderationAuditQueue.add("modActionLog", {
      decisionId,
      targetType: "User",
      targetId: content.userId,
      targetUserId: content.userId,
      actorType: "AI_MODERATION",
      actionTaken: "WARN",
      meta,
    });

    await queueNotification({
      userId: newWarning.userId,
      type: "WARN",
      referenceId: newWarning.id,
      meta,
    });

    await moderationMetricsQueue.add("WARN", {
      userId: content.userId as string,
    });
  } else if (aiDecision === "IGNORE") {
    await applyAiModerationDecisionService(
      contentId,
      contentType,
      "APPROVED",
      contentType === "Question" ? (content.version as number) : undefined,
    );

    const meta = {
      targetContentId: contentId,
      targetType: moderationContentTypeMap[contentType],
      targetContentVersion: version,
      aiDecision,
      aiConfidence,
      aiReasons,
      severity,
      riskScore,
    };

    await moderationAuditQueue.add("modActionLog", {
      decisionId,
      targetType: "User",
      targetId: content.userId,
      targetUserId: content.userId,
      actorType: "AI_MODERATION",
      actionTaken: "IGNORE",
      meta,
    });

    await moderationMetricsQueue.add("IGNORE", {
      userId: content.userId as string,
    });
  }
};

export default processContent;
