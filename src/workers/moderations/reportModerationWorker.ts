import { Worker } from "bullmq";

import {
  redisMessagingClientConnection,
  redisCacheClient,
} from "../../config/redis.js";

import aiModerateReport from "../../services/aiModerationService.js";

import calculateTempBanMs from "../../utils/calculateTempBanMs.js";
import publishSocketEvent from "../../utils/publishSocketEvent.js";

import Question from "../../models/questionModel.js";
import Answer from "../../models/answerModel.js";
import Reply from "../../models/replyModel.js";
import Report from "../../models/reportModel.js";

import prisma from "../../config/prisma.js";

import { redisPub } from "../../redis/pubsub.js";

import connectMongoDB from "../../config/mongoDB.js";

const mapSeverityToDecision = (severity: number) => {
  if (severity >= 90) return "BAN_USER_PERM";
  if (severity >= 70) return "BAN_USER_TEMP";
  if (severity >= 50) return "WARN_USER";
  if (severity !== 0) return "UNCERTAIN";
  return "IGNORE";
};

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting moderation worker...");

  new Worker(
    "reportModerationQueue",
    async (job) => {
      try {
        const { report } = job.data;
        let content = "";

        const freshReport = await Report.findById(report._id);
        if (!freshReport || freshReport.status !== "PENDING") return;

        if (report.targetType === "Question") {
          const cachedQuestion = await redisCacheClient.get(
            `question:${report.targetId}`,
          );
          const question = cachedQuestion
            ? JSON.parse(cachedQuestion)
            : await Question.findById(report.targetId).select("title body");

          content = `Title: ${question?.title || ""}\nBody: ${question?.body || ""}`;
        } else if (report.targetType === "Answer") {
          const answer = await Answer.findById(report.targetId).select("body");

          content = `Body: ${answer?.body || ""}`;
        } else if (report.targetType === "Reply") {
          const reply = await Reply.findById(report.targetId).select("body");

          content = `Body: ${reply?.body || ""}`;
        }

        const {
          confidence: aiConfidence,
          reasons: aiReasons,
          severity,
        } = await aiModerateReport(content);

        const aiDecision = mapSeverityToDecision(severity);

        const shouldRemoveContent = severity >= 70 ? true : false;

        if (aiDecision === "BAN_USER_PERM") {
          const newBan = await prisma.ban.create({
            data: {
              userId: report.targetUserId as string,
              title: "Permanent Account Suspension",
              reasons: aiReasons,
              banType: "PERM",
              severity,
              bannedBy: "AI_MODERATION",
            },
          });

          await prisma.user.update({
            where: { id: report.targetUserId as string },
            data: { status: "TERMINATED" },
          });

          await publishSocketEvent(
            report.targetUserId as string,
            "banUser",
            newBan,
          );

          redisPub.publish(
            "socket:disconnect",
            JSON.stringify(report.targetUserId as string),
          );

          await Report.findByIdAndUpdate(report._id, {
            severity,
            aiDecision,
            aiConfidence,
            aiReasons,
            status: "RESOLVED",
            actionTaken: aiDecision,
            isRemovingContent: shouldRemoveContent,
          });

          publishSocketEvent(
            report.reportedBy as string,
            "reportStatusChanged",
            {
              actionTaken: aiDecision,
              status: "RESOLVED",
            },
          );
        } else if (aiDecision === "BAN_USER_TEMP") {
          const tempBanMs = calculateTempBanMs(severity, aiConfidence);

          const newBan = await prisma.ban.create({
            data: {
              userId: report.targetUserId as string,
              title: "Temporary Account Suspension",
              reasons: aiReasons,
              banType: "TEMP",
              severity,
              bannedBy: "AI_MODERATION",
              expiresAt: new Date(Date.now() + tempBanMs),
              durationMs: tempBanMs,
            },
          });

          await prisma.user.update({
            where: { id: report.targetUserId as string },
            data: { status: "SUSPENDED" },
          });

          await publishSocketEvent(
            report.targetUserId as string,
            "banUser",
            newBan,
          );

          redisPub.publish(
            "socket:disconnect",
            JSON.stringify(report.targetUserId as string),
          );

          await Report.findByIdAndUpdate(report._id, {
            severity,
            aiDecision,
            aiConfidence,
            aiReasons,
            status: "RESOLVED",
            actionTaken: aiDecision,
            isRemovingContent: shouldRemoveContent,
          });

          publishSocketEvent(
            report.reportedBy as string,
            "reportStatusChanged",
            {
              actionTaken: aiDecision,
              status: "RESOLVED",
            },
          );
        } else if (aiDecision === "WARN_USER") {
          const title =
            aiReasons.length > 0
              ? `${aiReasons[0]}`
              : "Community Guideline Warning";

          const newWarning = await prisma.warning.create({
            data: {
              userId: report.targetUserId as string,
              title,
              reasons: aiReasons,
              severity,
              warnedBy: "AI_MODERATION",
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          });

          publishSocketEvent(
            report.targetUserId as string,
            "warnUser",
            newWarning,
          );

          await Report.findByIdAndUpdate(report._id, {
            severity,
            aiDecision,
            aiConfidence,
            aiReasons,
            status: "RESOLVED",
            actionTaken: aiDecision,
            isRemovingContent: shouldRemoveContent,
          });

          publishSocketEvent(
            report.reportedBy as string,
            "reportStatusChanged",
            {
              actionTaken: aiDecision,
              status: "RESOLVED",
            },
          );
        } else if (aiDecision === "UNCERTAIN") {
          await Report.findByIdAndUpdate(report._id, {
            severity,
            aiDecision,
            aiConfidence,
            aiReasons,
            status: "REVIEWING",
          });

          publishSocketEvent(
            report.reportedBy as string,
            "reportStatusChanged",
            {
              status: "REVIEWING",
            },
          );
        } else if (aiDecision === "IGNORE") {
          await Report.findByIdAndUpdate(report._id, {
            severity,
            aiDecision,
            aiConfidence,
            aiReasons,
            status: "DISMISSED",
            actionTaken: "IGNORE",
            isRemovingContent: false,
          });

          publishSocketEvent(
            report.reportedBy as string,
            "reportStatusChanged",
            {
              actionTaken: aiDecision,
              status: "DISMISSED",
            },
          );
        }

        if (aiDecision)
          if (shouldRemoveContent) {
            switch (report.targetType) {
              case "Question":
                await Question.findByIdAndUpdate(report.targetId, {
                  isActive: false,
                });
                break;
              case "Answer":
                await Answer.findByIdAndUpdate(report.targetId, {
                  isActive: false,
                });
                break;
              case "Reply":
                await Reply.findByIdAndUpdate(report.targetId, {
                  isActive: false,
                });
                break;
            }
          }
      } catch (error) {
        console.error("Error processing moderation report:", error);
      }
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 1,
      limiter: { max: 5, duration: 6000 },
    },
  );
}

startWorker().catch((err) => {
  console.error("Failed to start moderation worker:", err);
  process.exit(1);
});
