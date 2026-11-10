-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "answers" JSONB,
ADD COLUMN     "form_id" UUID,
ADD COLUMN     "staff_type_id" UUID;

-- CreateTable
CREATE TABLE "staff_types" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_teaching" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_types_school_id_name_key" ON "staff_types"("school_id", "name");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_staff_type_id_fkey" FOREIGN KEY ("staff_type_id") REFERENCES "staff_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_types" ADD CONSTRAINT "staff_types_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

