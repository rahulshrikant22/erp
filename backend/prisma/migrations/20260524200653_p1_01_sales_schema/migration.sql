-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "sales";

-- CreateTable
CREATE TABLE "sales"."customers" (
    "id" TEXT NOT NULL,
    "customer_code" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "legal_name" TEXT,
    "customer_type" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "primary_phone" TEXT,
    "primary_email" TEXT,
    "default_billing_address_id" TEXT,
    "default_shipping_address_id" TEXT,
    "credit_limit" DECIMAL(14,2),
    "credit_days" INTEGER,
    "payment_terms_template_id" TEXT,
    "bank_name" TEXT,
    "bank_account_number" TEXT,
    "bank_ifsc" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "linked_customer_account_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."customer_addresses" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "address_type" TEXT NOT NULL,
    "contact_person" TEXT,
    "contact_phone" TEXT,
    "address_line_1" TEXT NOT NULL,
    "address_line_2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "state_code" TEXT,
    "pincode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "is_default_billing" BOOLEAN NOT NULL DEFAULT false,
    "is_default_shipping" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."customer_contacts" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "designation" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "role" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."customer_tier_pricing" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "product_id" TEXT,
    "product_category_id" TEXT,
    "discount_percent" DECIMAL(5,2),
    "special_price" DECIMAL(14,2),
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_tier_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."product_categories" (
    "id" TEXT NOT NULL,
    "category_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_category_id" TEXT,
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."products" (
    "id" TEXT NOT NULL,
    "product_code" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "description" TEXT,
    "standard_dimensions" JSONB,
    "hsn_code" TEXT,
    "base_price" DECIMAL(14,2) NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'PCS',
    "tax_rate_percent" DECIMAL(5,2) NOT NULL,
    "requires_installation" BOOLEAN NOT NULL DEFAULT false,
    "warranty_period_months" INTEGER,
    "weight_kg" DECIMAL(10,3),
    "image_url" TEXT,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "bom_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."product_size_variants" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_name" TEXT NOT NULL,
    "dimensions" JSONB,
    "variant_sku" TEXT,
    "price_override" DECIMAL(14,2),
    "weight_kg" DECIMAL(10,3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_size_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."product_tier_pricing" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "customer_type" TEXT NOT NULL,
    "discount_percent" DECIMAL(5,2),
    "fixed_price" DECIMAL(14,2),
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_tier_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_date" DATE NOT NULL,
    "order_type" TEXT NOT NULL DEFAULT 'regular',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "source_quote_id" TEXT,
    "source_quote_version_id" TEXT,
    "billing_address_id" TEXT,
    "default_shipping_address_id" TEXT,
    "expected_delivery_date" DATE,
    "promised_delivery_date" DATE,
    "payment_terms_template_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxable_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_charges" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount_due" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "place_of_supply_state_code" TEXT,
    "is_interstate" BOOLEAN NOT NULL DEFAULT false,
    "actual_material_cost" DECIMAL(14,2),
    "notes" TEXT,
    "internal_notes" TEXT,
    "created_by" TEXT,
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "line_sequence" INTEGER NOT NULL,
    "line_type" TEXT NOT NULL,
    "product_id" TEXT,
    "product_size_variant_id" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(10,3) NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'PCS',
    "unit_price_before_discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_type" TEXT NOT NULL DEFAULT 'none',
    "discount_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unit_price_final" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "hsn_code" TEXT,
    "tax_rate_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_tax_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_grand_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "custom_dimensions" JSONB,
    "bom_resolved" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."order_line_custom_specs" (
    "id" TEXT NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "spec_key" TEXT NOT NULL,
    "spec_value" TEXT NOT NULL,
    "spec_type" TEXT NOT NULL DEFAULT 'other',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_line_custom_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."order_shipments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "shipment_number" TEXT NOT NULL,
    "shipping_address_id" TEXT,
    "expected_dispatch_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."order_shipment_lines" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "quantity_in_shipment" DECIMAL(10,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_shipment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."payment_terms_templates" (
    "id" TEXT NOT NULL,
    "template_code" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "payment_terms_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."payment_term_milestones" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "milestone_sequence" INTEGER NOT NULL,
    "milestone_name" TEXT NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "trigger_event" TEXT NOT NULL,
    "trigger_days" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_term_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."order_payment_schedule" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "milestone_sequence" INTEGER NOT NULL,
    "milestone_name" TEXT NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "trigger_event" TEXT NOT NULL,
    "trigger_days" INTEGER,
    "due_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amount_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_at" TIMESTAMP(3),
    "payment_transaction_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_payment_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."order_documents" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "pdf_file_path" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generated_by" TEXT,
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."order_status_history" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "changed_by" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "time_in_previous_status_hours" DECIMAL(10,2),
    "notes" TEXT,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."order_charges" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "charge_type" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "is_taxable" BOOLEAN NOT NULL DEFAULT true,
    "hsn_code" TEXT,
    "tax_rate_percent" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."order_tax_breakup" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "hsn_code" TEXT NOT NULL,
    "taxable_value" DECIMAL(14,2) NOT NULL,
    "cgst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_tax_breakup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."order_import_batches" (
    "id" TEXT NOT NULL,
    "batch_code" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "imported_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."order_import_errors" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "field" TEXT,
    "message" TEXT NOT NULL,
    "row_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."document_sequences" (
    "id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "series_code" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "current_number" INTEGER NOT NULL DEFAULT 0,
    "padding_length" INTEGER NOT NULL DEFAULT 5,
    "reset_yearly" BOOLEAN NOT NULL DEFAULT true,
    "last_reset_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_customer_code_key" ON "sales"."customers"("customer_code");

-- CreateIndex
CREATE INDEX "customers_customer_type_idx" ON "sales"."customers"("customer_type");

-- CreateIndex
CREATE INDEX "customers_is_active_idx" ON "sales"."customers"("is_active");

-- CreateIndex
CREATE INDEX "customers_is_deleted_idx" ON "sales"."customers"("is_deleted");

-- CreateIndex
CREATE INDEX "customers_linked_customer_account_id_idx" ON "sales"."customers"("linked_customer_account_id");

-- CreateIndex
CREATE INDEX "customers_payment_terms_template_id_idx" ON "sales"."customers"("payment_terms_template_id");

-- CreateIndex
CREATE INDEX "customer_addresses_customer_id_idx" ON "sales"."customer_addresses"("customer_id");

-- CreateIndex
CREATE INDEX "customer_addresses_address_type_idx" ON "sales"."customer_addresses"("address_type");

-- CreateIndex
CREATE INDEX "customer_contacts_customer_id_idx" ON "sales"."customer_contacts"("customer_id");

-- CreateIndex
CREATE INDEX "customer_tier_pricing_customer_id_idx" ON "sales"."customer_tier_pricing"("customer_id");

-- CreateIndex
CREATE INDEX "customer_tier_pricing_product_id_idx" ON "sales"."customer_tier_pricing"("product_id");

-- CreateIndex
CREATE INDEX "customer_tier_pricing_product_category_id_idx" ON "sales"."customer_tier_pricing"("product_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_category_code_key" ON "sales"."product_categories"("category_code");

-- CreateIndex
CREATE INDEX "product_categories_parent_category_id_idx" ON "sales"."product_categories"("parent_category_id");

-- CreateIndex
CREATE INDEX "product_categories_is_active_idx" ON "sales"."product_categories"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "products_product_code_key" ON "sales"."products"("product_code");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "sales"."products"("category_id");

-- CreateIndex
CREATE INDEX "products_hsn_code_idx" ON "sales"."products"("hsn_code");

-- CreateIndex
CREATE INDEX "products_is_active_idx" ON "sales"."products"("is_active");

-- CreateIndex
CREATE INDEX "products_is_deleted_idx" ON "sales"."products"("is_deleted");

-- CreateIndex
CREATE INDEX "products_is_custom_idx" ON "sales"."products"("is_custom");

-- CreateIndex
CREATE INDEX "product_size_variants_product_id_idx" ON "sales"."product_size_variants"("product_id");

-- CreateIndex
CREATE INDEX "product_tier_pricing_product_id_idx" ON "sales"."product_tier_pricing"("product_id");

-- CreateIndex
CREATE INDEX "product_tier_pricing_customer_type_idx" ON "sales"."product_tier_pricing"("customer_type");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "sales"."orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "sales"."orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "sales"."orders"("status");

-- CreateIndex
CREATE INDEX "orders_order_date_idx" ON "sales"."orders"("order_date");

-- CreateIndex
CREATE INDEX "orders_source_idx" ON "sales"."orders"("source");

-- CreateIndex
CREATE INDEX "orders_is_deleted_idx" ON "sales"."orders"("is_deleted");

-- CreateIndex
CREATE INDEX "orders_payment_terms_template_id_idx" ON "sales"."orders"("payment_terms_template_id");

-- CreateIndex
CREATE INDEX "order_lines_order_id_idx" ON "sales"."order_lines"("order_id");

-- CreateIndex
CREATE INDEX "order_lines_product_id_idx" ON "sales"."order_lines"("product_id");

-- CreateIndex
CREATE INDEX "order_lines_product_size_variant_id_idx" ON "sales"."order_lines"("product_size_variant_id");

-- CreateIndex
CREATE INDEX "order_line_custom_specs_order_line_id_idx" ON "sales"."order_line_custom_specs"("order_line_id");

-- CreateIndex
CREATE INDEX "order_shipments_order_id_idx" ON "sales"."order_shipments"("order_id");

-- CreateIndex
CREATE INDEX "order_shipments_status_idx" ON "sales"."order_shipments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "order_shipments_order_id_shipment_number_key" ON "sales"."order_shipments"("order_id", "shipment_number");

-- CreateIndex
CREATE INDEX "order_shipment_lines_shipment_id_idx" ON "sales"."order_shipment_lines"("shipment_id");

-- CreateIndex
CREATE INDEX "order_shipment_lines_order_line_id_idx" ON "sales"."order_shipment_lines"("order_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_terms_templates_template_code_key" ON "sales"."payment_terms_templates"("template_code");

-- CreateIndex
CREATE INDEX "payment_terms_templates_is_active_idx" ON "sales"."payment_terms_templates"("is_active");

-- CreateIndex
CREATE INDEX "payment_term_milestones_template_id_idx" ON "sales"."payment_term_milestones"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_term_milestones_template_id_milestone_sequence_key" ON "sales"."payment_term_milestones"("template_id", "milestone_sequence");

-- CreateIndex
CREATE INDEX "order_payment_schedule_order_id_idx" ON "sales"."order_payment_schedule"("order_id");

-- CreateIndex
CREATE INDEX "order_payment_schedule_status_idx" ON "sales"."order_payment_schedule"("status");

-- CreateIndex
CREATE UNIQUE INDEX "order_payment_schedule_order_id_milestone_sequence_key" ON "sales"."order_payment_schedule"("order_id", "milestone_sequence");

-- CreateIndex
CREATE INDEX "order_documents_order_id_idx" ON "sales"."order_documents"("order_id");

-- CreateIndex
CREATE INDEX "order_documents_document_type_idx" ON "sales"."order_documents"("document_type");

-- CreateIndex
CREATE UNIQUE INDEX "order_documents_document_type_document_number_key" ON "sales"."order_documents"("document_type", "document_number");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_idx" ON "sales"."order_status_history"("order_id");

-- CreateIndex
CREATE INDEX "order_status_history_to_status_idx" ON "sales"."order_status_history"("to_status");

-- CreateIndex
CREATE INDEX "order_charges_order_id_idx" ON "sales"."order_charges"("order_id");

-- CreateIndex
CREATE INDEX "order_tax_breakup_order_id_idx" ON "sales"."order_tax_breakup"("order_id");

-- CreateIndex
CREATE INDEX "order_tax_breakup_hsn_code_idx" ON "sales"."order_tax_breakup"("hsn_code");

-- CreateIndex
CREATE UNIQUE INDEX "order_import_batches_batch_code_key" ON "sales"."order_import_batches"("batch_code");

-- CreateIndex
CREATE INDEX "order_import_batches_status_idx" ON "sales"."order_import_batches"("status");

-- CreateIndex
CREATE INDEX "order_import_errors_batch_id_idx" ON "sales"."order_import_errors"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_document_type_key" ON "sales"."document_sequences"("document_type");

-- AddForeignKey
ALTER TABLE "sales"."customers" ADD CONSTRAINT "customers_payment_terms_template_id_fkey" FOREIGN KEY ("payment_terms_template_id") REFERENCES "sales"."payment_terms_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sales"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sales"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."customer_tier_pricing" ADD CONSTRAINT "customer_tier_pricing_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sales"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."customer_tier_pricing" ADD CONSTRAINT "customer_tier_pricing_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "sales"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."customer_tier_pricing" ADD CONSTRAINT "customer_tier_pricing_product_category_id_fkey" FOREIGN KEY ("product_category_id") REFERENCES "sales"."product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."product_categories" ADD CONSTRAINT "product_categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "sales"."product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "sales"."product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."product_size_variants" ADD CONSTRAINT "product_size_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "sales"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."product_tier_pricing" ADD CONSTRAINT "product_tier_pricing_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "sales"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sales"."customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."orders" ADD CONSTRAINT "orders_billing_address_id_fkey" FOREIGN KEY ("billing_address_id") REFERENCES "sales"."customer_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."orders" ADD CONSTRAINT "orders_default_shipping_address_id_fkey" FOREIGN KEY ("default_shipping_address_id") REFERENCES "sales"."customer_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."orders" ADD CONSTRAINT "orders_payment_terms_template_id_fkey" FOREIGN KEY ("payment_terms_template_id") REFERENCES "sales"."payment_terms_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_lines" ADD CONSTRAINT "order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "sales"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_lines" ADD CONSTRAINT "order_lines_product_size_variant_id_fkey" FOREIGN KEY ("product_size_variant_id") REFERENCES "sales"."product_size_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_line_custom_specs" ADD CONSTRAINT "order_line_custom_specs_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "sales"."order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_shipments" ADD CONSTRAINT "order_shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_shipments" ADD CONSTRAINT "order_shipments_shipping_address_id_fkey" FOREIGN KEY ("shipping_address_id") REFERENCES "sales"."customer_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_shipment_lines" ADD CONSTRAINT "order_shipment_lines_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "sales"."order_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_shipment_lines" ADD CONSTRAINT "order_shipment_lines_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "sales"."order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."payment_term_milestones" ADD CONSTRAINT "payment_term_milestones_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "sales"."payment_terms_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_payment_schedule" ADD CONSTRAINT "order_payment_schedule_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_documents" ADD CONSTRAINT "order_documents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_charges" ADD CONSTRAINT "order_charges_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_tax_breakup" ADD CONSTRAINT "order_tax_breakup_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_import_errors" ADD CONSTRAINT "order_import_errors_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "sales"."order_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
