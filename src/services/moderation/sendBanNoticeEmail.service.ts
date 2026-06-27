import prisma from "../../config/prisma.config.js";

import { banNoticeHtml } from "../../utils/email/renderTemplate.util.js";
import { makeUniqueJobId } from "../../utils/job/makeJobId.util.js";
import {
  formatBanDurationBreakdown,
  formatBanNoticeExpiryUtc,
} from "../../utils/moderation/formatBanNotice.util.js";

import emailQueue from "../../queues/email.queue.js";

type SendBanNoticeEmailInput = {
  userId: string;
  decisionId: string;
  actionTaken: "BAN_TEMP" | "BAN_PERM";
  reasons?: string[];
  banDurationMs?: number;
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
    const summaryLabel = isTempBan ? "Suspension duration" : "Ban duration";
    const summaryValue = isTempBan
      ? formatBanDurationBreakdown(banDurationMs)
      : "Permanent";
    const tempBanExpiresAt =
      isTempBan && banDurationMs ? new Date(Date.now() + banDurationMs) : null;
    const expiryLabel = "Expires at (UTC)";
    const expiryValue = tempBanExpiresAt
      ? formatBanNoticeExpiryUtc(tempBanExpiresAt)
      : "Never";
    const expiryRowStyle = "";
    const expiryCellStyle = "";
    const details = formatBanReasons(reasons);

    const htmlContent = banNoticeHtml(
      foundUser.username,
      title,
      body,
      summaryLabel,
      summaryValue,
      expiryLabel,
      expiryValue,
      expiryRowStyle,
      expiryCellStyle,
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
