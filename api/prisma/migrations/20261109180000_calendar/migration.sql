-- CreateEnum
CREATE TYPE "CalendarCategory" AS ENUM ('EVENT', 'HOLIDAY', 'EXAM', 'MEETING');

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "CalendarCategory" NOT NULL DEFAULT 'EVENT',
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "audience" "NoticeAudience" NOT NULL,
    "notice_id" UUID,
    "created_by_id" UUID NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event_targets" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "class_id" UUID,
    "division_id" UUID,

    CONSTRAINT "calendar_event_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_notice_id_key" ON "calendar_events"("notice_id");

-- CreateIndex
CREATE INDEX "calendar_events_school_id_starts_on_idx" ON "calendar_events"("school_id", "starts_on");

-- CreateIndex
CREATE INDEX "calendar_event_targets_event_id_idx" ON "calendar_event_targets"("event_id");

-- CreateIndex
CREATE INDEX "calendar_event_targets_class_id_idx" ON "calendar_event_targets"("class_id");

-- CreateIndex
CREATE INDEX "calendar_event_targets_division_id_idx" ON "calendar_event_targets"("division_id");

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_targets" ADD CONSTRAINT "calendar_event_targets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_targets" ADD CONSTRAINT "calendar_event_targets_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_targets" ADD CONSTRAINT "calendar_event_targets_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

