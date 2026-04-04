-- AlterEnum
ALTER TYPE "ContentType" ADD VALUE 'AI_ANSWER_FEEDBACK';

-- AlterTable
ALTER TABLE "ModerationStrike" ALTER COLUMN "targetContentVersion" DROP NOT NULL;
