/*
  Warnings:

  - You are about to drop the column `isReviewed` on the `ModerationStrike` table. All the data in the column will be lost.
  - You are about to drop the column `strikeReasons` on the `ModerationStrike` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ModerationActionTaken" AS ENUM ('PENDING', 'BAN_TEMP', 'BAN_PERM', 'WARN', 'IGNORE');

-- AlterTable
ALTER TABLE "ModerationStrike" DROP COLUMN "isReviewed",
DROP COLUMN "strikeReasons",
ADD COLUMN     "actionTaken" "ModerationActionTaken" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "isRemovingContent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewComment" VARCHAR(150),
ADD COLUMN     "strikeComment" VARCHAR(150);
