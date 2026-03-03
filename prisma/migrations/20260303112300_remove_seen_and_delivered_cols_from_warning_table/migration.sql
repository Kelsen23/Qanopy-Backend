/*
  Warnings:

  - You are about to drop the column `delivered` on the `Warning` table. All the data in the column will be lost.
  - You are about to drop the column `seen` on the `Warning` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Warning" DROP COLUMN "delivered",
DROP COLUMN "seen";
