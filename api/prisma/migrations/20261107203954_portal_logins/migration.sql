-- DropIndex
DROP INDEX "guardians_user_id_key";

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "username" TEXT;

-- CreateIndex
CREATE INDEX "guardians_user_id_idx" ON "guardians"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_school_id_username_key" ON "users"("school_id", "username");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

