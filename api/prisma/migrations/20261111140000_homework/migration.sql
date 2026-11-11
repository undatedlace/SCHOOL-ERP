-- CreateTable
CREATE TABLE "homework" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "subject_id" UUID,
    "due_on" DATE,
    "created_by_id" UUID NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_targets" (
    "id" UUID NOT NULL,
    "homework_id" UUID NOT NULL,
    "division_id" UUID,
    "student_id" UUID,

    CONSTRAINT "homework_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homework_school_id_created_at_idx" ON "homework"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "homework_created_by_id_idx" ON "homework"("created_by_id");

-- CreateIndex
CREATE INDEX "homework_targets_homework_id_idx" ON "homework_targets"("homework_id");

-- CreateIndex
CREATE INDEX "homework_targets_division_id_idx" ON "homework_targets"("division_id");

-- CreateIndex
CREATE INDEX "homework_targets_student_id_idx" ON "homework_targets"("student_id");

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_targets" ADD CONSTRAINT "homework_targets_homework_id_fkey" FOREIGN KEY ("homework_id") REFERENCES "homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_targets" ADD CONSTRAINT "homework_targets_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_targets" ADD CONSTRAINT "homework_targets_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

