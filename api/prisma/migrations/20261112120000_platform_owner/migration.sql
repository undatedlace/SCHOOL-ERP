-- Schools get a sign-in code and a status; platform owners, their sessions and their audit log.
CREATE TYPE "SchoolStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

ALTER TABLE "schools" ADD COLUMN "code" TEXT;
ALTER TABLE "schools" ADD COLUMN "status" "SchoolStatus" NOT NULL DEFAULT 'ACTIVE';
-- Existing schools get a code made from their name (the owner can change it later), made unique
-- by a number when two names give the same code.
WITH named AS (
  SELECT id,
         COALESCE(NULLIF(trim(both '-' from left(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), 30)), ''), 'school') AS base,
         row_number() OVER (
           PARTITION BY COALESCE(NULLIF(trim(both '-' from left(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), 30)), ''), 'school')
           ORDER BY created_at
         ) AS n
  FROM "schools"
)
UPDATE "schools" s
SET "code" = CASE WHEN named.n = 1 THEN named.base ELSE named.base || '-' || named.n END
FROM named WHERE named.id = s.id;
ALTER TABLE "schools" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "schools_code_key" ON "schools"("code");

CREATE TABLE "platform_owners" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "temp_password_expires_at" TIMESTAMP(3),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_owners_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "platform_owners_email_key" ON "platform_owners"("email");

CREATE TABLE "platform_sessions" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "platform_sessions_token_hash_key" ON "platform_sessions"("token_hash");
CREATE INDEX "platform_sessions_owner_id_idx" ON "platform_sessions"("owner_id");
CREATE INDEX "platform_sessions_expires_at_idx" ON "platform_sessions"("expires_at");
ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "platform_owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "platform_audit_logs" (
    "id" UUID NOT NULL,
    "owner_id" UUID,
    "action" TEXT NOT NULL,
    "school_id" UUID,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "platform_audit_logs_created_at_idx" ON "platform_audit_logs"("created_at");
