import prisma from "../../config/prisma.config.js";

import { unbanNoticeHtml } from "../../utils/email/renderTemplate.util.js";
import { makeUniqueJobId } from "../../utils/job/makeJobId.util.js";

import emailQueue from "../../queues/email.queue.js";

type SendUnbanNoticeEmailInput = {
  userId: string;
  decisionId: string;
  deactivatedBanCount: number;
};

const sendUnbanNoticeEmail = async ({
  userId,
  decisionId,
  deactivatedBanCount,
}: SendUnbanNoticeEmailInput) => {
  try {
    const foundUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        statusState: {
          select: {
            isDeleted: true,
          },
        },
      },
    });

    if (!foundUser || foundUser.statusState?.isDeleted || !foundUser.email) {
      return { sent: false };
    }

    const title = "Account unban notice";
    const body =
      "Your Qanopy account has been restored and your active ban restrictions have been removed";
    const details =
      deactivatedBanCount === 1
        ? "1 active ban record was marked inactive during this review"
        : `${deactivatedBanCount} active ban records were marked inactive during this review`;

    const htmlContent = unbanNoticeHtml(
      foundUser.username,
      title,
      body,
      details,
    );

    await emailQueue.add(
      "SEND_UNBAN_NOTICE_EMAIL",
      {
        email: foundUser.email,
        subject: title,
        htmlContent,
        purpose: "UNBAN",
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeUniqueJobId(
          "email",
          "SEND_UNBAN_NOTICE_EMAIL",
          decisionId,
          foundUser.id,
        ),
      },
    );

    return { sent: true };
  } catch (error) {
    console.error("[sendUnbanNoticeEmail] Failed to enqueue unban notice", {
      userId,
      decisionId,
      error,
    });

    return { sent: false };
  }
};

export default sendUnbanNoticeEmail;
