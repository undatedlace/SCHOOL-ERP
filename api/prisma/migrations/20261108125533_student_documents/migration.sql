-- CreateEnum
CREATE TYPE "StudentDocumentType" AS ENUM ('BIRTH_CERTIFICATE', 'TRANSFER_CERTIFICATE', 'ID_PROOF', 'PREVIOUS_REPORT_CARD', 'MEDICAL', 'OTHER');

-- CreateTable
CREATE TABLE "student_documents" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "type" "StudentDocumentType" NOT NULL,
    "title" TEXT,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_documents_file_id_key" ON "student_documents"("file_id");

-- CreateIndex
CREATE INDEX "student_documents_student_id_idx" ON "student_documents"("student_id");

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
