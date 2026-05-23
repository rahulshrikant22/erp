-- AlterTable
ALTER TABLE "core"."notification_log" ALTER COLUMN "notification_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "core"."notifications" ALTER COLUMN "recipient_user_id" DROP NOT NULL;
