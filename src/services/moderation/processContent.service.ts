import crypto from "crypto";

import { ContentType } from "../../generated/prisma/index.js";

import aiModerateContent from "./aiModeration.service.js";
import applyContentModerationDecisionService from "./applyContentModerationDecision.service.js";
import routeNotification from "../notification/routeNotification.service.js";

import prisma from "../../config/prisma.config.js";

import { makeJobId } from "../../utils/makeJobId.util.js";
import computeRiskScore from "../../utils/computeRiskScore.util.js";
import { clearStrikesCache } from "../../utils/clearCache.util.js";

import Question from "../../models/question.model.js";
import Answer from "../../models/answer.model.js";
import Reply from "../../models/reply.model.js";
import QuestionVersion from "../../models/questionVersion.model.js";
import AiAnswerFeedback from "../../models/aiAnswerFeedback.model.js";

import moderationMetricsQueue from "../../queues/moderationMetrics.queue.js";
import moderationAuditQueue from "../../queues/moderationAudit.queue.js";
import contentPipelineRouter from "../../queues/contentPipelineRouter.queue.js";

const mapSeverityToDecision = (riskScore: number) => {
  if (riskScore >= 6.0) return "BAN_PERM";
  if (riskScore >= 3.0) return "BAN_TEMP";
  if (riskScore > 0) return "WARN";
  return "IGNORE";
};

const moderationContentTypeMap: Record<
  "QUESTION" | "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK",
  ContentType
> = {
  QUESTION: ContentType.QUESTION,
  ANSWER: ContentType.ANSWER,
  REPLY: ContentType.REPLY,
  AI_ANSWER_FEEDBACK: ContentType.AI_ANSWER_FEEDBACK,
};

const isAiModerationTargetStillPending = async (
  contentId: string,
  contentType: "QUESTION" | "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK",
  versionOrRevision?: number,
) => {
  if (contentType === "QUESTION") {
    const foundQuestionVersion = await QuestionVersion.findOne({
      questionId: contentId,
      version: versionOrRevision,
      moderationStatus: "PENDING",
    })
      .select("_id")
      .lean();

    if (!foundQuestionVersion) return false;

    const foundQuestion = await Question.findOne({
      _id: contentId,
      isActive: true,
    })
      .select("_id")
      .lean();

    return Boolean(foundQuestion);
  }

  const model =
    contentType === "ANSWER"
      ? Answer
      : contentType === "REPLY"
        ? Reply
        : AiAnswerFeedback;
  const ContentModel = model as any;

  const foundContent = await ContentModel.findOne({
    _id: contentId,
    moderationStatus: "PENDING",
    moderationRevision: versionOrRevision,
    isActive: true,
  })
    .select("_id")
    .lean();

  return Boolean(foundContent);
};

