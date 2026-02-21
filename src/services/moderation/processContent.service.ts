import aiModerateContent from "./aiModeration.service.js";
import applyAiModerationDecisionService from "./applyAiModerationDecision.service.js";

import HttpError from "../../utils/httpError.util.js";

import computeRiskScore from "../../utils/computeRiskScore.util.js";
import calculateTempBanMs from "../../utils/calculateTempBanMs.util.js";
import publishSocketEvent from "../../utils/publishSocketEvent.util.js";

import Question from "../../models/question.model.js";
import Answer from "../../models/answer.model.js";
import Reply from "../../models/reply.model.js";
import QuestionVersion from "../../models/questionVersion.model.js";

import prisma from "../../config/prisma.config.js";

import { ContentType } from "../../generated/prisma/index.js";

import { getRedisPub } from "../../redis/redis.pubsub.js";

import moderationMetricsQueue from "../../queues/moderationMetrics.queue.js";

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
  const content = await (
    contentType === "Question"
      ? QuestionVersion.findOne({ questionId: contentId, version })
      : contentType === "Answer"
        ? Answer.findById(contentId)
        : Reply.findById(contentId)
  );

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

  if (aiDecision === "BAN_PERM") {
    await prisma.$transaction(async (tx) => {
      const newStrike = await tx.moderationStrike.create({
        data: {
          userId: content.userId as string,
          aiDecision,
          aiConfidence,
          aiReasons,
          severity,
          riskScore,
          targetContentId: contentId,
          targetType: moderationContentTypeMap[contentType],
          targetContentVersion: version,
          strikedBy: "AI_MODERATION",
        },
      });

      await moderationMetricsQueue.add("BAN_PERM", {
        userId: content.userId as string,
      });

      await publishSocketEvent(
        content.userId as string,
        "strikeReceived",
        newStrike,
      );
    });
  } else if (aiDecision === "BAN_TEMP") {
    const tempBanMs = calculateTempBanMs(
      severity,
      aiConfidence,
      totalStrikes,
      trustScore,
    );

    await prisma.$transaction(async (tx) => {
      const newBan = await tx.ban.create({
        data: {
          userId: content.userId as string,
          title: "Temporary Account Suspension",
          reasons: aiReasons,
          banType: "TEMP",
          severity,
          bannedBy: "AI_MODERATION",
          expiresAt: new Date(Date.now() + tempBanMs),
          durationMs: tempBanMs,
        },
      });

      await tx.moderationStrike.create({
        data: {
          userId: content.userId as string,
          aiDecision,
          aiConfidence,
          aiReasons,
          severity,
          riskScore,
          targetContentId: contentId,
          targetType: moderationContentTypeMap[contentType],
          targetContentVersion: version,
          strikedBy: "AI_MODERATION",
        },
      });

      await tx.user.update({
        where: { id: content.userId as string },
        data: { status: "SUSPENDED" },
      });

      await applyAiModerationDecisionService(
        contentId,
        contentType,
        "REJECTED",
        contentType === "Question" ? (content.version as number) : undefined,
      );

      await removeTargetContent(contentId, contentType);

      await moderationMetricsQueue.add("BAN_TEMP", {
        userId: content.userId as string,
      });

      await publishSocketEvent(content.userId as string, "banUser", newBan);

      getRedisPub().publish(
        "socket:disconnect",
        JSON.stringify(content.userId as string),
      );
    });
  } else if (aiDecision === "WARN") {
    const title =
      aiReasons.length > 0 ? `${aiReasons[0]}` : "Community Guideline Warning";

    await prisma.$transaction(async (tx) => {
      const newWarning = await tx.warning.create({
        data: {
          userId: content.userId as string,
          title,
          reasons: aiReasons,
          severity,
          warnedBy: "AI_MODERATION",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      await tx.moderationStrike.create({
        data: {
          userId: content.userId as string,
          aiDecision,
          aiConfidence,
          aiReasons,
          severity,
          riskScore,
          targetContentId: contentId,
          targetType: moderationContentTypeMap[contentType],
          targetContentVersion: version,
          strikedBy: "AI_MODERATION",
        },
      });

      await applyAiModerationDecisionService(
        contentId,
        contentType,
        "FLAGGED",
        contentType === "Question" ? (content.version as number) : undefined,
      );

      await moderationMetricsQueue.add("WARN", {
        userId: content.userId as string,
      });

      publishSocketEvent(content.userId as string, "warn", newWarning);
    });
  } else if (aiDecision === "IGNORE") {
    await applyAiModerationDecisionService(
      contentId,
      contentType,
      "APPROVED",
      contentType === "Question" ? (content.version as number) : undefined,
    );
  }
};

export default processContent;
