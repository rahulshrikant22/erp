-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "product_engineering";

-- AlterTable
ALTER TABLE "material"."material_import_batches" ADD COLUMN     "on_duplicate" TEXT NOT NULL DEFAULT 'skip';

-- AlterTable
ALTER TABLE "material"."material_import_errors" ADD COLUMN     "corrected_data" JSONB,
ADD COLUMN     "is_resolved" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "product_engineering"."processes" (
    "id" TEXT NOT NULL,
    "process_code" TEXT NOT NULL,
    "process_name" TEXT NOT NULL,
    "process_category" TEXT NOT NULL,
    "standard_time_minutes" DECIMAL(10,2),
    "time_unit" TEXT NOT NULL DEFAULT 'per_panel',
    "labor_cost_per_hour" DECIMAL(10,2),
    "machine_cost_per_hour" DECIMAL(10,2),
    "is_outsourced" BOOLEAN NOT NULL DEFAULT false,
    "default_outsource_vendor_notes" TEXT,
    "station_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_engineering"."process_capabilities" (
    "id" TEXT NOT NULL,
    "process_id" TEXT NOT NULL,
    "capability_key" TEXT NOT NULL,
    "capability_value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_engineering"."boms" (
    "id" TEXT NOT NULL,
    "bom_code" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_size_variant_id" TEXT,
    "bom_name" TEXT NOT NULL,
    "description" TEXT,
    "bom_purpose" TEXT NOT NULL DEFAULT 'estimation_and_po',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "is_locked_for_orders" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "boms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_engineering"."bom_versions" (
    "id" TEXT NOT NULL,
    "bom_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_status" TEXT NOT NULL DEFAULT 'draft',
    "supersedes_version_id" TEXT,
    "revision_summary" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "locked_at_production_start" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "bom_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_engineering"."bom_material_lines" (
    "id" TEXT NOT NULL,
    "bom_version_id" TEXT NOT NULL,
    "line_sequence" INTEGER NOT NULL,
    "line_type" TEXT NOT NULL DEFAULT 'primary',
    "alternate_group_id" TEXT,
    "material_category_id" TEXT,
    "material_type_id" TEXT,
    "specific_material_id" TEXT,
    "is_finish_dependent" BOOLEAN NOT NULL DEFAULT false,
    "quantity_per_unit" DECIMAL(14,4) NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'PCS',
    "wastage_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_material_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_engineering"."bom_process_lines" (
    "id" TEXT NOT NULL,
    "bom_version_id" TEXT NOT NULL,
    "line_sequence" INTEGER NOT NULL,
    "process_id" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "time_per_unit_minutes" DECIMAL(10,2),
    "is_outsourced" BOOLEAN NOT NULL DEFAULT false,
    "outsource_vendor_notes" TEXT,
    "estimated_cost" DECIMAL(14,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_process_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_engineering"."bom_subassemblies" (
    "id" TEXT NOT NULL,
    "parent_bom_version_id" TEXT NOT NULL,
    "child_bom_id" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_subassemblies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_engineering"."bom_change_log" (
    "id" TEXT NOT NULL,
    "bom_id" TEXT NOT NULL,
    "version_id" TEXT,
    "change_type" TEXT NOT NULL,
    "changed_by" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "change_details" JSONB,

    CONSTRAINT "bom_change_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_engineering"."selection_lists" (
    "id" TEXT NOT NULL,
    "selection_list_code" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submitted_by_type" TEXT,
    "submitted_by_user_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "finish_group_name" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "selection_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_engineering"."selection_list_items" (
    "id" TEXT NOT NULL,
    "selection_list_id" TEXT NOT NULL,
    "order_line_id" TEXT,
    "bom_material_line_id" TEXT NOT NULL,
    "selected_material_id" TEXT NOT NULL,
    "alternate_chosen" BOOLEAN NOT NULL DEFAULT false,
    "quantity_override" DECIMAL(14,4),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "selection_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_engineering"."resolved_boms" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "bom_version_id" TEXT NOT NULL,
    "selection_list_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "total_theoretical_material_cost" DECIMAL(14,2),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "resolved_boms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_engineering"."resolved_bom_material_lines" (
    "id" TEXT NOT NULL,
    "resolved_bom_id" TEXT NOT NULL,
    "bom_material_line_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "quantity_required" DECIMAL(14,4) NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'PCS',
    "wastage_percent_applied" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "theoretical_quantity_with_wastage" DECIMAL(14,4),
    "unit_cost_at_resolution" DECIMAL(14,2),
    "line_cost" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resolved_bom_material_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_engineering"."resolved_bom_process_lines" (
    "id" TEXT NOT NULL,
    "resolved_bom_id" TEXT NOT NULL,
    "bom_process_line_id" TEXT NOT NULL,
    "process_id" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "time_per_unit_minutes" DECIMAL(10,2),
    "cost_per_unit_at_resolution" DECIMAL(14,2),
    "line_cost" DECIMAL(14,2),
    "is_outsourced" BOOLEAN NOT NULL DEFAULT false,
    "vendor_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resolved_bom_process_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_engineering"."costing_runs" (
    "id" TEXT NOT NULL,
    "bom_version_id" TEXT NOT NULL,
    "costing_run_number" TEXT NOT NULL,
    "run_type" TEXT NOT NULL DEFAULT 'initial',
    "material_cost_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "labor_cost_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "overhead_cost_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "outsourcing_cost_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "manufacturing_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "overhead_percent_applied" DECIMAL(5,2),
    "margin_percent_applied" DECIMAL(5,2),
    "landing_cost" DECIMAL(14,2),
    "selling_price_excl_tax" DECIMAL(14,2),
    "tax_rate" DECIMAL(5,2),
    "mrp_incl_tax" DECIMAL(14,2),
    "run_by" TEXT,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "costing_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_engineering"."costing_assumptions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "costing_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processes_process_code_key" ON "product_engineering"."processes"("process_code");

-- CreateIndex
CREATE INDEX "processes_process_category_idx" ON "product_engineering"."processes"("process_category");

-- CreateIndex
CREATE INDEX "processes_is_active_idx" ON "product_engineering"."processes"("is_active");

-- CreateIndex
CREATE INDEX "process_capabilities_process_id_idx" ON "product_engineering"."process_capabilities"("process_id");

-- CreateIndex
CREATE UNIQUE INDEX "boms_bom_code_key" ON "product_engineering"."boms"("bom_code");

-- CreateIndex
CREATE INDEX "boms_product_id_idx" ON "product_engineering"."boms"("product_id");

-- CreateIndex
CREATE INDEX "boms_product_size_variant_id_idx" ON "product_engineering"."boms"("product_size_variant_id");

-- CreateIndex
CREATE INDEX "boms_status_idx" ON "product_engineering"."boms"("status");

-- CreateIndex
CREATE INDEX "boms_is_deleted_idx" ON "product_engineering"."boms"("is_deleted");

-- CreateIndex
CREATE INDEX "bom_versions_bom_id_idx" ON "product_engineering"."bom_versions"("bom_id");

-- CreateIndex
CREATE INDEX "bom_versions_version_status_idx" ON "product_engineering"."bom_versions"("version_status");

-- CreateIndex
CREATE INDEX "bom_versions_is_deleted_idx" ON "product_engineering"."bom_versions"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "bom_versions_bom_id_version_number_key" ON "product_engineering"."bom_versions"("bom_id", "version_number");

-- CreateIndex
CREATE INDEX "bom_material_lines_bom_version_id_idx" ON "product_engineering"."bom_material_lines"("bom_version_id");

-- CreateIndex
CREATE INDEX "bom_material_lines_material_category_id_idx" ON "product_engineering"."bom_material_lines"("material_category_id");

-- CreateIndex
CREATE INDEX "bom_material_lines_material_type_id_idx" ON "product_engineering"."bom_material_lines"("material_type_id");

-- CreateIndex
CREATE INDEX "bom_material_lines_specific_material_id_idx" ON "product_engineering"."bom_material_lines"("specific_material_id");

-- CreateIndex
CREATE INDEX "bom_material_lines_alternate_group_id_idx" ON "product_engineering"."bom_material_lines"("alternate_group_id");

-- CreateIndex
CREATE INDEX "bom_process_lines_bom_version_id_idx" ON "product_engineering"."bom_process_lines"("bom_version_id");

-- CreateIndex
CREATE INDEX "bom_process_lines_process_id_idx" ON "product_engineering"."bom_process_lines"("process_id");

-- CreateIndex
CREATE INDEX "bom_subassemblies_parent_bom_version_id_idx" ON "product_engineering"."bom_subassemblies"("parent_bom_version_id");

-- CreateIndex
CREATE INDEX "bom_subassemblies_child_bom_id_idx" ON "product_engineering"."bom_subassemblies"("child_bom_id");

-- CreateIndex
CREATE INDEX "bom_change_log_bom_id_idx" ON "product_engineering"."bom_change_log"("bom_id");

-- CreateIndex
CREATE INDEX "bom_change_log_version_id_idx" ON "product_engineering"."bom_change_log"("version_id");

-- CreateIndex
CREATE INDEX "bom_change_log_change_type_idx" ON "product_engineering"."bom_change_log"("change_type");

-- CreateIndex
CREATE UNIQUE INDEX "selection_lists_selection_list_code_key" ON "product_engineering"."selection_lists"("selection_list_code");

-- CreateIndex
CREATE INDEX "selection_lists_order_id_idx" ON "product_engineering"."selection_lists"("order_id");

-- CreateIndex
CREATE INDEX "selection_lists_status_idx" ON "product_engineering"."selection_lists"("status");

-- CreateIndex
CREATE INDEX "selection_lists_is_deleted_idx" ON "product_engineering"."selection_lists"("is_deleted");

-- CreateIndex
CREATE INDEX "selection_list_items_selection_list_id_idx" ON "product_engineering"."selection_list_items"("selection_list_id");

-- CreateIndex
CREATE INDEX "selection_list_items_order_line_id_idx" ON "product_engineering"."selection_list_items"("order_line_id");

-- CreateIndex
CREATE INDEX "selection_list_items_bom_material_line_id_idx" ON "product_engineering"."selection_list_items"("bom_material_line_id");

-- CreateIndex
CREATE INDEX "selection_list_items_selected_material_id_idx" ON "product_engineering"."selection_list_items"("selected_material_id");

-- CreateIndex
CREATE INDEX "resolved_boms_order_id_idx" ON "product_engineering"."resolved_boms"("order_id");

-- CreateIndex
CREATE INDEX "resolved_boms_order_line_id_idx" ON "product_engineering"."resolved_boms"("order_line_id");

-- CreateIndex
CREATE INDEX "resolved_boms_bom_version_id_idx" ON "product_engineering"."resolved_boms"("bom_version_id");

-- CreateIndex
CREATE INDEX "resolved_boms_selection_list_id_idx" ON "product_engineering"."resolved_boms"("selection_list_id");

-- CreateIndex
CREATE INDEX "resolved_boms_status_idx" ON "product_engineering"."resolved_boms"("status");

-- CreateIndex
CREATE INDEX "resolved_boms_is_deleted_idx" ON "product_engineering"."resolved_boms"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "resolved_boms_order_id_order_line_id_bom_version_id_key" ON "product_engineering"."resolved_boms"("order_id", "order_line_id", "bom_version_id");

-- CreateIndex
CREATE INDEX "resolved_bom_material_lines_resolved_bom_id_idx" ON "product_engineering"."resolved_bom_material_lines"("resolved_bom_id");

-- CreateIndex
CREATE INDEX "resolved_bom_material_lines_bom_material_line_id_idx" ON "product_engineering"."resolved_bom_material_lines"("bom_material_line_id");

-- CreateIndex
CREATE INDEX "resolved_bom_material_lines_material_id_idx" ON "product_engineering"."resolved_bom_material_lines"("material_id");

-- CreateIndex
CREATE INDEX "resolved_bom_process_lines_resolved_bom_id_idx" ON "product_engineering"."resolved_bom_process_lines"("resolved_bom_id");

-- CreateIndex
CREATE INDEX "resolved_bom_process_lines_bom_process_line_id_idx" ON "product_engineering"."resolved_bom_process_lines"("bom_process_line_id");

-- CreateIndex
CREATE INDEX "resolved_bom_process_lines_process_id_idx" ON "product_engineering"."resolved_bom_process_lines"("process_id");

-- CreateIndex
CREATE UNIQUE INDEX "costing_runs_costing_run_number_key" ON "product_engineering"."costing_runs"("costing_run_number");

-- CreateIndex
CREATE INDEX "costing_runs_bom_version_id_idx" ON "product_engineering"."costing_runs"("bom_version_id");

-- CreateIndex
CREATE INDEX "costing_runs_run_type_idx" ON "product_engineering"."costing_runs"("run_type");

-- CreateIndex
CREATE UNIQUE INDEX "costing_assumptions_key_key" ON "product_engineering"."costing_assumptions"("key");

-- CreateIndex
CREATE INDEX "material_import_errors_is_resolved_idx" ON "material"."material_import_errors"("is_resolved");

-- AddForeignKey
ALTER TABLE "product_engineering"."process_capabilities" ADD CONSTRAINT "process_capabilities_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "product_engineering"."processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."boms" ADD CONSTRAINT "boms_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "sales"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."boms" ADD CONSTRAINT "boms_product_size_variant_id_fkey" FOREIGN KEY ("product_size_variant_id") REFERENCES "sales"."product_size_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."bom_versions" ADD CONSTRAINT "bom_versions_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "product_engineering"."boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."bom_versions" ADD CONSTRAINT "bom_versions_supersedes_version_id_fkey" FOREIGN KEY ("supersedes_version_id") REFERENCES "product_engineering"."bom_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."bom_material_lines" ADD CONSTRAINT "bom_material_lines_bom_version_id_fkey" FOREIGN KEY ("bom_version_id") REFERENCES "product_engineering"."bom_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."bom_material_lines" ADD CONSTRAINT "bom_material_lines_material_category_id_fkey" FOREIGN KEY ("material_category_id") REFERENCES "material"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."bom_material_lines" ADD CONSTRAINT "bom_material_lines_material_type_id_fkey" FOREIGN KEY ("material_type_id") REFERENCES "material"."material_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."bom_material_lines" ADD CONSTRAINT "bom_material_lines_specific_material_id_fkey" FOREIGN KEY ("specific_material_id") REFERENCES "material"."materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."bom_process_lines" ADD CONSTRAINT "bom_process_lines_bom_version_id_fkey" FOREIGN KEY ("bom_version_id") REFERENCES "product_engineering"."bom_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."bom_process_lines" ADD CONSTRAINT "bom_process_lines_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "product_engineering"."processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."bom_subassemblies" ADD CONSTRAINT "bom_subassemblies_parent_bom_version_id_fkey" FOREIGN KEY ("parent_bom_version_id") REFERENCES "product_engineering"."bom_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."bom_subassemblies" ADD CONSTRAINT "bom_subassemblies_child_bom_id_fkey" FOREIGN KEY ("child_bom_id") REFERENCES "product_engineering"."boms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."bom_change_log" ADD CONSTRAINT "bom_change_log_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "product_engineering"."boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."bom_change_log" ADD CONSTRAINT "bom_change_log_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "product_engineering"."bom_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."selection_lists" ADD CONSTRAINT "selection_lists_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."selection_list_items" ADD CONSTRAINT "selection_list_items_selection_list_id_fkey" FOREIGN KEY ("selection_list_id") REFERENCES "product_engineering"."selection_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."selection_list_items" ADD CONSTRAINT "selection_list_items_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "sales"."order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."selection_list_items" ADD CONSTRAINT "selection_list_items_bom_material_line_id_fkey" FOREIGN KEY ("bom_material_line_id") REFERENCES "product_engineering"."bom_material_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."selection_list_items" ADD CONSTRAINT "selection_list_items_selected_material_id_fkey" FOREIGN KEY ("selected_material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."resolved_boms" ADD CONSTRAINT "resolved_boms_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."resolved_boms" ADD CONSTRAINT "resolved_boms_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "sales"."order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."resolved_boms" ADD CONSTRAINT "resolved_boms_bom_version_id_fkey" FOREIGN KEY ("bom_version_id") REFERENCES "product_engineering"."bom_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."resolved_boms" ADD CONSTRAINT "resolved_boms_selection_list_id_fkey" FOREIGN KEY ("selection_list_id") REFERENCES "product_engineering"."selection_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."resolved_bom_material_lines" ADD CONSTRAINT "resolved_bom_material_lines_resolved_bom_id_fkey" FOREIGN KEY ("resolved_bom_id") REFERENCES "product_engineering"."resolved_boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."resolved_bom_material_lines" ADD CONSTRAINT "resolved_bom_material_lines_bom_material_line_id_fkey" FOREIGN KEY ("bom_material_line_id") REFERENCES "product_engineering"."bom_material_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."resolved_bom_material_lines" ADD CONSTRAINT "resolved_bom_material_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."resolved_bom_process_lines" ADD CONSTRAINT "resolved_bom_process_lines_resolved_bom_id_fkey" FOREIGN KEY ("resolved_bom_id") REFERENCES "product_engineering"."resolved_boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."resolved_bom_process_lines" ADD CONSTRAINT "resolved_bom_process_lines_bom_process_line_id_fkey" FOREIGN KEY ("bom_process_line_id") REFERENCES "product_engineering"."bom_process_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."resolved_bom_process_lines" ADD CONSTRAINT "resolved_bom_process_lines_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "product_engineering"."processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_engineering"."costing_runs" ADD CONSTRAINT "costing_runs_bom_version_id_fkey" FOREIGN KEY ("bom_version_id") REFERENCES "product_engineering"."bom_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
