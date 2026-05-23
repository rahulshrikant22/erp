-- DropIndex
DROP INDEX "core"."sms_providers_provider_code_key";

-- AlterTable
ALTER TABLE "core"."communication_templates" ADD COLUMN     "dlt_template_id" TEXT;
