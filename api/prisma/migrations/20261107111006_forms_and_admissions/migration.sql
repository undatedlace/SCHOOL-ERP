-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('RECEIVED', 'UNDER_REVIEW', 'GRANTED', 'REFUSED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "form_no" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'RECEIVED',
    "received_on" DATE NOT NULL,
    "student_name" TEXT NOT NULL,
    "date_of_birth" DATE,
    "class_id" UUID,
    "answers" JSONB NOT NULL,
    "granted_class_id" UUID,
    "granted_division_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decided_by_id" UUID,
    "decision_note" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_definitions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "schema" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "form_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "applications_school_id_status_idx" ON "applications"("school_id", "status");

-- CreateIndex
CREATE INDEX "applications_school_id_student_name_idx" ON "applications"("school_id", "student_name");

-- CreateIndex
CREATE UNIQUE INDEX "applications_school_id_academic_year_id_seq_key" ON "applications"("school_id", "academic_year_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "applications_school_id_academic_year_id_form_no_key" ON "applications"("school_id", "academic_year_id", "form_no");

-- CreateIndex
CREATE INDEX "form_definitions_school_id_key_status_idx" ON "form_definitions"("school_id", "key", "status");

-- CreateIndex
CREATE UNIQUE INDEX "form_definitions_school_id_key_version_key" ON "form_definitions"("school_id", "key", "version");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "form_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_granted_class_id_fkey" FOREIGN KEY ("granted_class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_granted_division_id_fkey" FOREIGN KEY ("granted_division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
