/*
  Warnings:

  - Made the column `targetContentVersion` on table `ModerationStrike` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ModerationStrike" ADD COLUMN     "adminId" TEXT,
ADD COLUMN     "strikeReasons" TEXT,
ALTER COLUMN "targetContentVersion" SET NOT NULL,
ALTER COLUMN "riskScore" DROP NOT NULL;
