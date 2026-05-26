-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailChangeOtp" TEXT,
ADD COLUMN     "emailChangeOtpExpireAt" TIMESTAMP(3),
ADD COLUMN     "emailChangeOtpResendAvailableAt" TIMESTAMP(3),
ADD COLUMN     "emailChangePendingEmail" TEXT;
