-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "material";

-- CreateTable
CREATE TABLE "material"."categories" (
    "id" TEXT NOT NULL,
    "category_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "icon" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material"."material_types" (
    "id" TEXT NOT NULL,
    "type_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inventory_behavior" JSONB,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material"."category_type_profiles" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "material_type_id" TEXT NOT NULL,
    "profile_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_type_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material"."attributes" (
    "id" TEXT NOT NULL,
    "category_type_profile_id" TEXT NOT NULL,
    "attribute_code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "display_group" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_identity" BOOLEAN NOT NULL DEFAULT false,
    "feeds_name" BOOLEAN NOT NULL DEFAULT false,
    "feeds_sku" BOOLEAN NOT NULL DEFAULT false,
    "name_position" INTEGER,
    "sku_position" INTEGER,
    "is_manufacturer_scoped" BOOLEAN NOT NULL DEFAULT false,
    "default_value" TEXT,
    "placeholder" TEXT,
    "help_text" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material"."attribute_values" (
    "id" TEXT NOT NULL,
    "attribute_id" TEXT NOT NULL,
    "value_label" TEXT NOT NULL,
    "value_short_code" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "manufacturer_id" TEXT,
    "swatch_image_path" TEXT,
    "hex_color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material"."attribute_visibility_rules" (
    "id" TEXT NOT NULL,
    "attribute_id" TEXT NOT NULL,
    "depends_on_attribute_id" TEXT NOT NULL,
    "condition_operator" TEXT NOT NULL,
    "condition_values" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attribute_visibility_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material"."attribute_value_dependencies" (
    "id" TEXT NOT NULL,
    "attribute_id" TEXT NOT NULL,
    "depends_on_attribute_id" TEXT NOT NULL,
    "filter_map" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attribute_value_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material"."manufacturers" (
    "id" TEXT NOT NULL,
    "manufacturer_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "website" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material"."manufacturer_catalogs" (
    "id" TEXT NOT NULL,
    "manufacturer_id" TEXT NOT NULL,
    "catalog_type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "additional_attributes" JSONB,
    "reference_image_path" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "manufacturer_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material"."catalog_import_batches" (
    "id" TEXT NOT NULL,
    "manufacturer_id" TEXT NOT NULL,
    "catalog_type" TEXT NOT NULL,
    "source_filename" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "success_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "uploaded_by" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_log_path" TEXT,

    CONSTRAINT "catalog_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material"."naming_formats" (
    "id" TEXT NOT NULL,
    "category_type_profile_id" TEXT NOT NULL,
    "format_type" TEXT NOT NULL,
    "format_template" JSONB NOT NULL,
    "separator" TEXT NOT NULL DEFAULT '-',
    "preview_example" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "naming_formats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material"."materials" (
    "id" TEXT NOT NULL,
    "material_code" TEXT NOT NULL,
    "material_name" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "material_type_id" TEXT NOT NULL,
    "category_type_profile_id" TEXT NOT NULL,
    "manufacturer_id" TEXT NOT NULL,
    "attribute_hash" TEXT NOT NULL,
    "purchase_uom" TEXT NOT NULL,
    "consumption_uom" TEXT NOT NULL,
    "uom_conversion_factor" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "min_stock_level" DECIMAL(14,3),
    "reorder_level" DECIMAL(14,3),
    "max_stock_level" DECIMAL(14,3),
    "primary_image_path" TEXT,
    "has_pending_image" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material"."material_attribute_values" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "attribute_id" TEXT NOT NULL,
    "attribute_value_id" TEXT,
    "raw_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material"."material_images" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "image_path" TEXT NOT NULL,
    "image_type" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material"."category_image_rules" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "image_requirement" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_image_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material"."material_import_batches" (
    "id" TEXT NOT NULL,
    "category_id" TEXT,
    "material_type_id" TEXT,
    "source_filename" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "success_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "imported_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material"."material_import_errors" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "field" TEXT,
    "message" TEXT NOT NULL,
    "row_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_category_code_key" ON "material"."categories"("category_code");

-- CreateIndex
CREATE INDEX "categories_is_active_idx" ON "material"."categories"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "material_types_type_code_key" ON "material"."material_types"("type_code");

-- CreateIndex
CREATE INDEX "material_types_is_active_idx" ON "material"."material_types"("is_active");

-- CreateIndex
CREATE INDEX "category_type_profiles_category_id_idx" ON "material"."category_type_profiles"("category_id");

-- CreateIndex
CREATE INDEX "category_type_profiles_material_type_id_idx" ON "material"."category_type_profiles"("material_type_id");

-- CreateIndex
CREATE INDEX "category_type_profiles_is_active_idx" ON "material"."category_type_profiles"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "category_type_profiles_category_id_material_type_id_key" ON "material"."category_type_profiles"("category_id", "material_type_id");

-- CreateIndex
CREATE INDEX "attributes_category_type_profile_id_idx" ON "material"."attributes"("category_type_profile_id");

-- CreateIndex
CREATE INDEX "attributes_is_active_idx" ON "material"."attributes"("is_active");

-- CreateIndex
CREATE INDEX "attributes_is_identity_idx" ON "material"."attributes"("is_identity");

-- CreateIndex
CREATE UNIQUE INDEX "attributes_category_type_profile_id_attribute_code_key" ON "material"."attributes"("category_type_profile_id", "attribute_code");

-- CreateIndex
CREATE INDEX "attribute_values_attribute_id_idx" ON "material"."attribute_values"("attribute_id");

-- CreateIndex
CREATE INDEX "attribute_values_manufacturer_id_idx" ON "material"."attribute_values"("manufacturer_id");

-- CreateIndex
CREATE INDEX "attribute_values_is_active_idx" ON "material"."attribute_values"("is_active");

-- CreateIndex
CREATE INDEX "attribute_visibility_rules_attribute_id_idx" ON "material"."attribute_visibility_rules"("attribute_id");

-- CreateIndex
CREATE INDEX "attribute_visibility_rules_depends_on_attribute_id_idx" ON "material"."attribute_visibility_rules"("depends_on_attribute_id");

-- CreateIndex
CREATE INDEX "attribute_value_dependencies_attribute_id_idx" ON "material"."attribute_value_dependencies"("attribute_id");

-- CreateIndex
CREATE INDEX "attribute_value_dependencies_depends_on_attribute_id_idx" ON "material"."attribute_value_dependencies"("depends_on_attribute_id");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturers_manufacturer_code_key" ON "material"."manufacturers"("manufacturer_code");

-- CreateIndex
CREATE INDEX "manufacturers_is_active_idx" ON "material"."manufacturers"("is_active");

-- CreateIndex
CREATE INDEX "manufacturers_is_deleted_idx" ON "material"."manufacturers"("is_deleted");

-- CreateIndex
CREATE INDEX "manufacturer_catalogs_manufacturer_id_idx" ON "material"."manufacturer_catalogs"("manufacturer_id");

-- CreateIndex
CREATE INDEX "manufacturer_catalogs_catalog_type_idx" ON "material"."manufacturer_catalogs"("catalog_type");

-- CreateIndex
CREATE INDEX "manufacturer_catalogs_is_active_idx" ON "material"."manufacturer_catalogs"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturer_catalogs_manufacturer_id_catalog_type_code_key" ON "material"."manufacturer_catalogs"("manufacturer_id", "catalog_type", "code");

-- CreateIndex
CREATE INDEX "catalog_import_batches_manufacturer_id_idx" ON "material"."catalog_import_batches"("manufacturer_id");

-- CreateIndex
CREATE INDEX "catalog_import_batches_status_idx" ON "material"."catalog_import_batches"("status");

-- CreateIndex
CREATE INDEX "naming_formats_category_type_profile_id_idx" ON "material"."naming_formats"("category_type_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "naming_formats_category_type_profile_id_format_type_key" ON "material"."naming_formats"("category_type_profile_id", "format_type");

-- CreateIndex
CREATE UNIQUE INDEX "materials_material_code_key" ON "material"."materials"("material_code");

-- CreateIndex
CREATE UNIQUE INDEX "materials_attribute_hash_key" ON "material"."materials"("attribute_hash");

-- CreateIndex
CREATE INDEX "materials_category_id_idx" ON "material"."materials"("category_id");

-- CreateIndex
CREATE INDEX "materials_material_type_id_idx" ON "material"."materials"("material_type_id");

-- CreateIndex
CREATE INDEX "materials_category_type_profile_id_idx" ON "material"."materials"("category_type_profile_id");

-- CreateIndex
CREATE INDEX "materials_manufacturer_id_idx" ON "material"."materials"("manufacturer_id");

-- CreateIndex
CREATE INDEX "materials_is_active_idx" ON "material"."materials"("is_active");

-- CreateIndex
CREATE INDEX "materials_is_deleted_idx" ON "material"."materials"("is_deleted");

-- CreateIndex
CREATE INDEX "materials_has_pending_image_idx" ON "material"."materials"("has_pending_image");

-- CreateIndex
CREATE INDEX "material_attribute_values_material_id_idx" ON "material"."material_attribute_values"("material_id");

-- CreateIndex
CREATE INDEX "material_attribute_values_attribute_id_idx" ON "material"."material_attribute_values"("attribute_id");

-- CreateIndex
CREATE INDEX "material_attribute_values_attribute_value_id_idx" ON "material"."material_attribute_values"("attribute_value_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_attribute_values_material_id_attribute_id_key" ON "material"."material_attribute_values"("material_id", "attribute_id");

-- CreateIndex
CREATE INDEX "material_images_material_id_idx" ON "material"."material_images"("material_id");

-- CreateIndex
CREATE INDEX "material_images_image_type_idx" ON "material"."material_images"("image_type");

-- CreateIndex
CREATE UNIQUE INDEX "category_image_rules_category_id_key" ON "material"."category_image_rules"("category_id");

-- CreateIndex
CREATE INDEX "material_import_batches_status_idx" ON "material"."material_import_batches"("status");

-- CreateIndex
CREATE INDEX "material_import_errors_batch_id_idx" ON "material"."material_import_errors"("batch_id");

-- AddForeignKey
ALTER TABLE "material"."category_type_profiles" ADD CONSTRAINT "category_type_profiles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "material"."categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."category_type_profiles" ADD CONSTRAINT "category_type_profiles_material_type_id_fkey" FOREIGN KEY ("material_type_id") REFERENCES "material"."material_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."attributes" ADD CONSTRAINT "attributes_category_type_profile_id_fkey" FOREIGN KEY ("category_type_profile_id") REFERENCES "material"."category_type_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."attribute_values" ADD CONSTRAINT "attribute_values_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "material"."attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."attribute_values" ADD CONSTRAINT "attribute_values_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "material"."manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."attribute_visibility_rules" ADD CONSTRAINT "attribute_visibility_rules_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "material"."attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."attribute_visibility_rules" ADD CONSTRAINT "attribute_visibility_rules_depends_on_attribute_id_fkey" FOREIGN KEY ("depends_on_attribute_id") REFERENCES "material"."attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."attribute_value_dependencies" ADD CONSTRAINT "attribute_value_dependencies_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "material"."attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."attribute_value_dependencies" ADD CONSTRAINT "attribute_value_dependencies_depends_on_attribute_id_fkey" FOREIGN KEY ("depends_on_attribute_id") REFERENCES "material"."attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."manufacturer_catalogs" ADD CONSTRAINT "manufacturer_catalogs_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "material"."manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."naming_formats" ADD CONSTRAINT "naming_formats_category_type_profile_id_fkey" FOREIGN KEY ("category_type_profile_id") REFERENCES "material"."category_type_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."materials" ADD CONSTRAINT "materials_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "material"."categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."materials" ADD CONSTRAINT "materials_material_type_id_fkey" FOREIGN KEY ("material_type_id") REFERENCES "material"."material_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."materials" ADD CONSTRAINT "materials_category_type_profile_id_fkey" FOREIGN KEY ("category_type_profile_id") REFERENCES "material"."category_type_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."materials" ADD CONSTRAINT "materials_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "material"."manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."material_attribute_values" ADD CONSTRAINT "material_attribute_values_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."material_attribute_values" ADD CONSTRAINT "material_attribute_values_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "material"."attributes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."material_attribute_values" ADD CONSTRAINT "material_attribute_values_attribute_value_id_fkey" FOREIGN KEY ("attribute_value_id") REFERENCES "material"."attribute_values"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."material_images" ADD CONSTRAINT "material_images_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."category_image_rules" ADD CONSTRAINT "category_image_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "material"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material"."material_import_errors" ADD CONSTRAINT "material_import_errors_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "material"."material_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
