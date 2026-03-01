-- AlterTable
ALTER TABLE "Ban" ALTER COLUMN "severity" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Warning" ALTER COLUMN "severity" DROP NOT NULL;
