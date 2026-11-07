-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'LEFT');

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "employee_no" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "date_of_birth" DATE,
    "mobile" TEXT,
    "email" TEXT,
    "designation" TEXT NOT NULL,
    "qualification" TEXT,
    "address" TEXT,
    "photo_file_id" UUID,
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_on" DATE NOT NULL,
    "left_on" DATE,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_user_id_key" ON "staff"("user_id");

-- CreateIndex
CREATE INDEX "staff_school_id_status_idx" ON "staff"("school_id", "status");

-- CreateIndex
CREATE INDEX "staff_school_id_surname_first_name_idx" ON "staff"("school_id", "surname", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "staff_school_id_seq_key" ON "staff"("school_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "staff_school_id_employee_no_key" ON "staff"("school_id", "employee_no");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
