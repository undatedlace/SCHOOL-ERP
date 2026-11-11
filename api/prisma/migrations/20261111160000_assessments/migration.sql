-- CreateEnum
CREATE TYPE "AssessmentKind" AS ENUM ('UNIT', 'MOCK', 'TERM', 'OTHER');

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AssessmentKind" NOT NULL DEFAULT 'OTHER',
    "subject_id" UUID NOT NULL,
    "division_id" UUID NOT NULL,
    "max_marks" DECIMAL(6,2) NOT NULL,
    "conducted_on" DATE NOT NULL,
    "created_by_id" UUID NOT NULL,
    "published_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_marks" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "marks" DECIMAL(6,2),
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "remark" TEXT,
    "entered_by_id" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_marks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessments_school_id_academic_year_id_division_id_idx" ON "assessments"("school_id", "academic_year_id", "division_id");

-- CreateIndex
CREATE INDEX "assessments_created_by_id_idx" ON "assessments"("created_by_id");

-- CreateIndex
CREATE INDEX "assessment_marks_student_id_idx" ON "assessment_marks"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_marks_assessment_id_student_id_key" ON "assessment_marks"("assessment_id", "student_id");

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_marks" ADD CONSTRAINT "assessment_marks_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_marks" ADD CONSTRAINT "assessment_marks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

