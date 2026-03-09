/*
  Warnings:

  - You are about to drop the column `targetUserId` on the `Achievement` table. All the data in the column will be lost.
  - The `authProvider` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `userId` to the `Achievement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `riskScore` to the `ModerationStrike` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE', 'GITHUB');

-- DropForeignKey
ALTER TABLE "Achievement" DROP CONSTRAINT "Achievement_targetUserId_fkey";

-- AlterTable
ALTER TABLE "Achievement" DROP COLUMN "targetUserId",
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ModerationStrike" ADD COLUMN     "riskScore" DOUBLE PRECISION NOT NULL,
ALTER COLUMN "targetContentVersion" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "authProvider",
ADD COLUMN     "authProvider" "AuthProvider" NOT NULL DEFAULT 'LOCAL';

-- DropEnum
DROP TYPE "Auth_Provider";

-- CreateTable
CREATE TABLE "ModerationStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalStrikes" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "flaggedCount" INTEGER NOT NULL DEFAULT 0,
    "lastStrikeAt" TIMESTAMP(3),
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModerationStats_userId_key" ON "ModerationStats"("userId");

-- AddForeignKey
ALTER TABLE "ModerationStats" ADD CONSTRAINT "ModerationStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
