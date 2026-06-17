-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "inventory";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "vendor";

-- CreateTable
CREATE TABLE "vendor"."vendors" (
    "id" TEXT NOT NULL,
    "vendor_code" TEXT NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "legal_name" TEXT,
    "vendor_type" TEXT NOT NULL DEFAULT 'domestic',
    "is_blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "blacklist_reason" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "msme_registered" BOOLEAN NOT NULL DEFAULT false,
    "msme_number" TEXT,
    "primary_email" TEXT,
    "primary_phone" TEXT,
    "website" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'INR',
    "payment_terms_template_id" TEXT,
    "credit_limit" DECIMAL(14,2),
    "credit_days" INTEGER,
    "bank_name" TEXT,
    "bank_account_number" TEXT,
    "bank_ifsc" TEXT,
    "bank_swift_code" TEXT,
    "rating" SMALLINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "iec_code" TEXT,
    "default_incoterms" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor"."vendor_contacts" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "designation" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'sales',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor"."vendor_addresses" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "address_type" TEXT NOT NULL,
    "address_line_1" TEXT NOT NULL,
    "address_line_2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "state_code" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "pincode" TEXT,
    "port_of_loading" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor"."vendor_documents" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_path" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "uploaded_by" TEXT,

    CONSTRAINT "vendor_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor"."rate_contracts" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "manufacturer_id" TEXT,
    "is_authorized_dealer" BOOLEAN NOT NULL DEFAULT false,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'INR',
    "uom" TEXT NOT NULL DEFAULT 'PCS',
    "min_order_quantity" DECIMAL(10,3),
    "lead_time_days" INTEGER,
    "validity_from" TIMESTAMP(3) NOT NULL,
    "validity_until" TIMESTAMP(3),
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "rate_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor"."rate_contract_history" (
    "id" TEXT NOT NULL,
    "rate_contract_id" TEXT NOT NULL,
    "old_price" DECIMAL(14,4) NOT NULL,
    "new_price" DECIMAL(14,4) NOT NULL,
    "change_reason" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" TEXT,

    CONSTRAINT "rate_contract_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."storage_locations" (
    "id" TEXT NOT NULL,
    "location_code" TEXT NOT NULL,
    "location_name" TEXT NOT NULL,
    "location_type" TEXT NOT NULL,
    "branch_id" TEXT,
    "parent_location_id" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_frozen" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."storage_racks" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "rack_code" TEXT NOT NULL,
    "rack_name" TEXT,
    "capacity_kg" DECIMAL(10,2),
    "capacity_volume" DECIMAL(10,2),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_racks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."storage_bins" (
    "id" TEXT NOT NULL,
    "rack_id" TEXT NOT NULL,
    "bin_code" TEXT NOT NULL,
    "bin_label" TEXT,
    "capacity" DECIMAL(10,2),
    "material_category_restriction" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_bins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."storage_general_areas" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "area_code" TEXT NOT NULL,
    "area_name" TEXT NOT NULL,
    "description" TEXT,
    "material_category_restriction" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_general_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."stock" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "bin_id" TEXT,
    "general_area_id" TEXT,
    "current_quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reserved_quantity_soft" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reserved_quantity_hard" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "last_movement_at" TIMESTAMP(3),
    "last_count_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."stock_batches" (
    "id" TEXT NOT NULL,
    "stock_id" TEXT NOT NULL,
    "batch_number" TEXT,
    "grn_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "original_quantity" DECIMAL(14,4) NOT NULL,
    "current_quantity" DECIMAL(14,4) NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "total_cost" DECIMAL(14,2) NOT NULL,
    "expiry_date" TIMESTAMP(3),
    "lot_number" TEXT,
    "is_quarantined" BOOLEAN NOT NULL DEFAULT false,
    "quarantine_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."stock_movements" (
    "id" TEXT NOT NULL,
    "movement_number" TEXT NOT NULL,
    "movement_type" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "source_location_id" TEXT,
    "destination_location_id" TEXT,
    "source_bin_id" TEXT,
    "destination_bin_id" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL,
    "batch_id" TEXT,
    "unit_cost_at_movement" DECIMAL(14,4),
    "total_cost" DECIMAL(14,2),
    "reference_doc_type" TEXT,
    "reference_doc_id" TEXT,
    "moved_by" TEXT,
    "moved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."reservations" (
    "id" TEXT NOT NULL,
    "reservation_number" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "location_id" TEXT,
    "reserved_quantity" DECIMAL(14,4) NOT NULL,
    "reservation_type" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reserved_by" TEXT,
    "expires_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "release_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."purchase_requisitions" (
    "id" TEXT NOT NULL,
    "pr_number" TEXT NOT NULL,
    "pr_type" TEXT NOT NULL DEFAULT 'manual',
    "source_type" TEXT NOT NULL DEFAULT 'manual',
    "source_orders" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "requested_by" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "required_by_date" TIMESTAMP(3),
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "total_estimated_value" DECIMAL(14,2),
    "currency_code" TEXT NOT NULL DEFAULT 'INR',
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."purchase_requisition_lines" (
    "id" TEXT NOT NULL,
    "pr_id" TEXT NOT NULL,
    "line_sequence" INTEGER NOT NULL,
    "material_id" TEXT NOT NULL,
    "quantity_requested" DECIMAL(14,4) NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'PCS',
    "estimated_unit_price" DECIMAL(14,4),
    "estimated_line_value" DECIMAL(14,2),
    "suggested_vendor_id" TEXT,
    "po_raised_quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requisition_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."purchase_orders" (
    "id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "po_type" TEXT NOT NULL DEFAULT 'domestic',
    "vendor_id" TEXT NOT NULL,
    "vendor_contact_id" TEXT,
    "source_pr_id" TEXT,
    "branch_id" TEXT,
    "delivery_location_id" TEXT,
    "po_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_delivery_date" TIMESTAMP(3),
    "currency_code" TEXT NOT NULL DEFAULT 'INR',
    "exchange_rate_at_po" DECIMAL(10,4),
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxable_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_charges" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_terms_template_id" TEXT,
    "payment_terms_notes" TEXT,
    "delivery_terms" TEXT,
    "shipping_mode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approval_workflow_instance_id" TEXT,
    "vendor_acknowledged_at" TIMESTAMP(3),
    "vendor_acknowledgement_method" TEXT,
    "sent_to_vendor_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "is_historical" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."purchase_order_lines" (
    "id" TEXT NOT NULL,
    "po_id" TEXT NOT NULL,
    "line_sequence" INTEGER NOT NULL,
    "material_id" TEXT NOT NULL,
    "pr_line_id" TEXT,
    "quantity_ordered" DECIMAL(14,4) NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'PCS',
    "unit_price" DECIMAL(14,4) NOT NULL,
    "line_value" DECIMAL(14,2) NOT NULL,
    "hsn_code" TEXT,
    "tax_rate" DECIMAL(5,2),
    "tax_amount" DECIMAL(14,2),
    "expected_delivery_date" TIMESTAMP(3),
    "received_quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."po_approvals" (
    "id" TEXT NOT NULL,
    "po_id" TEXT NOT NULL,
    "approval_level" INTEGER NOT NULL,
    "required_role" TEXT NOT NULL,
    "approver_user_id" TEXT,
    "approval_status" TEXT NOT NULL DEFAULT 'pending',
    "responded_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "po_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."po_communications" (
    "id" TEXT NOT NULL,
    "po_id" TEXT NOT NULL,
    "comm_type" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_by" TEXT,
    "recipient" TEXT,
    "delivered_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "response_received_at" TIMESTAMP(3),
    "response_via" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "po_communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."import_shipments" (
    "id" TEXT NOT NULL,
    "shipment_number" TEXT NOT NULL,
    "supplier_invoice_number" TEXT,
    "supplier_invoice_date" TIMESTAMP(3),
    "supplier_invoice_value" DECIMAL(14,2),
    "currency_code" TEXT NOT NULL DEFAULT 'USD',
    "exchange_rate" DECIMAL(10,4),
    "container_number" TEXT,
    "container_size" TEXT,
    "seal_number" TEXT,
    "vessel_name" TEXT,
    "voyage_number" TEXT,
    "bill_of_lading_number" TEXT,
    "bill_of_lading_date" TIMESTAMP(3),
    "port_of_loading" TEXT,
    "port_of_discharge" TEXT,
    "eta" TIMESTAMP(3),
    "ata" TIMESTAMP(3),
    "shipping_line" TEXT,
    "freight_forwarder" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in_transit',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,

    CONSTRAINT "import_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."import_shipment_pos" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "po_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_shipment_pos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."import_customs" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "bill_of_entry_number" TEXT,
    "bill_of_entry_date" TIMESTAMP(3),
    "assessable_value" DECIMAL(14,2),
    "basic_customs_duty" DECIMAL(14,2),
    "igst_amount" DECIMAL(14,2),
    "social_welfare_surcharge" DECIMAL(14,2),
    "anti_dumping_duty" DECIMAL(14,2),
    "cha_charges" DECIMAL(14,2),
    "port_charges" DECIMAL(14,2),
    "transport_charges" DECIMAL(14,2),
    "insurance" DECIMAL(14,2),
    "other_charges" DECIMAL(14,2),
    "total_customs_charges" DECIMAL(14,2),
    "total_landed_cost" DECIMAL(14,2),
    "cha_name" TEXT,
    "cha_contact" TEXT,
    "cleared_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_customs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."import_landed_cost_allocations" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "po_line_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "fob_value" DECIMAL(14,2),
    "freight_allocated" DECIMAL(14,2),
    "insurance_allocated" DECIMAL(14,2),
    "customs_duty_allocated" DECIMAL(14,2),
    "other_charges_allocated" DECIMAL(14,2),
    "total_landed_cost_per_unit" DECIMAL(14,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_landed_cost_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."goods_receipt_notes" (
    "id" TEXT NOT NULL,
    "grn_number" TEXT NOT NULL,
    "grn_type" TEXT NOT NULL DEFAULT 'domestic',
    "po_id" TEXT NOT NULL,
    "shipment_id" TEXT,
    "vendor_id" TEXT NOT NULL,
    "delivery_challan_number" TEXT,
    "delivery_challan_date" TIMESTAMP(3),
    "vehicle_number" TEXT,
    "driver_name" TEXT,
    "driver_phone" TEXT,
    "received_at_location_id" TEXT NOT NULL,
    "received_by" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gate_pass_number" TEXT,
    "security_clearance_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "total_quantity_received" DECIMAL(14,4),
    "total_value" DECIMAL(14,2),
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipt_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."goods_receipt_lines" (
    "id" TEXT NOT NULL,
    "grn_id" TEXT NOT NULL,
    "po_line_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "quantity_received" DECIMAL(14,4) NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'PCS',
    "unit_price" DECIMAL(14,4) NOT NULL,
    "quantity_tolerance_used" DECIMAL(5,2),
    "batch_number" TEXT,
    "lot_number" TEXT,
    "expiry_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'received',
    "accepted_quantity" DECIMAL(14,4),
    "rejected_quantity" DECIMAL(14,4),
    "rejection_reason" TEXT,
    "bin_id" TEXT,
    "general_area_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."grn_documents" (
    "id" TEXT NOT NULL,
    "grn_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_path" TEXT NOT NULL,
    "uploaded_by" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grn_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."quality_inspections" (
    "id" TEXT NOT NULL,
    "inspection_number" TEXT NOT NULL,
    "grn_id" TEXT NOT NULL,
    "grn_line_id" TEXT,
    "material_id" TEXT NOT NULL,
    "inspection_type" TEXT NOT NULL DEFAULT 'incoming',
    "inspector_user_id" TEXT,
    "inspection_started_at" TIMESTAMP(3),
    "inspection_completed_at" TIMESTAMP(3),
    "overall_result" TEXT NOT NULL DEFAULT 'pending',
    "deviation_notes" TEXT,
    "approved_by_for_deviation" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."quality_inspection_parameters" (
    "id" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "parameter_name" TEXT NOT NULL,
    "expected_value" TEXT,
    "actual_value" TEXT,
    "tolerance" TEXT,
    "result" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_inspection_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."quality_inspection_photos" (
    "id" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "photo_type" TEXT NOT NULL,
    "photo_path" TEXT NOT NULL,
    "caption" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_inspection_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."material_requisitions" (
    "id" TEXT NOT NULL,
    "mr_number" TEXT NOT NULL,
    "production_job_id" TEXT,
    "nesting_run_id" TEXT,
    "request_type" TEXT NOT NULL DEFAULT 'general',
    "requesting_user_id" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "required_by_date" TIMESTAMP(3),
    "approval_status" TEXT NOT NULL DEFAULT 'pending',
    "approver_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."material_requisition_lines" (
    "id" TEXT NOT NULL,
    "mr_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "quantity_required" DECIMAL(14,4) NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'PCS',
    "nesting_run_line_id" TEXT,
    "preferred_location_id" TEXT,
    "issued_quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_requisition_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."material_issue_notes" (
    "id" TEXT NOT NULL,
    "min_number" TEXT NOT NULL,
    "mr_id" TEXT NOT NULL,
    "production_job_id" TEXT,
    "nesting_run_id" TEXT,
    "issued_from_location_id" TEXT NOT NULL,
    "issued_to_destination" TEXT,
    "issued_by" TEXT,
    "issued_at" TIMESTAMP(3),
    "received_by_user_id" TEXT,
    "received_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_issue_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."material_issue_note_lines" (
    "id" TEXT NOT NULL,
    "min_id" TEXT NOT NULL,
    "mr_line_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "quantity_issued" DECIMAL(14,4) NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'PCS',
    "batch_id" TEXT,
    "unit_cost" DECIMAL(14,4),
    "bin_id" TEXT,
    "nesting_run_line_id" TEXT,
    "return_quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_issue_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."material_return_notes" (
    "id" TEXT NOT NULL,
    "mrn_number" TEXT NOT NULL,
    "original_min_id" TEXT NOT NULL,
    "production_job_id" TEXT,
    "returned_by" TEXT,
    "returned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at_location_id" TEXT NOT NULL,
    "received_by_user_id" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_return_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."material_return_note_lines" (
    "id" TEXT NOT NULL,
    "mrn_id" TEXT NOT NULL,
    "min_line_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "quantity_returned" DECIMAL(14,4) NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'PCS',
    "batch_id" TEXT,
    "unit_cost" DECIMAL(14,4),
    "condition" TEXT NOT NULL DEFAULT 'good_back_to_stock',
    "destination_location_id" TEXT,
    "destination_bin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_return_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."stock_count_sessions" (
    "id" TEXT NOT NULL,
    "count_number" TEXT NOT NULL,
    "count_type" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "planned_start_date" TIMESTAMP(3),
    "planned_end_date" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'planned',
    "counted_by_users" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_count_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."stock_count_lines" (
    "id" TEXT NOT NULL,
    "count_session_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "bin_id" TEXT,
    "general_area_id" TEXT,
    "system_quantity" DECIMAL(14,4) NOT NULL,
    "counted_quantity" DECIMAL(14,4),
    "variance" DECIMAL(14,4),
    "variance_reason" TEXT,
    "counted_by" TEXT,
    "counted_at" TIMESTAMP(3),
    "recount_required" BOOLEAN NOT NULL DEFAULT false,
    "recounted_quantity" DECIMAL(14,4),
    "adjustment_movement_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."stock_adjustments" (
    "id" TEXT NOT NULL,
    "adjustment_number" TEXT NOT NULL,
    "adjustment_type" TEXT NOT NULL,
    "requested_by" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "approval_status" TEXT NOT NULL DEFAULT 'pending',
    "total_value_impact" DECIMAL(14,2),
    "reason" TEXT,
    "supporting_documents" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."stock_adjustment_lines" (
    "id" TEXT NOT NULL,
    "adjustment_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "location_id" TEXT NOT NULL,
    "bin_id" TEXT,
    "direction" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_cost_used" DECIMAL(14,4),
    "line_value_impact" DECIMAL(14,2),
    "resulting_movement_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_adjustment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."reorder_alerts" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "current_quantity" DECIMAL(14,4) NOT NULL,
    "min_threshold" DECIMAL(14,4) NOT NULL,
    "reorder_quantity_suggested" DECIMAL(14,4),
    "alert_status" TEXT NOT NULL DEFAULT 'active',
    "acknowledged_by" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "related_pr_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reorder_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor"."vendor_import_batches" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "success_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor"."vendor_import_errors" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "field" TEXT,
    "message" TEXT NOT NULL,
    "raw_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendors_vendor_code_key" ON "vendor"."vendors"("vendor_code");

-- CreateIndex
CREATE INDEX "vendors_vendor_type_idx" ON "vendor"."vendors"("vendor_type");

-- CreateIndex
CREATE INDEX "vendors_is_active_idx" ON "vendor"."vendors"("is_active");

-- CreateIndex
CREATE INDEX "vendors_is_blacklisted_idx" ON "vendor"."vendors"("is_blacklisted");

-- CreateIndex
CREATE INDEX "vendor_contacts_vendor_id_idx" ON "vendor"."vendor_contacts"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_addresses_vendor_id_idx" ON "vendor"."vendor_addresses"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_documents_vendor_id_idx" ON "vendor"."vendor_documents"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_documents_valid_until_idx" ON "vendor"."vendor_documents"("valid_until");

-- CreateIndex
CREATE INDEX "rate_contracts_vendor_id_idx" ON "vendor"."rate_contracts"("vendor_id");

-- CreateIndex
CREATE INDEX "rate_contracts_material_id_idx" ON "vendor"."rate_contracts"("material_id");

-- CreateIndex
CREATE INDEX "rate_contracts_manufacturer_id_idx" ON "vendor"."rate_contracts"("manufacturer_id");

-- CreateIndex
CREATE INDEX "rate_contracts_validity_until_idx" ON "vendor"."rate_contracts"("validity_until");

-- CreateIndex
CREATE UNIQUE INDEX "rate_contracts_vendor_id_material_id_validity_from_key" ON "vendor"."rate_contracts"("vendor_id", "material_id", "validity_from");

-- CreateIndex
CREATE INDEX "rate_contract_history_rate_contract_id_idx" ON "vendor"."rate_contract_history"("rate_contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "storage_locations_location_code_key" ON "inventory"."storage_locations"("location_code");

-- CreateIndex
CREATE INDEX "storage_locations_branch_id_idx" ON "inventory"."storage_locations"("branch_id");

-- CreateIndex
CREATE INDEX "storage_locations_parent_location_id_idx" ON "inventory"."storage_locations"("parent_location_id");

-- CreateIndex
CREATE INDEX "storage_locations_location_type_idx" ON "inventory"."storage_locations"("location_type");

-- CreateIndex
CREATE INDEX "storage_racks_location_id_idx" ON "inventory"."storage_racks"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "storage_racks_location_id_rack_code_key" ON "inventory"."storage_racks"("location_id", "rack_code");

-- CreateIndex
CREATE INDEX "storage_bins_rack_id_idx" ON "inventory"."storage_bins"("rack_id");

-- CreateIndex
CREATE UNIQUE INDEX "storage_bins_rack_id_bin_code_key" ON "inventory"."storage_bins"("rack_id", "bin_code");

-- CreateIndex
CREATE INDEX "storage_general_areas_location_id_idx" ON "inventory"."storage_general_areas"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "storage_general_areas_location_id_area_code_key" ON "inventory"."storage_general_areas"("location_id", "area_code");

-- CreateIndex
CREATE INDEX "stock_material_id_idx" ON "inventory"."stock"("material_id");

-- CreateIndex
CREATE INDEX "stock_location_id_idx" ON "inventory"."stock"("location_id");

-- CreateIndex
CREATE INDEX "stock_bin_id_idx" ON "inventory"."stock"("bin_id");

-- CreateIndex
CREATE INDEX "stock_general_area_id_idx" ON "inventory"."stock"("general_area_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_material_id_location_id_bin_id_key" ON "inventory"."stock"("material_id", "location_id", "bin_id");

-- CreateIndex
CREATE INDEX "stock_batches_stock_id_idx" ON "inventory"."stock_batches"("stock_id");

-- CreateIndex
CREATE INDEX "stock_batches_grn_id_idx" ON "inventory"."stock_batches"("grn_id");

-- CreateIndex
CREATE INDEX "stock_batches_received_at_idx" ON "inventory"."stock_batches"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_movement_number_key" ON "inventory"."stock_movements"("movement_number");

-- CreateIndex
CREATE INDEX "stock_movements_material_id_idx" ON "inventory"."stock_movements"("material_id");

-- CreateIndex
CREATE INDEX "stock_movements_movement_type_idx" ON "inventory"."stock_movements"("movement_type");

-- CreateIndex
CREATE INDEX "stock_movements_source_location_id_idx" ON "inventory"."stock_movements"("source_location_id");

-- CreateIndex
CREATE INDEX "stock_movements_destination_location_id_idx" ON "inventory"."stock_movements"("destination_location_id");

-- CreateIndex
CREATE INDEX "stock_movements_reference_doc_id_idx" ON "inventory"."stock_movements"("reference_doc_id");

-- CreateIndex
CREATE INDEX "stock_movements_moved_at_idx" ON "inventory"."stock_movements"("moved_at");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_reservation_number_key" ON "inventory"."reservations"("reservation_number");

-- CreateIndex
CREATE INDEX "reservations_material_id_idx" ON "inventory"."reservations"("material_id");

-- CreateIndex
CREATE INDEX "reservations_location_id_idx" ON "inventory"."reservations"("location_id");

-- CreateIndex
CREATE INDEX "reservations_source_type_source_id_idx" ON "inventory"."reservations"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "reservations_reservation_type_idx" ON "inventory"."reservations"("reservation_type");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requisitions_pr_number_key" ON "inventory"."purchase_requisitions"("pr_number");

-- CreateIndex
CREATE INDEX "purchase_requisitions_status_idx" ON "inventory"."purchase_requisitions"("status");

-- CreateIndex
CREATE INDEX "purchase_requisitions_pr_type_idx" ON "inventory"."purchase_requisitions"("pr_type");

-- CreateIndex
CREATE INDEX "purchase_requisitions_requested_at_idx" ON "inventory"."purchase_requisitions"("requested_at");

-- CreateIndex
CREATE INDEX "purchase_requisition_lines_pr_id_idx" ON "inventory"."purchase_requisition_lines"("pr_id");

-- CreateIndex
CREATE INDEX "purchase_requisition_lines_material_id_idx" ON "inventory"."purchase_requisition_lines"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_po_number_key" ON "inventory"."purchase_orders"("po_number");

-- CreateIndex
CREATE INDEX "purchase_orders_vendor_id_idx" ON "inventory"."purchase_orders"("vendor_id");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "inventory"."purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_po_date_idx" ON "inventory"."purchase_orders"("po_date");

-- CreateIndex
CREATE INDEX "purchase_orders_source_pr_id_idx" ON "inventory"."purchase_orders"("source_pr_id");

-- CreateIndex
CREATE INDEX "purchase_order_lines_po_id_idx" ON "inventory"."purchase_order_lines"("po_id");

-- CreateIndex
CREATE INDEX "purchase_order_lines_material_id_idx" ON "inventory"."purchase_order_lines"("material_id");

-- CreateIndex
CREATE INDEX "purchase_order_lines_pr_line_id_idx" ON "inventory"."purchase_order_lines"("pr_line_id");

-- CreateIndex
CREATE INDEX "purchase_order_lines_status_idx" ON "inventory"."purchase_order_lines"("status");

-- CreateIndex
CREATE INDEX "po_approvals_po_id_idx" ON "inventory"."po_approvals"("po_id");

-- CreateIndex
CREATE INDEX "po_approvals_approval_status_idx" ON "inventory"."po_approvals"("approval_status");

-- CreateIndex
CREATE INDEX "po_communications_po_id_idx" ON "inventory"."po_communications"("po_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_shipments_shipment_number_key" ON "inventory"."import_shipments"("shipment_number");

-- CreateIndex
CREATE INDEX "import_shipments_status_idx" ON "inventory"."import_shipments"("status");

-- CreateIndex
CREATE INDEX "import_shipments_eta_idx" ON "inventory"."import_shipments"("eta");

-- CreateIndex
CREATE UNIQUE INDEX "import_shipment_pos_shipment_id_po_id_key" ON "inventory"."import_shipment_pos"("shipment_id", "po_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_customs_shipment_id_key" ON "inventory"."import_customs"("shipment_id");

-- CreateIndex
CREATE INDEX "import_landed_cost_allocations_shipment_id_idx" ON "inventory"."import_landed_cost_allocations"("shipment_id");

-- CreateIndex
CREATE INDEX "import_landed_cost_allocations_po_line_id_idx" ON "inventory"."import_landed_cost_allocations"("po_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_notes_grn_number_key" ON "inventory"."goods_receipt_notes"("grn_number");

-- CreateIndex
CREATE INDEX "goods_receipt_notes_po_id_idx" ON "inventory"."goods_receipt_notes"("po_id");

-- CreateIndex
CREATE INDEX "goods_receipt_notes_vendor_id_idx" ON "inventory"."goods_receipt_notes"("vendor_id");

-- CreateIndex
CREATE INDEX "goods_receipt_notes_shipment_id_idx" ON "inventory"."goods_receipt_notes"("shipment_id");

-- CreateIndex
CREATE INDEX "goods_receipt_notes_status_idx" ON "inventory"."goods_receipt_notes"("status");

-- CreateIndex
CREATE INDEX "goods_receipt_notes_received_at_idx" ON "inventory"."goods_receipt_notes"("received_at");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_grn_id_idx" ON "inventory"."goods_receipt_lines"("grn_id");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_po_line_id_idx" ON "inventory"."goods_receipt_lines"("po_line_id");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_material_id_idx" ON "inventory"."goods_receipt_lines"("material_id");

-- CreateIndex
CREATE INDEX "grn_documents_grn_id_idx" ON "inventory"."grn_documents"("grn_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_inspections_inspection_number_key" ON "inventory"."quality_inspections"("inspection_number");

-- CreateIndex
CREATE INDEX "quality_inspections_grn_id_idx" ON "inventory"."quality_inspections"("grn_id");

-- CreateIndex
CREATE INDEX "quality_inspections_grn_line_id_idx" ON "inventory"."quality_inspections"("grn_line_id");

-- CreateIndex
CREATE INDEX "quality_inspections_material_id_idx" ON "inventory"."quality_inspections"("material_id");

-- CreateIndex
CREATE INDEX "quality_inspections_overall_result_idx" ON "inventory"."quality_inspections"("overall_result");

-- CreateIndex
CREATE INDEX "quality_inspection_parameters_inspection_id_idx" ON "inventory"."quality_inspection_parameters"("inspection_id");

-- CreateIndex
CREATE INDEX "quality_inspection_photos_inspection_id_idx" ON "inventory"."quality_inspection_photos"("inspection_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_requisitions_mr_number_key" ON "inventory"."material_requisitions"("mr_number");

-- CreateIndex
CREATE INDEX "material_requisitions_status_idx" ON "inventory"."material_requisitions"("status");

-- CreateIndex
CREATE INDEX "material_requisitions_production_job_id_idx" ON "inventory"."material_requisitions"("production_job_id");

-- CreateIndex
CREATE INDEX "material_requisitions_nesting_run_id_idx" ON "inventory"."material_requisitions"("nesting_run_id");

-- CreateIndex
CREATE INDEX "material_requisitions_requested_at_idx" ON "inventory"."material_requisitions"("requested_at");

-- CreateIndex
CREATE INDEX "material_requisition_lines_mr_id_idx" ON "inventory"."material_requisition_lines"("mr_id");

-- CreateIndex
CREATE INDEX "material_requisition_lines_material_id_idx" ON "inventory"."material_requisition_lines"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_issue_notes_min_number_key" ON "inventory"."material_issue_notes"("min_number");

-- CreateIndex
CREATE INDEX "material_issue_notes_mr_id_idx" ON "inventory"."material_issue_notes"("mr_id");

-- CreateIndex
CREATE INDEX "material_issue_notes_production_job_id_idx" ON "inventory"."material_issue_notes"("production_job_id");

-- CreateIndex
CREATE INDEX "material_issue_notes_nesting_run_id_idx" ON "inventory"."material_issue_notes"("nesting_run_id");

-- CreateIndex
CREATE INDEX "material_issue_notes_status_idx" ON "inventory"."material_issue_notes"("status");

-- CreateIndex
CREATE INDEX "material_issue_note_lines_min_id_idx" ON "inventory"."material_issue_note_lines"("min_id");

-- CreateIndex
CREATE INDEX "material_issue_note_lines_mr_line_id_idx" ON "inventory"."material_issue_note_lines"("mr_line_id");

-- CreateIndex
CREATE INDEX "material_issue_note_lines_material_id_idx" ON "inventory"."material_issue_note_lines"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_return_notes_mrn_number_key" ON "inventory"."material_return_notes"("mrn_number");

-- CreateIndex
CREATE INDEX "material_return_notes_original_min_id_idx" ON "inventory"."material_return_notes"("original_min_id");

-- CreateIndex
CREATE INDEX "material_return_notes_production_job_id_idx" ON "inventory"."material_return_notes"("production_job_id");

-- CreateIndex
CREATE INDEX "material_return_note_lines_mrn_id_idx" ON "inventory"."material_return_note_lines"("mrn_id");

-- CreateIndex
CREATE INDEX "material_return_note_lines_min_line_id_idx" ON "inventory"."material_return_note_lines"("min_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_sessions_count_number_key" ON "inventory"."stock_count_sessions"("count_number");

-- CreateIndex
CREATE INDEX "stock_count_sessions_location_id_idx" ON "inventory"."stock_count_sessions"("location_id");

-- CreateIndex
CREATE INDEX "stock_count_sessions_status_idx" ON "inventory"."stock_count_sessions"("status");

-- CreateIndex
CREATE INDEX "stock_count_lines_count_session_id_idx" ON "inventory"."stock_count_lines"("count_session_id");

-- CreateIndex
CREATE INDEX "stock_count_lines_material_id_idx" ON "inventory"."stock_count_lines"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustments_adjustment_number_key" ON "inventory"."stock_adjustments"("adjustment_number");

-- CreateIndex
CREATE INDEX "stock_adjustments_adjustment_type_idx" ON "inventory"."stock_adjustments"("adjustment_type");

-- CreateIndex
CREATE INDEX "stock_adjustments_approval_status_idx" ON "inventory"."stock_adjustments"("approval_status");

-- CreateIndex
CREATE INDEX "stock_adjustment_lines_adjustment_id_idx" ON "inventory"."stock_adjustment_lines"("adjustment_id");

-- CreateIndex
CREATE INDEX "stock_adjustment_lines_material_id_idx" ON "inventory"."stock_adjustment_lines"("material_id");

-- CreateIndex
CREATE INDEX "reorder_alerts_material_id_idx" ON "inventory"."reorder_alerts"("material_id");

-- CreateIndex
CREATE INDEX "reorder_alerts_alert_status_idx" ON "inventory"."reorder_alerts"("alert_status");

-- CreateIndex
CREATE INDEX "vendor_import_errors_batch_id_idx" ON "vendor"."vendor_import_errors"("batch_id");

-- AddForeignKey
ALTER TABLE "vendor"."vendors" ADD CONSTRAINT "vendors_payment_terms_template_id_fkey" FOREIGN KEY ("payment_terms_template_id") REFERENCES "sales"."payment_terms_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor"."vendor_contacts" ADD CONSTRAINT "vendor_contacts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor"."vendor_addresses" ADD CONSTRAINT "vendor_addresses_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor"."vendor_documents" ADD CONSTRAINT "vendor_documents_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor"."rate_contracts" ADD CONSTRAINT "rate_contracts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor"."rate_contracts" ADD CONSTRAINT "rate_contracts_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor"."rate_contracts" ADD CONSTRAINT "rate_contracts_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "material"."manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor"."rate_contract_history" ADD CONSTRAINT "rate_contract_history_rate_contract_id_fkey" FOREIGN KEY ("rate_contract_id") REFERENCES "vendor"."rate_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."storage_locations" ADD CONSTRAINT "storage_locations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "core"."branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."storage_locations" ADD CONSTRAINT "storage_locations_parent_location_id_fkey" FOREIGN KEY ("parent_location_id") REFERENCES "inventory"."storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."storage_racks" ADD CONSTRAINT "storage_racks_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory"."storage_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."storage_bins" ADD CONSTRAINT "storage_bins_rack_id_fkey" FOREIGN KEY ("rack_id") REFERENCES "inventory"."storage_racks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."storage_general_areas" ADD CONSTRAINT "storage_general_areas_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory"."storage_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock" ADD CONSTRAINT "stock_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock" ADD CONSTRAINT "stock_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory"."storage_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock" ADD CONSTRAINT "stock_bin_id_fkey" FOREIGN KEY ("bin_id") REFERENCES "inventory"."storage_bins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock" ADD CONSTRAINT "stock_general_area_id_fkey" FOREIGN KEY ("general_area_id") REFERENCES "inventory"."storage_general_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_batches" ADD CONSTRAINT "stock_batches_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "inventory"."stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_batches" ADD CONSTRAINT "stock_batches_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "inventory"."goods_receipt_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_movements" ADD CONSTRAINT "stock_movements_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_movements" ADD CONSTRAINT "stock_movements_source_location_id_fkey" FOREIGN KEY ("source_location_id") REFERENCES "inventory"."storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_movements" ADD CONSTRAINT "stock_movements_destination_location_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "inventory"."storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_movements" ADD CONSTRAINT "stock_movements_source_bin_id_fkey" FOREIGN KEY ("source_bin_id") REFERENCES "inventory"."storage_bins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_movements" ADD CONSTRAINT "stock_movements_destination_bin_id_fkey" FOREIGN KEY ("destination_bin_id") REFERENCES "inventory"."storage_bins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_movements" ADD CONSTRAINT "stock_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory"."stock_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."reservations" ADD CONSTRAINT "reservations_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."reservations" ADD CONSTRAINT "reservations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory"."storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_pr_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "inventory"."purchase_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor"."vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."purchase_orders" ADD CONSTRAINT "purchase_orders_source_pr_id_fkey" FOREIGN KEY ("source_pr_id") REFERENCES "inventory"."purchase_requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "inventory"."purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_pr_line_id_fkey" FOREIGN KEY ("pr_line_id") REFERENCES "inventory"."purchase_requisition_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."po_approvals" ADD CONSTRAINT "po_approvals_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "inventory"."purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."po_communications" ADD CONSTRAINT "po_communications_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "inventory"."purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."import_shipment_pos" ADD CONSTRAINT "import_shipment_pos_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "inventory"."import_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."import_shipment_pos" ADD CONSTRAINT "import_shipment_pos_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "inventory"."purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."import_customs" ADD CONSTRAINT "import_customs_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "inventory"."import_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."import_landed_cost_allocations" ADD CONSTRAINT "import_landed_cost_allocations_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "inventory"."import_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."import_landed_cost_allocations" ADD CONSTRAINT "import_landed_cost_allocations_po_line_id_fkey" FOREIGN KEY ("po_line_id") REFERENCES "inventory"."purchase_order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."import_landed_cost_allocations" ADD CONSTRAINT "import_landed_cost_allocations_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "inventory"."purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "inventory"."import_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor"."vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_received_at_location_id_fkey" FOREIGN KEY ("received_at_location_id") REFERENCES "inventory"."storage_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "inventory"."goods_receipt_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_po_line_id_fkey" FOREIGN KEY ("po_line_id") REFERENCES "inventory"."purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_bin_id_fkey" FOREIGN KEY ("bin_id") REFERENCES "inventory"."storage_bins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_general_area_id_fkey" FOREIGN KEY ("general_area_id") REFERENCES "inventory"."storage_general_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."grn_documents" ADD CONSTRAINT "grn_documents_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "inventory"."goods_receipt_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."quality_inspections" ADD CONSTRAINT "quality_inspections_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "inventory"."goods_receipt_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."quality_inspections" ADD CONSTRAINT "quality_inspections_grn_line_id_fkey" FOREIGN KEY ("grn_line_id") REFERENCES "inventory"."goods_receipt_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."quality_inspections" ADD CONSTRAINT "quality_inspections_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."quality_inspection_parameters" ADD CONSTRAINT "quality_inspection_parameters_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inventory"."quality_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."quality_inspection_photos" ADD CONSTRAINT "quality_inspection_photos_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inventory"."quality_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_requisition_lines" ADD CONSTRAINT "material_requisition_lines_mr_id_fkey" FOREIGN KEY ("mr_id") REFERENCES "inventory"."material_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_requisition_lines" ADD CONSTRAINT "material_requisition_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_issue_notes" ADD CONSTRAINT "material_issue_notes_mr_id_fkey" FOREIGN KEY ("mr_id") REFERENCES "inventory"."material_requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_issue_notes" ADD CONSTRAINT "material_issue_notes_issued_from_location_id_fkey" FOREIGN KEY ("issued_from_location_id") REFERENCES "inventory"."storage_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_issue_note_lines" ADD CONSTRAINT "material_issue_note_lines_min_id_fkey" FOREIGN KEY ("min_id") REFERENCES "inventory"."material_issue_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_issue_note_lines" ADD CONSTRAINT "material_issue_note_lines_mr_line_id_fkey" FOREIGN KEY ("mr_line_id") REFERENCES "inventory"."material_requisition_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_issue_note_lines" ADD CONSTRAINT "material_issue_note_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_issue_note_lines" ADD CONSTRAINT "material_issue_note_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory"."stock_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_issue_note_lines" ADD CONSTRAINT "material_issue_note_lines_bin_id_fkey" FOREIGN KEY ("bin_id") REFERENCES "inventory"."storage_bins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_return_notes" ADD CONSTRAINT "material_return_notes_original_min_id_fkey" FOREIGN KEY ("original_min_id") REFERENCES "inventory"."material_issue_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_return_notes" ADD CONSTRAINT "material_return_notes_received_at_location_id_fkey" FOREIGN KEY ("received_at_location_id") REFERENCES "inventory"."storage_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_return_note_lines" ADD CONSTRAINT "material_return_note_lines_mrn_id_fkey" FOREIGN KEY ("mrn_id") REFERENCES "inventory"."material_return_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_return_note_lines" ADD CONSTRAINT "material_return_note_lines_min_line_id_fkey" FOREIGN KEY ("min_line_id") REFERENCES "inventory"."material_issue_note_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_return_note_lines" ADD CONSTRAINT "material_return_note_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_count_sessions" ADD CONSTRAINT "stock_count_sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory"."storage_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_session_id_fkey" FOREIGN KEY ("count_session_id") REFERENCES "inventory"."stock_count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_count_lines" ADD CONSTRAINT "stock_count_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_count_lines" ADD CONSTRAINT "stock_count_lines_bin_id_fkey" FOREIGN KEY ("bin_id") REFERENCES "inventory"."storage_bins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_count_lines" ADD CONSTRAINT "stock_count_lines_general_area_id_fkey" FOREIGN KEY ("general_area_id") REFERENCES "inventory"."storage_general_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "inventory"."stock_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."reorder_alerts" ADD CONSTRAINT "reorder_alerts_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor"."vendor_import_errors" ADD CONSTRAINT "vendor_import_errors_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "vendor"."vendor_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
