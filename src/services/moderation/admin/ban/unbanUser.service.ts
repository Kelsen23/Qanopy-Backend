import crypto from "crypto";

import type { Prisma } from "../../../../generated/prisma/client.js";

import sendUnbanNoticeEmail from "../../sendUnbanNoticeEmail.service.js";
import runSideEffectWithRetry from "../runSideEffectWithRetry.service.js";

import prisma from "../../../../config/prisma.config.js";

import clearUserCache from "../../../../utils/cache/clearUserCache.util.js";
import HttpError from "../../../../utils/http/httpError.util.js";
import { makeJobId } from "../../../../utils/job/makeJobId.util.js";

import moderationAuditQueue from "../../../../queues/moderationAudit.queue.js";

type UnbanUserInput = {
  userId: string;
  reviewedBy: string;
};

const unbanUser = async ({ userId, reviewedBy }: UnbanUserInput) => {
  const decisionId = crypto.randomUUID();

  const transactionResult = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const foundUser = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          statusState: {
            select: {
              status: true,
            },
          },
        },
      });

      if (!foundUser) {
        throw new HttpError("User not found", 404);
      }

      const activeBans = await tx.ban.findMany({
        where: {
          userId,
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      if (activeBans.length === 0) {
        throw new HttpError("User has no active bans", 404);
      }

      const activeBanIds = activeBans.map((ban) => ban.id);

      await tx.ban.updateMany({
        where: {
          id: { in: activeBanIds },
        },
        data: { isActive: false },
      });

      await tx.userStatus.update({
        where: { userId },
        data: { status: "ACTIVE" },
      });

      return {
        previousStatus: foundUser.statusState?.status ?? "ACTIVE",
        activeBanIds,
        deactivatedBanCount: activeBanIds.length,
      };
    },
  );

  const sideEffectContext = {
    decisionId,
    targetUserId: userId,
    reviewedBy,
    deactivatedBanCount: transactionResult.deactivatedBanCount,
  };

  await runSideEffectWithRetry(
    "clearUserCache",
    async () => {
      await clearUserCache(userId);
    },
    sideEffectContext,
  );

  await runSideEffectWithRetry(
    "moderationAuditQueue:add:UNBAN_USER",
    async () => {
      await moderationAuditQueue.add(
        "UNBAN_USER",
        {
          decisionId,
          targetType: "USER",
          targetId: userId,
          targetUserId: userId,
          actorType: "ADMIN_MODERATION",
          adminId: reviewedBy,
          actionTaken: "UNBAN",
          meta: {
            deactivatedBanIds: transactionResult.activeBanIds,
            deactivatedBanCount: transactionResult.deactivatedBanCount,
            previousStatus: transactionResult.previousStatus,
            status: "ACTIVE",
          },
        },
        {
          removeOnComplete: true,
          removeOnFail: false,
          jobId: makeJobId("moderationAudit", decisionId, "unbanUser"),
        },
      );
    },
    sideEffectContext,
  );

  await sendUnbanNoticeEmail({
    userId,
    decisionId,
    deactivatedBanCount: transactionResult.deactivatedBanCount,
  });

  return {
    message: "Successfully removed active bans",
    deactivatedBanCount: transactionResult.deactivatedBanCount,
  };
};

export default unbanUser;
