-- CreateEnum
CREATE TYPE "BellSlotKind" AS ENUM ('PERIOD', 'BREAK', 'ASSEMBLY');

-- CreateEnum
CREATE TYPE "TimetableAdjustmentKind" AS ENUM ('SUBSTITUTE', 'CANCELLED');

-- AlterEnum
ALTER TYPE "ImportKind" ADD VALUE 'TIMETABLE';

-- CreateTable
CREATE TABLE "bell_schedules" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bell_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bell_slots" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "kind" "BellSlotKind" NOT NULL,
    "label" TEXT NOT NULL,
    "starts_at" TEXT NOT NULL,
    "ends_at" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "days" INTEGER[],

    CONSTRAINT "bell_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_bell_schedules" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_bell_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_entries" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "division_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "subject_id" UUID,
    "staff_id" UUID,
    "room" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_adjustments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "division_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "kind" "TimetableAdjustmentKind" NOT NULL,
    "substitute_staff_id" UUID,
    "subject_id" UUID,
    "reason" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "timetable_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bell_schedules_school_id_idx" ON "bell_schedules"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "bell_schedules_academic_year_id_name_key" ON "bell_schedules"("academic_year_id", "name");

-- CreateIndex
CREATE INDEX "bell_slots_schedule_id_idx" ON "bell_slots"("schedule_id");

-- CreateIndex
CREATE INDEX "class_bell_schedules_school_id_idx" ON "class_bell_schedules"("school_id");

-- CreateIndex
CREATE INDEX "class_bell_schedules_schedule_id_idx" ON "class_bell_schedules"("schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_bell_schedules_academic_year_id_class_id_key" ON "class_bell_schedules"("academic_year_id", "class_id");

-- CreateIndex
CREATE INDEX "timetable_entries_academic_year_id_staff_id_weekday_idx" ON "timetable_entries"("academic_year_id", "staff_id", "weekday");

-- CreateIndex
CREATE INDEX "timetable_entries_school_id_idx" ON "timetable_entries"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_entries_division_id_slot_id_weekday_key" ON "timetable_entries"("division_id", "slot_id", "weekday");

-- CreateIndex
CREATE INDEX "timetable_adjustments_school_id_date_idx" ON "timetable_adjustments"("school_id", "date");

-- CreateIndex
CREATE INDEX "timetable_adjustments_substitute_staff_id_date_idx" ON "timetable_adjustments"("substitute_staff_id", "date");

-- AddForeignKey
ALTER TABLE "bell_schedules" ADD CONSTRAINT "bell_schedules_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bell_schedules" ADD CONSTRAINT "bell_schedules_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bell_slots" ADD CONSTRAINT "bell_slots_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bell_slots" ADD CONSTRAINT "bell_slots_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "bell_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_bell_schedules" ADD CONSTRAINT "class_bell_schedules_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_bell_schedules" ADD CONSTRAINT "class_bell_schedules_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_bell_schedules" ADD CONSTRAINT "class_bell_schedules_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_bell_schedules" ADD CONSTRAINT "class_bell_schedules_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "bell_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "bell_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_adjustments" ADD CONSTRAINT "timetable_adjustments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_adjustments" ADD CONSTRAINT "timetable_adjustments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_adjustments" ADD CONSTRAINT "timetable_adjustments_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_adjustments" ADD CONSTRAINT "timetable_adjustments_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "bell_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_adjustments" ADD CONSTRAINT "timetable_adjustments_substitute_staff_id_fkey" FOREIGN KEY ("substitute_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_adjustments" ADD CONSTRAINT "timetable_adjustments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_adjustments" ADD CONSTRAINT "timetable_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One change that is not undone per division, date and period.
CREATE UNIQUE INDEX "timetable_adjustments_active_key" ON "timetable_adjustments" ("division_id", "date", "slot_id") WHERE "archived_at" IS NULL;
