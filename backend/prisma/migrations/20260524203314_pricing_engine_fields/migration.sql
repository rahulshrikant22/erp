-- AlterTable
ALTER TABLE "sales"."order_lines" ADD COLUMN     "price_source" TEXT;

-- AlterTable
ALTER TABLE "sales"."orders" ADD COLUMN     "round_off_amount" DECIMAL(8,2) NOT NULL DEFAULT 0;