const processContent = async (
  contentId: string,
  contentType: "QUESTION" | "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK",
  versionOrRevision?: number,
) => {
  const content = await (contentType === "QUESTION"
    ? QuestionVersion.findOne({
        questionId: contentId,
        version: versionOrRevision,
      }).lean()
    : contentType === "ANSWER"
      ? Answer.findById(contentId)
          .select(
            "userId body moderationStatus moderationRevision isActive isDeleted",
          )
          .lean()
      : contentType === "REPLY"
        ? Reply.findById(contentId)
            .select(
              "userId body moderationStatus moderationRevision isActive isDeleted",
            )
            .lean()
        : AiAnswerFeedback.findById(contentId)
            .select(
              "userId body moderationStatus moderationRevision isActive isDeleted",
            )
            .lean());

  if (!content) return;

  if (contentType !== "QUESTION") if (!content.isActive) return;

  if (content.moderationStatus !== "PENDING") return;

  const contentTitle = "title" in content ? String(content.title ?? "") : "";
  const contentBody = "body" in content ? String(content.body ?? "") : "";
  const contentFields = `Title: ${contentTitle}\nBody: ${contentBody}`;

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

    aiDecision,
    aiConfidence,
    aiReasons,
    severity,
    riskScore,
  };

  if (aiDecision === "BAN_PERM") {
    const targetStillPending = await isAiModerationTargetStillPending(
      contentId,
      contentType,
      contentType === "QUESTION"
        ? (versionOrRevision as number | undefined)
        : ((content as { moderationRevision?: number }).moderationRevision ??
            undefined),
    );

    if (!targetStillPending) {
      return;
    }

    const moderationApplyResult = await applyContentModerationDecisionService(
      contentId,
      contentType,
      "REJECTED",
      contentType === "QUESTION"
        ? (versionOrRevision as number | undefined)
        : ((content as { moderationRevision?: number }).moderationRevision ??
            undefined),
    );

    if (!moderationApplyResult.applied) {
      return;
    }

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
          targetContentVersion:
            contentType === "QUESTION"
              ? (versionOrRevision as number | undefined)
              : undefined,
          strikedBy: "AI_MODERATION",
        },
      });

      return createdStrike;
    });
    await clearStrikesCache();

    const meta = {
      ...baseMeta,
      strikeId: newStrike.id,
      action: "BAN_PERM",
    };

    await moderationAuditQueue.add(
      "MOD_ACTION_LOG",
      {
        decisionId,
        targetType: "USER",
        targetId: content.userId,
        targetUserId: content.userId,
        actorType: "AI_MODERATION",
        actionTaken: "BAN_PERM",
        meta,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("moderationAudit", decisionId, "BAN_PERM"),
      },
    );

    await routeNotification({
      recipientId: content.userId as string,
      actorId: "AI_MODERATION",
      event: "STRIKE",
      target: {
        entityType: "USER",
        entityId: content.userId as string,
      },
      meta,
    });
  } else if (aiDecision === "BAN_TEMP") {
    const targetStillPending = await isAiModerationTargetStillPending(
      contentId,
      contentType,
      contentType === "QUESTION"
        ? (versionOrRevision as number | undefined)
        : ((content as { moderationRevision?: number }).moderationRevision ??
            undefined),
    );

    if (!targetStillPending) {
      return;
    }

    const moderationApplyResult = await applyContentModerationDecisionService(
      contentId,
      contentType,
      "REJECTED",
      contentType === "QUESTION"
        ? (versionOrRevision as number | undefined)
        : ((content as { moderationRevision?: number }).moderationRevision ??
            undefined),
    );

    if (!moderationApplyResult.applied) {
      return;
    }

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
          targetContentVersion:
            contentType === "QUESTION"
              ? (versionOrRevision as number | undefined)
              : undefined,
          strikedBy: "AI_MODERATION",
        },
      });

      return createdStrike;
    });
    await clearStrikesCache();

    const meta = {
      ...baseMeta,
      strikeId: newStrike.id,
      action: "BAN_TEMP",
    };

    await moderationAuditQueue.add(
      "MOD_ACTION_LOG",
      {
        decisionId,
        targetType: "USER",
        targetId: content.userId,
        targetUserId: content.userId,
        actorType: "AI_MODERATION",
        actionTaken: "BAN_TEMP",
        meta,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("moderationAudit", decisionId, "BAN_TEMP"),
      },
    );

    await routeNotification({
      recipientId: content.userId as string,
      actorId: "AI_MODERATION",
      event: "STRIKE",
      target: {
        entityType: "USER",
        entityId: content.userId as string,
      },
      meta,
    });
  } else if (aiDecision === "WARN") {
    const moderationApplyResult = await applyContentModerationDecisionService(
      contentId,
      contentType,
      "FLAGGED",
      contentType === "QUESTION"
        ? (versionOrRevision as number | undefined)
        : ((content as { moderationRevision?: number }).moderationRevision ??
            undefined),
    );

    if (!moderationApplyResult.applied) {
      return;
    }

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

    const meta = {
      ...baseMeta,
      warningId: newWarning.id,
      action: "WARN",
      expiresAt: warningExpiresAt,
    };

    await moderationAuditQueue.add(
      "MOD_ACTION_LOG",
      {
        decisionId,
        targetType: "USER",
        targetId: content.userId,
        targetUserId: content.userId,
        actorType: "AI_MODERATION",
        actionTaken: "WARN",
        meta,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("moderationAudit", decisionId, "WARN"),
      },
    );

    await moderationMetricsQueue.add(
      "WARN",
      {
        userId: content.userId as string,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("moderationMetrics", decisionId, "WARN"),
      },
    );

    if (contentType === "QUESTION")
      await contentPipelineRouter.add(
        "QUESTION",
        {
          contentId,
          version: versionOrRevision,
        },
        {
          jobId: makeJobId(
            "contentPipelineRoute",
            contentId,
            versionOrRevision,
          ),
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

    await routeNotification({
      recipientId: content.userId as string,
      actorId: "AI_MODERATION",
      event: "WARN",
      target: {
        entityType: "USER",
        entityId: content.userId as string,
      },
      meta,
    });
  } else if (aiDecision === "IGNORE") {
    const moderationApplyResult = await applyContentModerationDecisionService(
      contentId,
      contentType,
      "APPROVED",
      contentType === "QUESTION"
        ? (versionOrRevision as number | undefined)
        : ((content as { moderationRevision?: number }).moderationRevision ??
            undefined),
    );

    if (!moderationApplyResult.applied) {
      return;
    }

    const meta = {
      ...baseMeta,
      action: "IGNORE",
    };

    await moderationAuditQueue.add(
      "MOD_ACTION_LOG",
      {
        decisionId,
        targetType: "USER",
        targetId: content.userId,
        targetUserId: content.userId,
        actorType: "AI_MODERATION",
        actionTaken: "IGNORE",
        meta,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("moderationAudit", decisionId, "IGNORE"),
      },
    );

    if (contentType === "QUESTION")
      await contentPipelineRouter.add(
        "QUESTION",
        {
          contentId,
          version: versionOrRevision,
        },
        {
          jobId: makeJobId(
            "contentPipelineRoute",
            contentId,
            versionOrRevision,
          ),
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

    await moderationMetricsQueue.add(
      "IGNORE",
      {
        userId: content.userId as string,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("moderationMetrics", decisionId, "IGNORE"),
      },
    );
  }
};

export default processContent;
