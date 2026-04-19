/*
  Warnings:

  - You are about to drop the column `strike` on the `NotificationSettings` table. All the data in the column will be lost.
  - You are about to drop the column `warn` on the `NotificationSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "NotificationSettings" DROP COLUMN "strike",
DROP COLUMN "warn";
