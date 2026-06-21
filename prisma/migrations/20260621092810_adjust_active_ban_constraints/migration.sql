WITH ranked_perm_bans AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "userId"
      ORDER BY "createdAt" DESC, id DESC
    ) AS row_num
  FROM "Ban"
  WHERE "isActive" = true
    AND "banType" = 'PERM'
)
UPDATE "Ban" AS ban
SET "isActive" = false
FROM ranked_perm_bans AS ranked
WHERE ban.id = ranked.id
  AND ranked.row_num > 1;

DROP INDEX IF EXISTS "Ban_userId_active_perm_unique";

CREATE UNIQUE INDEX "Ban_userId_active_perm_unique"
ON "Ban" ("userId")
WHERE "isActive" = true
  AND "banType" = 'PERM';