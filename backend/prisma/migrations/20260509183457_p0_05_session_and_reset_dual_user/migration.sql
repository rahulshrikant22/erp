-- AlterTable
ALTER TABLE "core"."password_reset_tokens" ADD COLUMN     "customer_user_id" TEXT,
ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "core"."user_sessions" ADD COLUMN     "customer_user_id" TEXT,
ALTER COLUMN "user_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "password_reset_tokens_customer_user_id_idx" ON "core"."password_reset_tokens"("customer_user_id");

-- CreateIndex
CREATE INDEX "user_sessions_customer_user_id_idx" ON "core"."user_sessions"("customer_user_id");

-- AddForeignKey
ALTER TABLE "core"."user_sessions" ADD CONSTRAINT "user_sessions_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "core"."customer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "core"."customer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
