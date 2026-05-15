-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountDeletionCompletedAt" TIMESTAMP(3),
ADD COLUMN     "accountDeletionRequestedAt" TIMESTAMP(3);
