-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "message_quiet_end" TEXT NOT NULL DEFAULT '07:00',
ADD COLUMN     "message_quiet_start" TEXT NOT NULL DEFAULT '19:00',
ADD COLUMN     "message_quiet_sundays" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "started_by_user_id" UUID NOT NULL,
    "closed_by" UUID,
    "closed_at" TIMESTAMP(3),
    "close_reason" TEXT,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_message_files" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_message_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_reads" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_school_id_last_message_at_idx" ON "conversations"("school_id", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_teacher_user_id_last_message_at_idx" ON "conversations"("teacher_user_id", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_student_id_last_message_at_idx" ON "conversations"("student_id", "last_message_at");

-- CreateIndex
CREATE INDEX "conversation_messages_conversation_id_created_at_idx" ON "conversation_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "conversation_messages_sender_user_id_created_at_idx" ON "conversation_messages"("sender_user_id", "created_at");

-- CreateIndex
CREATE INDEX "conversation_messages_school_id_idx" ON "conversation_messages"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_message_files_file_id_key" ON "conversation_message_files"("file_id");

-- CreateIndex
CREATE INDEX "conversation_message_files_message_id_idx" ON "conversation_message_files"("message_id");

-- CreateIndex
CREATE INDEX "conversation_message_files_school_id_idx" ON "conversation_message_files"("school_id");

-- CreateIndex
CREATE INDEX "conversation_reads_user_id_idx" ON "conversation_reads"("user_id");

-- CreateIndex
CREATE INDEX "conversation_reads_school_id_idx" ON "conversation_reads"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_reads_conversation_id_user_id_key" ON "conversation_reads"("conversation_id", "user_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_started_by_user_id_fkey" FOREIGN KEY ("started_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_message_files" ADD CONSTRAINT "conversation_message_files_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "conversation_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_message_files" ADD CONSTRAINT "conversation_message_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
