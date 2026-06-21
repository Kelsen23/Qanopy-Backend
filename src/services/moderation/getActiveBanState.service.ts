import prisma from "../../config/prisma.config.js";

type BanReader = Pick<typeof prisma, "ban">;
type DerivedStatus = "ACTIVE" | "SUSPENDED" | "TERMINATED";

const getActiveBanState = async (
  db: BanReader,
  userId: string,
  now = new Date(),
) => {
  const activeBans = await db.ban.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: {
      id: true,
      title: true,
      reasons: true,
      banType: true,
      expiresAt: true,
      durationMs: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  let activeBan: (typeof activeBans)[number] | null = null;
  let hasActivePermBan = false;

  for (const ban of activeBans) {
    if (ban.banType === "PERM") {
      activeBan = ban;
      hasActivePermBan = true;
      break;
    }

    if (ban.expiresAt && ban.expiresAt <= now) {
      continue;
    }

    if (!activeBan) {
      activeBan = ban;
    }
  }

  const derivedStatus: DerivedStatus = hasActivePermBan
    ? "TERMINATED"
    : activeBan
      ? "SUSPENDED"
      : "ACTIVE";

  return {
    activeBans,
    activeBan,
    hasActivePermBan,
    derivedStatus,
  };
};

export default getActiveBanState;
