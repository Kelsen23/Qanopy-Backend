/*
  Warnings:

  - The values [UNCERTAIN] on the enum `AiDecision` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AiDecision_new" AS ENUM ('BAN_TEMP', 'BAN_PERM', 'WARN', 'IGNORE');
ALTER TABLE "ModerationStrike" ALTER COLUMN "aiDecision" TYPE "AiDecision_new" USING ("aiDecision"::text::"AiDecision_new");
ALTER TYPE "AiDecision" RENAME TO "AiDecision_old";
ALTER TYPE "AiDecision_new" RENAME TO "AiDecision";
DROP TYPE "public"."AiDecision_old";
COMMIT;
