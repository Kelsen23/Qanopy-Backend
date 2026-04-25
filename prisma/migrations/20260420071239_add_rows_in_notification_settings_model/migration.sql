-- AlterTable
ALTER TABLE "NotificationSettings" ADD COLUMN     "answerAccepted" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "answerMarkedBest" BOOLEAN NOT NULL DEFAULT true;
