-- DropIndex
DROP INDEX "core"."whatsapp_providers_provider_code_key";

-- AlterTable
ALTER TABLE "core"."communication_templates" ADD COLUMN     "buttons_template" JSONB,
ADD COLUMN     "footer_template" TEXT,
ADD COLUMN     "header_template" TEXT,
ADD COLUMN     "wa_approval_status" TEXT,
ADD COLUMN     "wa_namespace" TEXT;

-- AlterTable
ALTER TABLE "core"."notification_log" ADD COLUMN     "read_at" TIMESTAMP(3),
ADD COLUMN     "whatsapp_provider_id" TEXT;

-- AlterTable
ALTER TABLE "core"."whatsapp_providers" ADD COLUMN     "webhook_secret" TEXT;

-- CreateIndex
CREATE INDEX "notification_log_provider_message_id_idx" ON "core"."notification_log"("provider_message_id");

-- AddForeignKey
ALTER TABLE "core"."notification_log" ADD CONSTRAINT "notification_log_whatsapp_provider_id_fkey" FOREIGN KEY ("whatsapp_provider_id") REFERENCES "core"."whatsapp_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
