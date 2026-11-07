-- AlterTable
ALTER TABLE "academic_years" ADD COLUMN     "age_cutoff_date" DATE;

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "admissions_open" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "min_age_years" INTEGER;
