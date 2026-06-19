import HttpError from "../../../../utils/http/httpError.util.js";

import Report from "../../../../models/report.model.js";

import assertReportClaimIsCurrent from "./assertReportClaimIsCurrent.service.js";

type FinalizeReportReviewInput = {
  reportMongoId: string;
  reviewedBy: string;
  claimToken: string;
};

const finalizeReportReview = async ({
  reportMongoId,
  reviewedBy,
  claimToken,
}: FinalizeReportReviewInput) => {
  await assertReportClaimIsCurrent({
    reportMongoId,
    reviewedBy,
    claimToken,
  });

  const updatedReport = await Report.findOneAndUpdate(
    {
      _id: reportMongoId,
      status: { $in: ["RESOLVED", "DISMISSED"] },
      reviewedBy,
      claimToken,
      claimExpiresAt: { $gt: new Date() },
    },
    {
      claimedAt: null,
      claimExpiresAt: null,
      claimToken: null,
    },
    { returnDocument: "after" },
  );

  if (!updatedReport) {
    throw new HttpError("Report already resolved", 409);
  }
};

export default finalizeReportReview;
