-- AlterTable
ALTER TABLE "ModerationStrike" ADD COLUMN     "claimExpiresAt" TIMESTAMP(3),
ADD COLUMN     "claimToken" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ModerationStrike_reviewedBy_claimExpiresAt_idx" ON "ModerationStrike"("reviewedBy", "claimExpiresAt");
