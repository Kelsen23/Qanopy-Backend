-- AlterTable
ALTER TABLE "User" ADD COLUMN     "credits" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "creditsLastRedeemedAt" TIMESTAMP(3);
