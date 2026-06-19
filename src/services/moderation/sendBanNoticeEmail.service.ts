import prisma from "../../config/prisma.config.js";

import emailQueue from "../../queues/email.queue.js";

import { makeUniqueJobId } from "../../utils/job/makeJobId.util.js";
import { banNoticeHtml } from "../../utils/email/renderTemplate.util.js";

type SendBanNoticeEmailInput = {
  userId: string;
  decisionId: string;
  actionTaken: "BAN_TEMP" | "BAN_PERM";
  reasons?: string[];
  banDurationMs?: number;
};

const formatBanDuration = (banDurationMs?: number) => {
  if (!banDurationMs) return "Temporary";

  const totalMinutes = Math.max(1, Math.round(banDurationMs / 60000));

  if (totalMinutes % 1440 === 0) {
    const days = totalMinutes / 1440;
    return `${days} day${days === 1 ? "" : "s"}`;
  }

  if (totalMinutes % 60 === 0) {
    const hours = totalMinutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
};

const formatBanReasons = (reasons?: string[]) => {
  if (!reasons?.length) {
    return "This decision was made after a moderation review.";
  }

  const items = reasons
    .map((reason) => reason.trim())
    .filter(Boolean)
    .map((reason, index) => `${index + 1}. ${reason}`);

  return `Reason(s):<br />${items.join("<br />")}`;
};

const sendBanNoticeEmail = async ({
  userId,
  decisionId,
  actionTaken,
  reasons,
  banDurationMs,
}: SendBanNoticeEmailInput) => {
  try {
    const foundUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        isDeleted: true,
      },
    });

    if (!foundUser || foundUser.isDeleted || !foundUser.email) {
      return { sent: false };
    }

    const isTempBan = actionTaken === "BAN_TEMP";
    const title = isTempBan ? "Temporary ban notice" : "Permanent ban notice";
    const body = isTempBan
      ? "Your Qanopy account has been temporarily banned by the moderation team."
      : "Your Qanopy account has been permanently banned by the moderation team.";
    const summaryLabel = isTempBan ? "Suspension duration" : "Ban type";
    const summaryValue = isTempBan
      ? formatBanDuration(banDurationMs)
      : "Permanent";
    const details = formatBanReasons(reasons);

    const htmlContent = banNoticeHtml(
      foundUser.username,
      title,
      body,
      summaryLabel,
      summaryValue,
      details,
    );

    await emailQueue.add(
      "SEND_BAN_NOTICE_EMAIL",
      {
        email: foundUser.email,
        subject: title,
        htmlContent,
        purpose: actionTaken,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeUniqueJobId(
          "email",
          "SEND_BAN_NOTICE_EMAIL",
          decisionId,
          foundUser.id,
          actionTaken,
        ),
      },
    );

    return { sent: true };
  } catch (error) {
    console.error("[sendBanNoticeEmail] Failed to enqueue ban notice", {
      userId,
      decisionId,
      actionTaken,
      error,
    });

    return { sent: false };
  }
};

export default sendBanNoticeEmail;
