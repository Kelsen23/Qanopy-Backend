import HttpError from "../../../../utils/httpError.util.js";

import prisma from "../../../../config/prisma.config.js";

type AssertStrikeClaimIsCurrentInput = {
  strikeMongoId: string;
  reviewedBy: string;
  claimToken: string;
};

const assertStrikeClaimIsCurrent = async ({
  strikeMongoId,
  reviewedBy,
  claimToken,
}: AssertStrikeClaimIsCurrentInput) => {
  const foundStrike = await prisma.moderationStrike.findFirst({
    where: {
      id: strikeMongoId,
      actionTaken: "PENDING",
      reviewedBy,
      claimToken,
      claimExpiresAt: { gt: new Date() },
    },
    select: { id: true },
  });

  if (!foundStrike) {
    throw new HttpError("Strike claim expired or changed", 409);
  }
};

export default assertStrikeClaimIsCurrent;
