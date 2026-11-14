-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('ADMISSIONS', 'FEES', 'STUDENT_ATTENDANCE', 'STAFF_ATTENDANCE');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('CHECKED', 'RUNNING', 'IMPORTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AttendanceSource" ADD VALUE 'IMPORT';

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "import_batch_id" UUID;

-- AlterTable
ALTER TABLE "fee_invoices" ADD COLUMN     "import_batch_id" UUID;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "import_batch_id" UUID;

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kind" "ImportKind" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'CHECKED',
    "file_name" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imported_at" TIMESTAMP(3),
    "imported_by_id" UUID,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batches_school_id_created_at_idx" ON "import_batches"("school_id", "created_at");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
