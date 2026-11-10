-- AlterEnum
ALTER TYPE "StudentStatus" ADD VALUE 'REMOVED';

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "student_email_domain" TEXT,
ADD COLUMN     "student_id_digits" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "student_id_prefix" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "remove_reason" TEXT,
ADD COLUMN     "removed_at" TIMESTAMP(3),
ADD COLUMN     "removed_by_id" UUID;

