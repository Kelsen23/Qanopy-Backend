import verifyQuestionSecurity from "../ai/securityVerifier.service.js";
import { queueContentPipelineRoute } from "../pipelineRouter/pipelineRouting.service.js";
import queueQuestionGatewayAudit from "../questionEligibilityGate/queueQuestionGatewayAudit.service.js";
import {
  buildFailClosedSecurityVerifierResult,
  buildSecurityVerifierMetadata,
  questionGatewayAuditDecisionBySecurityDecision,
  securityVerifierStatusByDecision,
  type ProcessSecurityVerifierJobData,
} from "../securityVerifier/securityVerifier.shared.js";
import routeNotification from "../../notification/routeNotification.service.js";

import { getRedisCacheClient } from "../../../config/redis.config.js";

import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import QuestionVersion from "../../../models/questionVersion.model.js";
import Question from "../../../models/question.model.js";

const resetSecurityVerifierProcessing = async (
  questionId: string,
  version: number,
) => {
  await Question.updateOne(
    {
      _id: questionId,
      currentVersion: version,
      securityVerifierStatus: "PROCESSING",
    },
    {
      $set: {
        securityVerifierStatus: "PENDING",
        securityVerifierUpdatedAt: null,
        securityVerifierSourceVersion: version,
      },
    },
  );
};

const queueSecurityVerifierSideEffects = async ({
  questionId,
  version,
  userId,
  securityVerifierStatus,
}: {
  questionId: string;
  version: number;
  userId: string;
  securityVerifierStatus: "ALLOWED" | "ALLOWED_WITH_CONSTRAINTS" | "REJECTED";
}) => {
  await getRedisCacheClient().del(`question:${questionId}`);

  await queueContentPipelineRoute({
    contentType: "QUESTION",
    contentId: questionId,
    version,
  });

  if (securityVerifierStatus === "REJECTED") {
    await routeNotification({
      recipientId: userId,
      event: "QUESTION_ELIGIBILITY_UPDATE",
      target: {
        entityType: "QUESTION",
        entityId: questionId,
        questionVersion: version,
      },
      meta: {
        questionId,
        questionVersion: version,
        securityVerifierStatus,
      },
    });
  }
};

const resumeSecurityVerifierSideEffects = async ({
  questionId,
  version,
}: ProcessSecurityVerifierJobData) => {
  const routedQuestion = await Question.findOne({
    _id: questionId,
    currentVersion: version,
    isActive: true,
    isDeleted: false,
    questionEligibilityStatus: "ALLOWED",
    securityVerifierSourceVersion: version,
    securityVerifierStatus: {
      $in: ["ALLOWED", "ALLOWED_WITH_CONSTRAINTS", "REJECTED"],
    },
  })
    .select("userId securityVerifierStatus")
    .lean<{
      userId: string;
      securityVerifierStatus:
        | "ALLOWED"
        | "ALLOWED_WITH_CONSTRAINTS"
        | "REJECTED";
    }>();

  if (!routedQuestion) return;

  await queueSecurityVerifierSideEffects({
    questionId,
    version,
    userId: String(routedQuestion.userId),
    securityVerifierStatus: routedQuestion.securityVerifierStatus,
  });
};

const processSecurityVerifierJob = async ({
  questionId,
  version,
}: ProcessSecurityVerifierJobData) => {
  const lockedQuestion = await Question.findOneAndUpdate(
    {
      _id: questionId,
      currentVersion: version,
      isActive: true,
      isDeleted: false,
      questionEligibilityStatus: "ALLOWED",
      securityVerifierStatus: "PENDING",
    },
    { $set: { securityVerifierStatus: "PROCESSING" } },
    { returnDocument: "after" },
  )
    .select("_id currentVersion userId")
    .lean<{
      _id: unknown;
      currentVersion: number;
      userId: string;
    }>();

  if (!lockedQuestion) {
    await resumeSecurityVerifierSideEffects({ questionId, version });
    return;
  }

  let statusUpdated = false;
  let auditQueued = false;
  try {
    const questionVersion = await QuestionVersion.findOne({
      questionId,
      version,
      isActive: true,
      moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
    })
      .select("title body tags")
      .lean<{
        title: string;
        body: string;
        tags: string[];
      }>();

    if (!questionVersion) {
      await resetSecurityVerifierProcessing(questionId, version);
      return;
    }

    let syntheticFailClosed = false;
    const securityResult = await verifyQuestionSecurity({
      title: String(questionVersion.title ?? ""),
      body: String(questionVersion.body ?? ""),
      tags: Array.isArray(questionVersion.tags) ? questionVersion.tags : [],
    }).catch((error) => {
      syntheticFailClosed = true;
      return buildFailClosedSecurityVerifierResult(error);
    });

    const nextSecurityVerifierStatus =
      securityVerifierStatusByDecision[securityResult.finalSecurityDecision];
    const auditDecisionId = makeJobId(
      "securityVerifierDecision",
      questionId,
      version,
    );
    const updatedAt = new Date();
    const updateResult = await Question.updateOne(
      {
        _id: questionId,
        currentVersion: version,
        questionEligibilityStatus: "ALLOWED",
        securityVerifierStatus: "PROCESSING",
      },
      {
        $set: {
          securityVerifierStatus: nextSecurityVerifierStatus,
          securityVerifierUpdatedAt: updatedAt,
          securityVerifierSourceVersion: version,
        },
      },
    );

    if (updateResult.modifiedCount === 0) return;
    statusUpdated = true;

    await queueQuestionGatewayAudit({
      decisionId: auditDecisionId,
      questionId,
      version,
      userId: String(lockedQuestion.userId),
      stage: "SECURITY_VERIFIER",
      decision:
        questionGatewayAuditDecisionBySecurityDecision[
          securityResult.finalSecurityDecision
        ],
      questionEligibilityStatus: "ALLOWED",
      securityVerifierStatus: nextSecurityVerifierStatus,
      eligibleForDownstreamProcessing:
        securityResult.downstreamPolicy.eligibleForDownstreamProcessing,
      userFacingReason: securityResult.userFacingReason,
      internalReason: securityResult.internalReason,
      metadata: buildSecurityVerifierMetadata(
        securityResult,
        syntheticFailClosed,
      ),
    });
    auditQueued = true;

    await queueSecurityVerifierSideEffects({
      questionId,
      version,
      userId: String(lockedQuestion.userId),
      securityVerifierStatus: nextSecurityVerifierStatus,
    });
  } catch (error) {
    if (!statusUpdated || !auditQueued) {
      await resetSecurityVerifierProcessing(questionId, version);
    }

    throw error;
  }
};

export default processSecurityVerifierJob;
