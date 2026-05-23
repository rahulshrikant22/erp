-- AlterTable
ALTER TABLE "core"."documents" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "documents_is_deleted_idx" ON "core"."documents"("is_deleted");
