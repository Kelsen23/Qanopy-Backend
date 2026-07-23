/*
  Warnings:

  - You are about to drop the column `acceptedAnswers` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `accountDeletionCompletedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `accountDeletionRequestedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `answersGiven` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `authProvider` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `bestAnswers` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `bio` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `credits` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `creditsLastRedeemedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `displayName` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `emailChangeOtp` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `emailChangeOtpExpireAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `emailChangeOtpResendAvailableAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `emailChangePendingEmail` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `isDeleted` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `isVerified` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `otp` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `otpExpireAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `otpResendAvailableAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `profilePictureKey` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `profilePictureUrl` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `questionsAsked` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `registeredStage` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `reputationPoints` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `resetPasswordOtp` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `resetPasswordOtpExpireAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `resetPasswordOtpResendAvailableAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `resetPasswordOtpVerified` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `tokenVersion` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `AppConfig` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "CreditPeriodType" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "CreditOperationType" AS ENUM ('AI_SUGGESTION', 'AI_ANSWER');

-- CreateEnum
CREATE TYPE "CreditOperationStatus" AS ENUM ('CHARGED', 'REFUNDED', 'REFUND_PENDING');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "acceptedAnswers",
DROP COLUMN "accountDeletionCompletedAt",
DROP COLUMN "accountDeletionRequestedAt",
DROP COLUMN "answersGiven",
DROP COLUMN "authProvider",
DROP COLUMN "bestAnswers",
DROP COLUMN "bio",
DROP COLUMN "credits",
DROP COLUMN "creditsLastRedeemedAt",
DROP COLUMN "deletedAt",
DROP COLUMN "displayName",
DROP COLUMN "emailChangeOtp",
DROP COLUMN "emailChangeOtpExpireAt",
DROP COLUMN "emailChangeOtpResendAvailableAt",
DROP COLUMN "emailChangePendingEmail",
DROP COLUMN "isDeleted",
DROP COLUMN "isVerified",
DROP COLUMN "otp",
DROP COLUMN "otpExpireAt",
DROP COLUMN "otpResendAvailableAt",
DROP COLUMN "password",
DROP COLUMN "profilePictureKey",
DROP COLUMN "profilePictureUrl",
DROP COLUMN "questionsAsked",
DROP COLUMN "registeredStage",
DROP COLUMN "reputationPoints",
DROP COLUMN "resetPasswordOtp",
DROP COLUMN "resetPasswordOtpExpireAt",
DROP COLUMN "resetPasswordOtpResendAvailableAt",
DROP COLUMN "resetPasswordOtpVerified",
DROP COLUMN "status",
DROP COLUMN "tokenVersion";

-- DropTable
DROP TABLE "AppConfig";

-- CreateTable
CREATE TABLE "CreditPeriodUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodType" "CreditPeriodType" NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditPeriodUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "type" "CreditOperationType" NOT NULL,
    "status" "CreditOperationStatus" NOT NULL,
    "chargeAmount" INTEGER NOT NULL,
    "dailyResetAt" TIMESTAMP(3),
    "weeklyResetAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "chargedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAuth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "password" VARCHAR(60),
    "authProvider" "AuthProvider" NOT NULL DEFAULT 'LOCAL',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "otp" TEXT,
    "otpResendAvailableAt" TIMESTAMP(3),
    "otpExpireAt" TIMESTAMP(3),
    "resetPasswordOtp" TEXT,
    "resetPasswordOtpVerified" BOOLEAN,
    "resetPasswordOtpResendAvailableAt" TIMESTAMP(3),
    "resetPasswordOtpExpireAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" VARCHAR(20),
    "bio" VARCHAR(150),
    "profilePictureUrl" TEXT,
    "profilePictureKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reputationPoints" INTEGER NOT NULL DEFAULT 0,
    "questionsAsked" INTEGER NOT NULL DEFAULT 0,
    "answersGiven" INTEGER NOT NULL DEFAULT 0,
    "acceptedAnswers" INTEGER NOT NULL DEFAULT 0,
    "bestAnswers" INTEGER NOT NULL DEFAULT 0,
    "registeredStage" TEXT NOT NULL DEFAULT 'DEMO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStatus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "accountDeletionRequestedAt" TIMESTAMP(3),
    "accountDeletionCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEmailChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pendingEmail" TEXT,
    "otp" TEXT,
    "otpResendAvailableAt" TIMESTAMP(3),
    "otpExpireAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEmailChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditPeriodUsage_userId_periodType_key" ON "CreditPeriodUsage"("userId", "periodType");

-- CreateIndex
CREATE UNIQUE INDEX "CreditOperation_operationKey_key" ON "CreditOperation"("operationKey");

-- CreateIndex
CREATE INDEX "CreditOperation_userId_status_idx" ON "CreditOperation"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserAuth_userId_key" ON "UserAuth"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStats_userId_key" ON "UserStats"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStatus_userId_key" ON "UserStatus"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserEmailChange_userId_key" ON "UserEmailChange"("userId");

-- AddForeignKey
ALTER TABLE "CreditPeriodUsage" ADD CONSTRAINT "CreditPeriodUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditOperation" ADD CONSTRAINT "CreditOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAuth" ADD CONSTRAINT "UserAuth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStats" ADD CONSTRAINT "UserStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStatus" ADD CONSTRAINT "UserStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEmailChange" ADD CONSTRAINT "UserEmailChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
