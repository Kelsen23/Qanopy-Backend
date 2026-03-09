/*
  Warnings:

  - You are about to drop the column `userId` on the `Achievement` table. All the data in the column will be lost.
  - Added the required column `targetUserId` to the `Achievement` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `bannedBy` on the `Ban` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `warnedBy` on the `Warning` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('QUESTION', 'ANSWER', 'REPLY');

-- CreateEnum
CREATE TYPE "Mods" AS ENUM ('ADMIN_MODERATION', 'AI_MODERATION');

-- CreateEnum
CREATE TYPE "AiDecision" AS ENUM ('BAN_TEMP', 'BAN_PERM', 'WARN', 'IGNORE', 'UNCERTAIN');

-- DropForeignKey
ALTER TABLE "Achievement" DROP CONSTRAINT "Achievement_userId_fkey";

-- AlterTable
ALTER TABLE "Achievement" DROP COLUMN "userId",
ADD COLUMN     "targetUserId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Ban" DROP COLUMN "bannedBy",
ADD COLUMN     "bannedBy" "Mods" NOT NULL;

-- AlterTable
ALTER TABLE "Warning" DROP COLUMN "warnedBy",
ADD COLUMN     "warnedBy" "Mods" NOT NULL;

-- DropEnum
DROP TYPE "MODS";

-- CreateTable
CREATE TABLE "ModerationStrike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aiDecision" "AiDecision",
    "aiConfidence" DOUBLE PRECISION,
    "aiReasons" TEXT[],
    "severity" INTEGER,
    "targetContentId" TEXT NOT NULL,
    "targetType" "ContentType" NOT NULL,
    "targetContentVersion" INTEGER NOT NULL,
    "strikedBy" "Mods" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationStrike_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationStrike" ADD CONSTRAINT "ModerationStrike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
