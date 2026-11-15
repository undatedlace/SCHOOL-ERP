-- CreateEnum
CREATE TYPE "PushStatus" AS ENUM ('NONE', 'PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "push_at" TIMESTAMP(3),
ADD COLUMN     "push_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "push_status" "PushStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "pushed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "notifications_push_status_push_at_idx" ON "notifications"("push_status", "push_at");
