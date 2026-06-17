import HttpError from "../../../../utils/httpError.util.js";

import prisma from "../../../../config/prisma.config.js";

import assertStrikeClaimIsCurrent from "./assertStrikeClaimIsCurrent.service.js";

type FinalizeStrikeReviewInput = {
  strikeMongoId: string;
  reviewedBy: string;
  claimToken: string;
};

const finalizeStrikeReview = async ({
  strikeMongoId,
  reviewedBy,
  claimToken,
}: FinalizeStrikeReviewInput) => {
  await assertStrikeClaimIsCurrent({
    strikeMongoId,
    reviewedBy,
    claimToken,
  });

  const updatedStrike = await prisma.moderationStrike.updateMany({
    where: {
      id: strikeMongoId,
      isReviewed: false,
      reviewedBy,
      claimToken,
      claimExpiresAt: { gt: new Date() },
    },
    data: {
      isReviewed: true,
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
