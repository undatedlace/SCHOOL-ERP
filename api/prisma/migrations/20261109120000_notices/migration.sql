-- CreateEnum
CREATE TYPE "NoticeAudience" AS ENUM ('ALL', 'STAFF', 'CLASSES', 'DIVISIONS');

-- CreateTable
CREATE TABLE "notices" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "NoticeAudience" NOT NULL,
    "expires_on" DATE,
    "created_by_id" UUID NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_targets" (
    "id" UUID NOT NULL,
    "notice_id" UUID NOT NULL,
    "class_id" UUID,
    "division_id" UUID,

    CONSTRAINT "notice_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notices_school_id_created_at_idx" ON "notices"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "notice_targets_notice_id_idx" ON "notice_targets"("notice_id");

-- CreateIndex
CREATE INDEX "notice_targets_class_id_idx" ON "notice_targets"("class_id");

-- CreateIndex
CREATE INDEX "notice_targets_division_id_idx" ON "notice_targets"("division_id");

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_targets" ADD CONSTRAINT "notice_targets_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_targets" ADD CONSTRAINT "notice_targets_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_targets" ADD CONSTRAINT "notice_targets_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

