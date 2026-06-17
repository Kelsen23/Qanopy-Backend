import HttpError from "../../../../utils/httpError.util.js";

import Report from "../../../../models/report.model.js";

type AssertReportClaimIsCurrentInput = {
  reportMongoId: string;
  reviewedBy: string;
  claimToken: string;
};

const assertReportClaimIsCurrent = async ({
  reportMongoId,
  reviewedBy,
  claimToken,
}: AssertReportClaimIsCurrentInput) => {
  const foundReport = await Report.findOne({
    _id: reportMongoId,
    status: "PENDING",
    reviewedBy,
    claimToken,
    claimExpiresAt: { $gt: new Date() },
  }).select("_id");

  if (!foundReport) {
    throw new HttpError("Report claim expired or changed", 409);
  }
};

export default assertReportClaimIsCurrent;
