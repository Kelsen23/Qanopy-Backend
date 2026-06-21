import HttpError from "../../../../utils/http/httpError.util.js";

import prisma from "../../../../config/prisma.config.js";

import assertStrikeClaimIsCurrent from "./assertStrikeClaimIsCurrent.service.js";

type FinalizeStrikeReviewInput = {
  strikeMongoId: string;
  reviewedBy: string;
  claimToken: string;
  actionTaken: "BAN_TEMP" | "BAN_PERM" | "WARN" | "IGNORE";
  isRemovingContent: boolean;
};

const finalizeStrikeReview = async ({
  strikeMongoId,
  reviewedBy,
  claimToken,
  actionTaken,
  isRemovingContent,
}: FinalizeStrikeReviewInput) => {
  await assertStrikeClaimIsCurrent({
    strikeMongoId,
    reviewedBy,
    claimToken,
  });

  const updatedStrike = await prisma.moderationStrike.updateMany({
    where: {
      id: strikeMongoId,
      actionTaken: "PENDING",
      reviewedBy,
      claimToken,
      claimExpiresAt: { gt: new Date() },
    },
    data: {
      actionTaken,
      isRemovingContent,
      claimedAt: null,
      claimExpiresAt: null,
      claimToken: null,
    },
  });

  if (updatedStrike.count === 0) {
    throw new HttpError("Strike already reviewed", 409);
  }
};

export default finalizeStrikeReview;
