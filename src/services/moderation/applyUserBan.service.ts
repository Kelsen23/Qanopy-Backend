import prisma from "../../config/prisma.config.js";

import getActiveBanState from "./getActiveBanState.service.js";

type BanWriter = Pick<typeof prisma, "ban" | "user">;

type ApplyUserBanInput = {
  userId: string;
  banType: "TEMP" | "PERM";
  title: string;
  reasons?: string[];
  bannedBy: "AI_MODERATION" | "ADMIN_MODERATION";
  durationMs?: number;
  now?: Date;
};

const applyUserBan = async (
  db: BanWriter,
  {
    userId,
    banType,
    title,
    reasons,
    bannedBy,
    durationMs,
    now = new Date(),
  }: ApplyUserBanInput,
) => {
  const { hasActivePermBan } = await getActiveBanState(db, userId, now);
  let createdBan = false;

  if (banType === "PERM") {
    await db.ban.updateMany({
      where: {
        userId,
        banType: "TEMP",
        isActive: true,
      },
      data: { isActive: false },
    });
  }

  if (!hasActivePermBan) {
    await db.ban.create({
      data: {
        userId,
        title,
        reasons,
        banType,
        isActive: true,
        bannedBy,
        ...(banType === "TEMP" && durationMs
          ? {
              expiresAt: new Date(now.getTime() + durationMs),
              durationMs,
            }
          : {}),
      },
    });

    createdBan = true;
  }

  const { derivedStatus } = await getActiveBanState(db, userId, now);

  await db.user.update({
    where: { id: userId },
    data: { status: derivedStatus },
  });

  return { createdBan, status: derivedStatus };
};

export default applyUserBan;
