# PHASE 3 — SUPPLY CHAIN & PROCUREMENT

**Version:** 2.0 (clean rewrite — supersedes old PROMPTS_P3.md, folds in PHASES_2345_ADDENDUM_MATERIAL_PLANNING.md)
**Total prompts:** 26
**Total tables:** ~38
**Estimated timeline:** 5-6 weeks at 4-6 hours/day
**Dependencies:** Phase 0, Phase 1, Phase 2 all complete

---

## CLAUDE CODE — READ BEFORE EVERY PROMPT IN THIS FILE

```
═══════════════════════════════════════════════════════════
SCOPE PROTECTION INSTRUCTIONS — APPLIES TO ALL PROMPTS HERE
═══════════════════════════════════════════════════════════
Before agreeing to ANY scope addition during a prompt:
1. Check the SCOPE BOUNDARIES section at end of the current prompt
2. Check FORWARD_REFERENCES.md in project root
3. Check MATERIAL_MASTER_DESIGN_LOCK.md Part 11 (manufacturer↔dealer mapping)
4. If the requested feature is listed for a future phase:
   Respond: "That feature is planned for [Phase X, Prompt PX-NN].
   Adding it here will create incomplete functionality dependent on
   tables/services not yet built. Recommend deferring. Continue with
   current Phase 3 scope?"
5. Only proceed with out-of-scope work if user explicitly says:
   "Override scope protection. Add this as an exception."
6. If user overrides, prefix the commit message with [OVERRIDE].
═══════════════════════════════════════════════════════════
```

---

## PART 1 — WHAT PHASE 3 BUILDS

Phase 3 connects the BOM (Phase 2) to the factory floor (Phase 4). Without this, materials are defined on paper but cannot be bought, received, stored, tested, or issued. Eight sub-modules:

**Sub-module A — Vendor/Supplier Master**
External companies you buy from. Manufacturer↔dealer mapping per material (your reality: one manufacturer's products distributed across multiple dealers per city). Foreign currency support for China imports. Vendor performance rating.

**Sub-module B — Storage & Locations**
Factory store + warehouse with rack/shelf/bin numbering and general storage areas (per your business answers).

**Sub-module C — Purchase Requisitions**
Auto-generated from BOM theoretical requirements when orders confirm. Consolidation across multiple orders. Manual PR creation supported.

**Sub-module D — Purchase Orders**
PO creation with multi-level value-based approval. Sent via email/WhatsApp to vendors. Acknowledgement tracking. **POs use Layer 1 BOM theoretical requirement** (per addendum decision — over-stock acceptable).

**Sub-module E — Import Shipment Tracking**
Full China import lifecycle: container, vessel, Bill of Lading, customs clearance, Bill of Entry, duty, IGST, CHA charges, landed cost allocation.

**Sub-module F — Goods Receipt (GRN)**
Receipt against PO with quantity tolerance, rate matching, multi-vehicle support.

**Sub-module G — Quality Check (Bypassable)**
Optional QC at receipt with pass/fail/conditional acceptance. Per your design: admin can disable this module and material flows directly to available stock.

**Sub-module H — Inventory & Stock Movements**
FIFO costing. Multi-location stock. Soft (order-level) and hard (job-level) reservations per addendum. Stock count / physical verification.

**Sub-module I — Material Issue & Return**
**Material issue is driven by Production Job + Nesting Run, NOT BOM** (per addendum decision — this is Layer 2 Planned Requirement from Phase 4 consumed here). Issue note with bin picking. Return flow for unused material.

**What Phase 3 explicitly does NOT build:**
- Vendor portal (their own login) → Out of scope unless requested later
- Real-time vessel tracking integration → Out of scope (manual updates fine)
- Vendor performance auto-scoring → Phase 8 if needed
- Nesting run / Layer 2 planned requirement generation → Phase 4 (Phase 3 consumes nesting output, doesn't produce it)
- Production execution / panel scanning → Phase 4
- Dispatch and post-production → Phase 5
- E-Way Bill at outbound → Phase 5 (inbound import logistics here only)
- Vendor invoice matching for finance posting → Phase 8

---

## PART 2 — THE TWO-LAYER MATERIAL PLANNING MODEL (CRITICAL)

This is the most important conceptual point in Phase 3. Read carefully.

**Phase 2 produces Layer 1 — Theoretical Requirement** (from BOM × quantity × wastage). Used here in Phase 3 for **PO generation only**. Over-purchase is acceptable per your decision — extra becomes inventory.

**Phase 4 produces Layer 2 — Planned Requirement** (from Spazio + B-Opti nesting). Used here in Phase 3 for **Material Issue Note (MIN) only**.

**Phase 3 does NOT calculate either layer.** Phase 3 consumes both:
- PR/PO modules read Layer 1 from `product_engineering` material requirements
- MIN module reads Layer 2 from `production.nesting_runs` (which Phase 4 produces)

**Why this matters:** Old PROMPTS_P3.md (which we're replacing) treated PO and MIN as both using the same BOM number. That's wrong for furniture manufacturing where nesting saves 5-15% sheets. Following the two-layer model means POs may over-purchase slightly (accepted) but MINs match actual planned consumption.

**Reservation system** ties this together:
- Order confirmed → soft reservation on stock (Layer 1 theoretical)
- Production Job + Nesting Run approved → hard reservation (Layer 2 planned)
- Hard reservation supersedes soft for that order's lines (no double counting)

---

## PART 3 — KEY DESIGN DECISIONS FOLDED INTO PHASE 3

From your earlier answers:

1. **One factory store + separate warehouse** with rack/shelf/bin numbering for hardware and small items, plus general storage areas for boards and large items.

2. **Formal digital requisition → approval → issue flow** for material issue to production.

3. **Multi-level PO approval based on value** (default thresholds, admin-configurable):
   - < ₹25,000 → auto-approved
   - ₹25,000 – ₹2,00,000 → manager approval
   - ₹2,00,000 – ₹10,00,000 → director approval
   - > ₹10,00,000 → MD/owner approval

4. **Vendor payment terms default to industry standard** (admin can alter):
   - Domestic: 30-day credit standard
   - China imports: TT advance or LC at sight

5. **QC defaults** — basic visual + count + spec check (admin can extend per material type or disable entire QC module).

6. **Physical stock verification defaults** — monthly cycle count, quarterly full count.

7. **Full China import tracking** — container, vessel, BoL, customs, BoE, duty, IGST, CHA, landed cost allocation per item.

8. **Manufacturer↔dealer many-to-many** — one manufacturer's products distributed across multiple dealers; a dealer carries multiple manufacturers; rate contracts capture which dealer carries which specific product at what price.

9. **FIFO costing** with batch-level tracking.

10. **Offcuts = scrap** (no dimensional inventory, per addendum decision).

---

## PART 4 — DATABASE SCHEMA (~38 tables)

All Phase 3 tables go in **two schemas**:
- `vendor` schema → vendor and rate contract master
- `inventory` schema → storage, stock, movements, requisitions, POs, GRN, QC, MIN

### A. Vendor Schema (~6 tables)

**vendor.vendors**
- id, vendor_code (auto, unique), vendor_name, legal_name
- vendor_type (domestic / import), is_blacklisted, blacklist_reason
- gstin, pan, msme_registered, msme_number
- primary_email, primary_phone, website
- currency_id (FK to core.currencies — INR for domestic, CNY/USD for China)
- payment_terms_template_id (FK)
- credit_limit, credit_days
- bank_name, bank_account_number, bank_ifsc, bank_swift_code (for imports)
- rating (1-5 score), is_active
- iec_code (for imports), default_incoterms (FOB/CIF/EXW etc.)
- audit columns, soft-delete

**vendor.vendor_contacts**
- id, vendor_id (FK), contact_name, designation, phone, email, role (sales/accounts/dispatch/owner), is_primary

**vendor.vendor_addresses**
- id, vendor_id (FK), address_type (registered/factory/warehouse/billing), address_line_1, address_line_2, city, state, state_code, country, pincode, port_of_loading (for imports), notes

**vendor.vendor_documents**
- id, vendor_id (FK), document_type (gst_cert/pan/iec/agreement/quality_cert/insurance), document_path, valid_from, valid_until, notes

**vendor.rate_contracts** (per addendum — manufacturer↔dealer↔material mapping)
- id, vendor_id (FK), material_id (FK to material.materials)
- manufacturer_id (FK to material.manufacturers — must match material's manufacturer)
- is_authorized_dealer (bool — vendor is authorized dealer for this manufacturer's product)
- unit_price, currency_id, uom_id (purchase UOM)
- min_order_quantity, lead_time_days, validity_from, validity_until
- is_preferred (bool), notes
- audit columns
- UNIQUE constraint: (vendor_id, material_id, validity_from) — same vendor can't have overlapping rate contracts for same material

**vendor.rate_contract_history**
- id, rate_contract_id, old_price, new_price, change_reason, changed_at, changed_by
- (For audit of price changes over time)

### B. Inventory Schema (~32 tables)

**inventory.storage_locations**
- id, location_code (unique), location_name, location_type (factory_store / warehouse / shop_floor / qc_hold / quarantine / returns_hold), branch_id (FK to core.branches), parent_location_id (FK self-ref for nesting)
- description, is_active

**inventory.storage_racks**
- id, location_id (FK), rack_code, rack_name, capacity_kg, capacity_volume, notes, is_active

**inventory.storage_bins**
- id, rack_id (FK), bin_code, bin_label (e.g., "A-3-5"), capacity, material_category_restriction (FK to material.categories, nullable — restricts which categories can go in this bin), is_active

**inventory.storage_general_areas**
- id, location_id (FK), area_code, area_name (e.g., "Board Storage Area"), description, material_category_restriction (nullable), is_active

**inventory.stock**
- id, material_id (FK), location_id (FK), bin_id (FK, nullable), general_area_id (FK, nullable)
- current_quantity, reserved_quantity_soft, reserved_quantity_hard
- available_quantity (computed: current − soft − hard)
- last_movement_at, last_count_at
- audit columns
- UNIQUE: (material_id, location_id, bin_id) — one stock record per material per specific location

**inventory.stock_batches** (FIFO tracking)
- id, stock_id (FK), batch_number, grn_id (FK — source receipt), received_at
- original_quantity, current_quantity
- unit_cost (the cost when received), total_cost
- expiry_date (for materials with shelf life), lot_number (vendor's lot if any)
- is_quarantined, quarantine_reason
- audit columns

**inventory.stock_movements**
- id, movement_number (auto), movement_type (inward_grn / outward_min / transfer / adjustment_plus / adjustment_minus / return_from_production / scrap)
- material_id (FK), source_location_id (FK, nullable), destination_location_id (FK, nullable)
- source_bin_id, destination_bin_id (FKs, nullable)
- quantity, batch_id (FK, nullable for batches affected)
- unit_cost_at_movement, total_cost
- reference_doc_type (grn/min/transfer_note/adjustment_voucher/return_note), reference_doc_id
- moved_by, moved_at, reason, notes
- audit columns

**inventory.reservations**
- id, reservation_number (auto)
- material_id (FK), location_id (FK, nullable for any-location)
- reserved_quantity, reservation_type (soft / hard)
- source_type (order / production_job)
- source_id (order_id or production_job_id depending on type)
- reserved_at, reserved_by, expires_at, released_at, release_reason
- audit columns

**inventory.purchase_requisitions**
- id, pr_number (auto), pr_type (auto_from_bom / manual)
- source_type (order_consolidated / single_order / manual / reorder_alert)
- source_orders (array of order_ids — for consolidated PRs)
- status (draft / submitted / approved / rejected / partially_po_raised / fully_po_raised / closed)
- requested_by, requested_at, required_by_date
- approved_by, approved_at, rejection_reason
- total_estimated_value, currency_id
- notes, audit columns

**inventory.purchase_requisition_lines**
- id, pr_id (FK), line_sequence
- material_id (FK), quantity_requested, uom_id
- estimated_unit_price, estimated_line_value
- suggested_vendor_id (FK to vendor.vendors, nullable — from rate contracts)
- po_raised_quantity (cumulative across POs), po_raised_lines (array of po_line_ids)
- notes

**inventory.purchase_orders**
- id, po_number (auto), po_type (domestic / import)
- vendor_id (FK), vendor_contact_id (FK)
- source_pr_id (FK, nullable — POs can be raised against PR or directly)
- branch_id (FK), delivery_location_id (FK)
- po_date, expected_delivery_date
- currency_id, exchange_rate_at_po (for imports)
- subtotal, discount, taxable_value, total_tax, other_charges, total_amount
- payment_terms_template_id (FK), payment_terms_notes
- delivery_terms (incoterms for imports), shipping_mode (road/rail/sea/air)
- status (draft / pending_approval / approved / sent_to_vendor / acknowledged / partially_received / fully_received / closed / cancelled)
- approval_workflow_instance_id (FK to core.workflow_instances)
- vendor_acknowledged_at, vendor_acknowledgement_method (email/whatsapp/portal)
- created_by, sent_to_vendor_at, audit columns

**inventory.purchase_order_lines**
- id, po_id (FK), line_sequence
- material_id (FK), pr_line_id (FK, nullable)
- quantity_ordered, uom_id, unit_price, line_value
- hsn_code, tax_rate, tax_amount
- expected_delivery_date (line-level override possible)
- received_quantity (cumulative across GRNs)
- status (open / partially_received / fully_received / cancelled)
- notes

**inventory.po_approvals**
- id, po_id (FK), approval_level, required_role, approver_user_id, approval_status (pending/approved/rejected), responded_at, notes

**inventory.po_communications**
- id, po_id (FK), comm_type (email/whatsapp/sms), sent_at, sent_by, recipient, delivered_at, opened_at, response_received_at, response_via

**inventory.import_shipments**
- id, shipment_number (auto)
- po_id (FK, nullable — can have multi-PO shipments)
- supplier_invoice_number, supplier_invoice_date, supplier_invoice_value, currency_id, exchange_rate
- container_number, container_size (20ft/40ft), seal_number
- vessel_name, voyage_number, bill_of_lading_number, bill_of_lading_date
- port_of_loading, port_of_discharge, eta, ata (actual arrival)
- shipping_line, freight_forwarder
- status (in_transit / arrived_port / customs_clearance / cleared / in_transit_to_factory / received)
- audit columns

**inventory.import_shipment_pos** (many-to-many: shipment ↔ POs)
- id, shipment_id (FK), po_id (FK)

**inventory.import_customs**
- id, shipment_id (FK)
- bill_of_entry_number, bill_of_entry_date
- assessable_value, basic_customs_duty, igst_amount, social_welfare_surcharge, anti_dumping_duty
- cha_charges, port_charges, transport_charges, insurance, other_charges
- total_customs_charges, total_landed_cost
- cha_name, cha_contact, cleared_at
- audit columns

**inventory.import_landed_cost_allocation**
- id, shipment_id (FK), po_line_id (FK)
- material_id (FK)
- fob_value, freight_allocated, insurance_allocated, customs_duty_allocated, other_charges_allocated
- total_landed_cost_per_unit (becomes unit_cost in stock_batches)

**inventory.goods_receipt_notes** (GRN)
- id, grn_number (auto), grn_type (domestic / import)
- po_id (FK), shipment_id (FK, nullable for imports)
- vendor_id (FK), delivery_challan_number, delivery_challan_date
- vehicle_number, driver_name, driver_phone
- received_at_location_id (FK), received_by, received_at
- gate_pass_number, security_clearance_at
- status (draft / submitted / qc_pending / qc_completed / accepted / partially_accepted / rejected)
- total_quantity_received, total_value
- notes, audit columns

**inventory.goods_receipt_lines**
- id, grn_id (FK), po_line_id (FK)
- material_id (FK), quantity_received, uom_id, unit_price
- quantity_tolerance_used (computed: % over/under PO line)
- batch_number, lot_number, expiry_date
- status (received / in_qc / accepted / rejected_partial / rejected_full)
- accepted_quantity, rejected_quantity, rejection_reason
- bin_id (FK, nullable — where to store), general_area_id (FK, nullable)
- notes

**inventory.grn_documents**
- id, grn_id (FK), document_type (delivery_challan / invoice / weighbridge_slip / vehicle_photo / damage_photo), document_path, uploaded_by, uploaded_at

**inventory.quality_inspections**
- id, inspection_number (auto)
- grn_id (FK), grn_line_id (FK, nullable for line-specific inspections)
- material_id (FK)
- inspection_type (incoming / periodic / pre_dispatch — Phase 5 uses pre_dispatch later)
- inspector_user_id, inspection_started_at, inspection_completed_at
- overall_result (pending / accepted / rejected / accepted_with_deviation)
- deviation_notes (if conditional acceptance)
- approved_by_for_deviation, approved_at
- audit columns

**inventory.quality_inspection_parameters**
- id, inspection_id (FK), parameter_name (e.g., "Thickness", "Surface Defects", "Count"), expected_value, actual_value, tolerance, result (pass/fail), notes

**inventory.quality_inspection_photos**
- id, inspection_id (FK), photo_type (defect/sample/spec_doc), photo_path, caption, uploaded_at

**inventory.material_requisitions**
- id, mr_number (auto)
- production_job_id (FK to production.production_jobs — from Phase 4)
- nesting_run_id (FK to production.nesting_runs — from Phase 4)
- request_type (production / sample / rework / r_and_d / general)
- requesting_user_id, requested_at, required_by_date
- approval_status (pending / approved / rejected / auto_approved)
- approver_user_id, approved_at, rejection_reason
- status (draft / submitted / approved / issued / partially_issued / cancelled)
- notes, audit columns

**inventory.material_requisition_lines**
- id, mr_id (FK), material_id (FK), quantity_required, uom_id
- nesting_run_line_id (FK to production.nesting_run_materials, nullable — for production requisitions)
- preferred_location_id (FK, nullable)
- issued_quantity (cumulative)
- status (pending / partially_issued / fully_issued / cancelled)

**inventory.material_issue_notes** (MIN — driven by Production Job + Nesting Run per addendum)
- id, min_number (auto)
- mr_id (FK)
- production_job_id (FK, nullable for non-production issues)
- nesting_run_id (FK, nullable for non-production issues)
- issued_from_location_id (FK)
- issued_to_destination (text — usually a shop floor station name)
- issued_by, issued_at
- received_by_user_id (production team person who took material), received_at
- status (draft / issued / returned_partial / closed)
- audit columns

**inventory.material_issue_note_lines**
- id, min_id (FK), mr_line_id (FK)
- material_id (FK), quantity_issued, uom_id
- batch_id (FK — FIFO selected batch), unit_cost (from batch)
- bin_id (FK, nullable — where picked from)
- nesting_run_line_id (FK, nullable)
- return_quantity (cumulative across return notes), final_consumed_quantity (computed)

**inventory.material_return_notes**
- id, mrn_number (auto), original_min_id (FK)
- production_job_id (FK, nullable), returned_by, returned_at, received_at_location_id (FK), received_by_user_id
- reason (unused / damaged / wrong_material / excess / quality_issue), notes
- audit columns

**inventory.material_return_note_lines**
- id, mrn_id (FK), min_line_id (FK)
- material_id (FK), quantity_returned, uom_id
- batch_id (FK), unit_cost (matches original issue)
- condition (good_back_to_stock / damaged_scrap / quarantine_for_review)
- destination_location_id, destination_bin_id

**inventory.stock_count_sessions**
- id, count_number (auto), count_type (cycle / full / spot)
- location_id (FK), planned_start_date, planned_end_date
- started_at, completed_at, status (planned / in_progress / completed / cancelled)
- counted_by_users (array)
- audit columns

**inventory.stock_count_lines**
- id, count_session_id (FK), material_id (FK), bin_id (FK, nullable), general_area_id (FK, nullable)
- system_quantity (what records say), counted_quantity (physical count)
- variance (computed), variance_reason
- counted_by, counted_at, recount_required, recounted_quantity
- adjustment_movement_id (FK to stock_movements — for the resulting adjustment)

**inventory.stock_adjustments**
- id, adjustment_number (auto), adjustment_type (count_variance / damage / theft / system_correction / write_off)
- requested_by, requested_at, approved_by, approved_at, approval_status
- total_value_impact, reason, supporting_documents (jsonb)

**inventory.stock_adjustment_lines**
- id, adjustment_id (FK), material_id (FK), batch_id (FK, nullable), location_id (FK), bin_id (FK, nullable)
- direction (plus / minus), quantity, unit_cost_used, line_value_impact
- resulting_movement_id (FK to stock_movements)

**inventory.reorder_alerts**
- id, material_id (FK), location_id (FK)
- current_quantity, min_threshold, reorder_quantity_suggested
- alert_status (active / acknowledged / pr_raised / closed)
- created_at, acknowledged_by, acknowledged_at, related_pr_id (FK)

**inventory.import_batches** + **inventory.import_errors** (CSV imports for vendor/material rate seeding)

**Total: ~38 tables across vendor and inventory schemas**

---

## PART 5 — THE 26 PROMPTS

### Setup before starting Phase 3

- Phase 0, Phase 1, Phase 2 all green
- Verify access to: core.workflow_engine, core.communication_*, core.payment_transactions, core.documents, core.numbering_series
- Verify material.materials populated (real or test materials)
- Verify product_engineering.boms exists (Phase 2 entities)
- Decide: are you doing imports from China from day one? If yes, prepare to populate import vendor data during P3-02

---

### PROMPT P3-01 — Vendor & Inventory Schema (38 tables)

```
Read PROMPTS_P3.md Part 4 and FORWARD_REFERENCES.md.

Build the complete Phase 3 schema across two schemas:
- `vendor` schema → ~6 tables
- `inventory` schema → ~32 tables

Implementation rules:
1. Two new schemas: vendor, inventory
2. All tables with appropriate @@schema directive
3. UUIDs for PKs
4. Standard audit columns
5. Soft-delete on: vendors, rate_contracts, purchase_orders, purchase_requisitions
6. Indexes on all FK columns and filter fields (status, dates, location_id, material_id)
7. Critical unique constraints:
   - vendors.vendor_code unique
   - purchase_orders.po_number unique
   - goods_receipt_notes.grn_number unique
   - material_issue_notes.min_number unique
   - inventory.stock UNIQUE (material_id, location_id, bin_id)
   - vendor.rate_contracts UNIQUE (vendor_id, material_id, validity_from)
8. Cross-schema FKs:
   - vendor.rate_contracts → material.materials, material.manufacturers
   - inventory.purchase_orders → vendor.vendors, sales.orders (source orders for PR consolidation)
   - inventory.material_requisitions → production.production_jobs, production.nesting_runs (these tables don't exist yet — Phase 4 creates them; for now, make these FK columns NULLABLE with no FK constraint, add constraint in Phase 4)
   - inventory.stock_batches → inventory.goods_receipt_notes

Module registry (core.modules):
- vendor_management (core=true, bypassable=false)
- purchase_orders (core=true, bypassable=false)
- import_tracking (core=false, bypassable=false — required only if you do imports)
- goods_receipt (core=true, bypassable=false)
- quality_check_inbound (core=false, bypassable=true — your decision)
- inventory_management (core=true, bypassable=false)
- material_issue (core=true, bypassable=false)
- stock_count (core=false, bypassable=false)

Numbering series:
- VEN (vendor code): VEN-YYYY-NNNNN
- PR (purchase requisition): PR-YYYY-NNNNN
- PO (purchase order): PO-YYYY-NNNNN
- GRN (goods receipt): GRN-YYYY-NNNNN
- QIN (quality inspection): QIN-YYYY-NNNNN
- MR (material requisition): MR-YYYY-NNNNN
- MIN (material issue note): MIN-YYYY-NNNNN
- MRN (material return note): MRN-YYYY-NNNNN
- SC (stock count): SC-YYYY-NNNN
- ADJ (stock adjustment): ADJ-YYYY-NNNNN
- SHIP (import shipment): SHIP-YYYY-NNNN

System settings:
- PO_AUTO_APPROVAL_THRESHOLD_INR (default 25000)
- PO_MANAGER_APPROVAL_THRESHOLD_INR (default 200000)
- PO_DIRECTOR_APPROVAL_THRESHOLD_INR (default 1000000)
- GRN_QUANTITY_TOLERANCE_PERCENT (default 5.0)
- QC_DEFAULT_ENABLED (default true)
- REORDER_ALERT_ENABLED (default true)
- CYCLE_COUNT_FREQUENCY_DAYS (default 30)
- FULL_COUNT_FREQUENCY_DAYS (default 90)
- IMPORT_DEFAULT_INCOTERMS (default 'FOB')
- DEFAULT_DOMESTIC_PAYMENT_TERMS (default '30-day Credit')
- DEFAULT_IMPORT_PAYMENT_TERMS (default 'TT Advance')

Seed:
- 2-3 storage_locations (Main Factory Store, Main Warehouse)
- Vendor payment terms templates (similar pattern to Phase 1 payment terms): 'TT Advance', 'LC at Sight', 'Cash on Receipt', '30-day Credit', '60-day Credit'

Generate Prisma migration. Run. Verify all 38 tables via \dt vendor.* and \dt inventory.*. Show output.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-01
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- All ~38 tables in vendor and inventory schemas
- Numbering series, module registry, system settings
- Basic seed (locations, payment terms)

❌ OUT OF SCOPE:
- APIs → P3-02 onwards
- production_jobs and nesting_runs tables → Phase 4 (FK columns kept nullable here)
- Phase 4/5 specific behaviors

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Schema only. APIs come next. Production tables are Phase 4. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-01] Vendor and inventory schema with 38 tables`

---

### PROMPT P3-02 — Vendor Master Management

```
Build vendor master with manufacturer↔dealer mapping per addendum.

Read MATERIAL_MASTER_DESIGN_LOCK.md Part 11 (manufacturer↔dealer note).

1. Vendor CRUD:
   - POST /api/vendors
     Input: vendor_name, vendor_type (domestic/import), gstin, pan, primary_email, primary_phone, addresses, contacts, bank_details, currency_id, payment_terms, credit_limit, credit_days, iec_code (imports), default_incoterms (imports)
     Auto-generates: vendor_code (VEN-YYYY-NNNNN)
     Validates: GST format if domestic, IEC code if import, unique GSTIN
   - GET /api/vendors?type=&search=&is_active=&is_blacklisted=&page=&limit=
   - GET /api/vendors/:id (with contacts, addresses, documents, rate contracts)
   - PUT /api/vendors/:id
   - DELETE /api/vendors/:id (soft; block if active POs exist)
   - POST /api/vendors/:id/blacklist (with reason — prevents PO creation; existing POs continue)
   - POST /api/vendors/:id/unblacklist

2. Vendor contacts:
   - CRUD under /api/vendors/:id/contacts
   - Multiple roles (sales/accounts/dispatch/owner)
   - One primary enforced

3. Vendor addresses:
   - CRUD under /api/vendors/:id/addresses
   - Types: registered, factory, warehouse, billing
   - Port of loading for imports

4. Vendor documents:
   - POST /api/vendors/:id/documents (multipart)
     Types: gst_cert, pan, iec, agreement, quality_cert, insurance
     Validity tracking (warns when expiring in 30 days)
   - GET /api/vendors/:id/documents
   - PUT (update validity), DELETE

5. Rate contracts (the manufacturer↔dealer↔material mapping):
   - POST /api/vendors/:id/rate-contracts
     Input: material_id, manufacturer_id (must match material's manufacturer), is_authorized_dealer, unit_price, currency_id, uom_id, min_order_quantity, lead_time_days, validity_from, validity_until, is_preferred
     Validates: vendor's currency matches contract currency
     Logs history on price changes
   - GET /api/vendors/:id/rate-contracts?is_active=&material=
   - PUT /api/vendors/rate-contracts/:rc_id
   - DELETE (soft)
   - GET /api/materials/:material_id/rate-contracts (which vendors carry this material — used in PO creation)

6. Bulk operations:
   - POST /api/vendors/rate-contracts/bulk-update (price change across multiple contracts in one go)
   - POST /api/vendors/rate-contracts/import (CSV import for initial rate seeding)

7. Vendor lookup for procurement:
   - GET /api/materials/:material_id/preferred-vendors
     Returns vendors with active rate contracts for this material, sorted by: preferred → authorized dealer → price ascending
     Used by PR/PO suggestion engine later

8. Vendor performance (basic):
   - GET /api/vendors/:id/performance
     Computed: avg lead time vs promised, on-time delivery %, quality reject %, payment-to-receipt cycle
     (Sourced from GRN history; will be more meaningful after months of usage)

Tests:
- Vendor CRUD (domestic and import)
- Multiple contacts/addresses
- Rate contracts respecting manufacturer rule
- Blacklist prevents new PO creation
- Document expiry alerts
- Bulk rate import
- Vendor lookup returns correctly sorted

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-02
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Vendor master + contacts + addresses + documents
- Rate contracts with manufacturer mapping
- Vendor lookup for procurement
- Basic performance metrics

❌ OUT OF SCOPE:
- Vendor portal (their login) → Out of scope unless requested
- Vendor performance auto-scoring with weights → Phase 8
- Vendor payment posting to finance → Phase 8

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Vendor portal out of scope. Finance posting is Phase 8. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-02] Vendor master with manufacturer-dealer rate contracts`

---

### PROMPT P3-03 — Storage & Locations Management

```
Build storage location management with rack/bin/general-area support.

Per your business: factory store + warehouse with rack/shelf/bin for hardware/small items, general areas for boards/large items.

1. Storage locations:
   - CRUD: /api/storage-locations
   - Types: factory_store, warehouse, shop_floor, qc_hold, quarantine, returns_hold
   - Nesting via parent_location_id (e.g., Main Factory Store has sub-locations)
   - Branch linkage (multi-branch ready)

2. Racks within locations:
   - CRUD: /api/storage-locations/:id/racks
   - Capacity tracking (kg, volume)

3. Bins within racks:
   - CRUD: /api/storage-racks/:id/bins
   - Bin code like "A-3-5" (admin defines naming convention)
   - Optional material category restriction (e.g., this bin only for hardware)

4. General areas:
   - CRUD: /api/storage-locations/:id/general-areas
   - For larger items not bin-stored (boards, sheet metal, large furniture parts)
   - Optional category restriction

5. Bin label printing:
   - POST /api/storage-bins/:id/print-label
     Generates QR + text label for physical printing
     Useful for warehouse setup

6. Location tree view:
   - GET /api/storage/tree
     Returns full hierarchy: locations → racks → bins, plus general areas

7. Validation:
   - Cannot delete location with stock in it
   - Cannot delete bin with stock in it
   - Cannot restrict bin category when bin already has incompatible material

8. Bulk setup:
   - POST /api/storage/bulk-create-bins
     Pattern: create bins A-1 to A-10 across racks A-1 to A-5 → 50 bins at once
     For initial warehouse setup

Tests:
- Location/rack/bin/area CRUD
- Hierarchy validation
- Category restrictions enforced
- Cannot delete with stock
- Bulk creation works

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-03
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Storage hierarchy (locations, racks, bins, general areas)
- Label generation
- Bulk setup

❌ OUT OF SCOPE:
- IoT bin sensors → Out of scope
- Auto bin assignment based on material type → Future enhancement
- Warehouse layout 3D visualization → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Continue with storage hierarchy scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-03] Storage locations with racks, bins, and general areas`

---

### PROMPT P3-04 — Purchase Requisition (PR) Auto-Generation from BOM

```
Build purchase requisition module. PR consumes Layer 1 Theoretical Requirement from Phase 2.

Per addendum: PR generation uses BOM theoretical requirements (orders × BOM × wastage). Over-purchase acceptable. Phase 4 nesting drives MIN, not PR.

1. PR auto-generation from confirmed orders:
   - Background job triggered on:
     a. New order confirmation
     b. Manual trigger by procurement team (consolidate pending demand)
     c. Periodic (daily) consolidation of unfulfilled material requirements
   - Logic:
     a. Read all confirmed orders without fully-raised POs
     b. For each order line, fetch resolved BOM (or unresolved BOM with material categories for finish-pending)
     c. Compute theoretical material requirement per material (qty × BOM line qty × (1 + wastage%))
     d. Aggregate across orders: total qty per material
     e. Subtract current available stock and existing open PO quantities
     f. Net requirement = total demand − available − open POs
     g. Create PR with lines for materials needing procurement
     h. Suggest vendor per line (preferred → authorized → cheapest rate contract)
   - Output: draft PR(s), possibly grouped by vendor for efficient PO raising

2. Manual PR:
   - POST /api/purchase-requisitions
     Input: pr_type='manual', source='manual', lines array (material_id, quantity, uom, notes, suggested_vendor_id)
     Auto-generates pr_number
     Status: draft

3. PR APIs:
   - GET /api/purchase-requisitions?status=&date_range=&material=
   - GET /api/purchase-requisitions/:id (with lines, source orders if consolidated)
   - PUT /api/purchase-requisitions/:id (lines editable while draft)
   - POST /api/purchase-requisitions/:id/submit (status: draft → submitted)
   - POST /api/purchase-requisitions/:id/approve (procurement manager role)
   - POST /api/purchase-requisitions/:id/reject (with reason)

4. PR consolidation view:
   - GET /api/purchase-requisitions/consolidation-preview
     Returns: "If we run consolidation now, the following PRs would be created"
     Used by procurement to plan timing of bulk PR generation

5. PR → PO creation:
   - POST /api/purchase-requisitions/:id/create-po
     Input: lines to include in this PO (some PR lines might go to different vendors → multiple POs from one PR)
     Pre-fills PO from PR data + suggested vendor's rate contract
     Returns draft PO (P3-05 handles PO completion)

6. Reorder alert integration:
   - When material stock drops below reorder level (inventory.reorder_alerts), suggest creating PR
   - "Convert alert to PR" workflow

7. Long-lead-time materials handling:
   - Materials with rate_contracts.lead_time_days > threshold (e.g., 30 days, configurable) flagged in PR
   - These typically include China import items
   - Earlier procurement timeline suggested

Tests:
- Auto-generation from confirmed orders
- Aggregation correctness
- Net requirement calculation (subtracting available and open POs)
- Vendor suggestion logic
- Manual PR creation
- Approval workflow
- Conversion to PO

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-04
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- PR auto-generation from Layer 1 theoretical
- Manual PR
- Approval workflow
- PR-to-PO conversion

❌ OUT OF SCOPE:
- PO creation itself → P3-05
- Material issue (MIN) which uses Layer 2 → P3-10 (consumes Phase 4 nesting output)
- Vendor portal for PR → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"PO is P3-05. MIN uses nesting (Phase 4) and comes in P3-10. Continue with PR scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-04] Purchase requisition with auto-generation from BOM theoretical requirements`

---

### PROMPT P3-05 — Purchase Order with Multi-Level Approval

```
Build PO module with value-based multi-level approval.

1. PO creation:
   - POST /api/purchase-orders (from PR or directly)
     Input: vendor_id, vendor_contact_id, source_pr_id (optional), branch_id, delivery_location_id, po_date, expected_delivery_date, currency_id, exchange_rate (for imports), payment_terms_template_id, delivery_terms (incoterms for imports), shipping_mode, lines array
     Each line: material_id, quantity_ordered, uom_id, unit_price (from rate contract or override), hsn_code, tax_rate, expected_delivery_date (optional override)
     Auto-calc: line totals, subtotal, taxes, total_amount
     Auto-generate: po_number
     Status: draft
   - GET /api/purchase-orders?status=&vendor=&date_range=&po_type=
   - GET /api/purchase-orders/:id (with lines, approvals, communications, GRNs)
   - PUT /api/purchase-orders/:id (draft only)
   - DELETE (soft, draft only; otherwise cancel)

2. Multi-level approval workflow:
   - On POST /api/purchase-orders/:id/submit
     Determine required approval level from PO total_amount:
       < PO_AUTO_APPROVAL_THRESHOLD_INR → auto-approve
       < PO_MANAGER_APPROVAL_THRESHOLD_INR → procurement_manager
       < PO_DIRECTOR_APPROVAL_THRESHOLD_INR → director
       >= PO_DIRECTOR_APPROVAL_THRESHOLD_INR → md_owner
     Creates po_approvals entries
     Notifies approvers via Phase 0 communication
     Status: draft → pending_approval
   - POST /api/purchase-orders/:id/approve
     Permission: assigned approver role only
     If higher levels remain, advances to next level
     If all approved, status: pending_approval → approved
   - POST /api/purchase-orders/:id/reject (any approver in chain can reject, with reason)

3. Currency handling for imports:
   - PO in foreign currency (CNY/USD/EUR)
   - exchange_rate stored at PO time (snapshot)
   - INR equivalent computed for approval threshold check
   - Bank details show vendor's foreign account

4. Send to vendor:
   - POST /api/purchase-orders/:id/send-to-vendor
     Status: approved → sent_to_vendor
     Generates PO PDF
     Sends via configured channel (email + WhatsApp + optionally portal)
     Logs to po_communications
     Tracks delivery and open events (uses Phase 0 tracking)
   - POST /api/purchase-orders/:id/resend (resend if vendor missed)

5. Vendor acknowledgement:
   - POST /api/purchase-orders/:id/mark-acknowledged
     Captured when vendor confirms (email reply, WhatsApp, phone)
     Records method and timestamp
     Status: sent_to_vendor → acknowledged

6. PO PDF generation:
   - Standard template with: company logo, GSTIN, PO header, vendor block (consignor for shipping), delivery address, line items, taxes, payment/delivery terms, T&C, signatory
   - For imports: include incoterms, currency, bank details for international transfer

7. PO cancellation:
   - POST /api/purchase-orders/:id/cancel
     Input: reason
     Validates: no GRN received against this PO yet (or partial — needs higher approval)
     Notifies vendor

8. Amendment (limited):
   - For approved POs not yet fully received: minor amendments (delivery date, quantity reduction) allowed with approval
   - Major amendments → cancel and re-raise

9. PO line tracking:
   - po_line.received_quantity updates as GRNs come in
   - po_line.status: open → partially_received → fully_received

10. Reports:
    - Open POs by vendor, by material, by age
    - Overdue POs (past expected delivery date)
    - PO-to-GRN cycle time

Tests:
- PO creation domestic and import
- Approval thresholds at each level
- Auto-approve below threshold
- Reject at each level
- Send to vendor with email/WhatsApp
- PDF correctness
- Acknowledgement tracking
- Cancellation
- Foreign currency handling

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-05
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- PO CRUD with multi-level approval
- Multi-channel send to vendor
- Vendor acknowledgement
- PO PDF generation
- Cancellation and amendment

❌ OUT OF SCOPE:
- Vendor portal acknowledgement → Out of scope unless requested
- E-procurement marketplace integration → Out of scope
- AI-based vendor recommendation → Out of scope
- Finance posting (vendor payable creation) → Phase 8

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Continue with PO scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-05] Purchase order with multi-level approval and vendor communication`

---

### PROMPT P3-06 — Import Shipment Tracking

```
Build full import shipment lifecycle tracking for China and other foreign sourcing.

1. Import shipment creation:
   - POST /api/import-shipments
     Input: po_id(s) (can be multi-PO consolidated shipment), supplier_invoice_number, supplier_invoice_date, supplier_invoice_value, currency_id, exchange_rate, container_number, container_size, seal_number, vessel_name, voyage_number, bill_of_lading_number, bill_of_lading_date, port_of_loading, port_of_discharge, eta, shipping_line, freight_forwarder
     Auto-generates shipment_number
     Status: in_transit
   - GET /api/import-shipments?status=&date_range=&port=
   - GET /api/import-shipments/:id (with linked POs, customs, allocation)
   - PUT /api/import-shipments/:id (update tracking info)

2. Shipment status workflow:
   - in_transit → arrived_port → customs_clearance → cleared → in_transit_to_factory → received
   - Each transition logged with timestamp
   - POST /api/import-shipments/:id/status

3. Customs clearance:
   - POST /api/import-shipments/:id/customs
     Input: bill_of_entry_number, bill_of_entry_date, assessable_value, basic_customs_duty, igst_amount, social_welfare_surcharge, anti_dumping_duty, cha_charges, port_charges, transport_charges, insurance, other_charges
     Auto-calc: total_customs_charges
     CHA details (name, contact)
   - GET /api/import-shipments/:id/customs

4. Landed cost allocation:
   - POST /api/import-shipments/:id/allocate-landed-cost
     Method: pro-rata by FOB value of each PO line
     For each po_line in shipment:
       - FOB value of this line
       - Allocated portion of: freight, insurance, duty, IGST, CHA charges, other charges
       - Per-unit landed cost = (FOB + all allocations) / quantity
     Creates import_landed_cost_allocation entries
     This unit_cost becomes the cost used in stock_batches when GRN happens
   - GET /api/import-shipments/:id/landed-cost

5. Import documents:
   - POST /api/import-shipments/:id/documents
     Types: bill_of_lading, bill_of_entry, supplier_invoice, packing_list, certificate_of_origin, insurance_certificate, container_photos, cha_invoice

6. Multi-PO shipment:
   - One container can have material from multiple POs of same vendor
   - import_shipment_pos junction handles this
   - Landed cost allocation works pro-rata across all POs

7. Tracking dashboard:
   - GET /api/import-shipments/dashboard
     Active shipments with status, ETA, days remaining
     Overdue shipments (past ETA)
     Pending customs clearance count

8. Vendor invoice vs PO matching:
   - Compare supplier_invoice_value with PO total
   - Flag discrepancies for procurement review
   - 3-way match prep (PO ↔ Supplier Invoice ↔ GRN — finalized at GRN in P3-07)

Tests:
- Create shipment for single PO and multi-PO
- Status transitions
- Customs entry with all charges
- Landed cost allocation correctness (sum matches total)
- Document uploads
- Dashboard

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-06
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Import shipment lifecycle
- Customs clearance entry
- Landed cost allocation
- Document management

❌ OUT OF SCOPE:
- Real-time vessel tracking integration → Out of scope (manual updates fine)
- ICEGATE/customs API integration → Out of scope unless added later
- Letter of Credit (LC) workflow → Out of scope unless added (TT advance assumed default)

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Real-time tracking out of scope. Continue with manual entry?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-06] Import shipment tracking with customs and landed cost allocation`

---

### PROMPT P3-07 — Goods Receipt Note (GRN)

```
Build GRN module — receipt of materials at factory gate.

1. Gate entry (start of GRN):
   - POST /api/grns
     Input: po_id, shipment_id (for imports), delivery_challan_number, delivery_challan_date, vehicle_number, driver_name, driver_phone, received_at_location_id
     Auto-generates: grn_number, gate_pass_number
     Status: draft (under receipt)
   - Initial entry captures vehicle and security details

2. GRN lines:
   - POST /api/grns/:id/lines
     Input per line: po_line_id, quantity_received, batch_number (vendor's), lot_number, expiry_date (if applicable), bin_id or general_area_id (where to store), notes
     Validates:
       - po_line belongs to this GRN's PO
       - quantity_received <= po_line.quantity_ordered + tolerance% (configurable; default 5%)
       - Rate from PO line (not re-entered)
   - PUT/DELETE lines (while GRN is draft)

3. Submission:
   - POST /api/grns/:id/submit (status: draft → submitted or qc_pending)
     If QC module enabled and material requires QC → status = qc_pending (triggers P3-08 QC flow)
     If QC disabled or material doesn't require QC → status = accepted, stock movements created immediately (auto-skip QC per module bypass)

4. Quantity tolerance handling:
   - Configurable per material category or material
   - Over-receipt within tolerance: accepted
   - Over-receipt above tolerance: requires explicit approval with reason
   - Under-receipt: PO line stays partially open

5. Multi-vehicle GRN:
   - One PO can have multiple GRNs (split delivery)
   - One GRN can have lines from multiple POs (consolidation)
   - Tracked via grn_lines.po_line_id linkage

6. Rate mismatch handling:
   - If actual invoice unit price differs from PO rate, flag for procurement review
   - Cannot accept without resolution (price update on rate_contract, PO amendment, or rejection)

7. GRN documents:
   - Upload delivery challan, supplier invoice, weighbridge slip, vehicle photo, damage photo
   - Required for audit trail

8. Stock impact (when accepted):
   - Creates stock_movements (inward_grn type)
   - Creates stock_batches (FIFO tracking — each GRN line = new batch)
   - For imports: unit_cost = landed cost from allocation (P3-06)
   - For domestic: unit_cost = PO rate
   - Updates inventory.stock.current_quantity

9. PO line update:
   - po_line.received_quantity incremented
   - po_line.status: open → partially_received → fully_received
   - PO status updates correspondingly

10. Returns from GRN (rare, but supported):
    - If material rejected at gate (severe damage visible), can be returned without QC
    - Generates a debit note placeholder (full debit notes in Phase 8 finance)

Tests:
- Gate entry creation
- Lines within tolerance
- Lines exceeding tolerance (block + override)
- Rate mismatch flag
- Multi-vehicle / multi-PO scenarios
- Stock movement creation on acceptance
- FIFO batch creation
- Import GRN uses landed cost
- Module bypass: when QC disabled, auto-accept

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-07
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- GRN creation with PO matching
- Quantity tolerance, rate matching
- Multi-vehicle / multi-PO support
- Stock impact on acceptance
- QC handoff or auto-skip

❌ OUT OF SCOPE:
- QC actual inspection → P3-08
- Debit note for rejections → Phase 8 (placeholder created here)
- Vendor portal for delivery confirmation → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"QC inspection is P3-08. Continue with GRN scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-07] Goods receipt note with PO matching and tolerance check`

---

### PROMPT P3-08 — Quality Check Inbound (Bypassable)

```
Build inbound QC module. CRITICAL: this module is bypassable per your design — admin can disable and material flows from GRN directly to available stock.

1. Module bypass logic:
   - All QC APIs check modules.is_active for 'quality_check_inbound'
   - If disabled: GRN submission auto-skips QC, marks accepted, creates stock movements
   - If enabled: GRN with QC-required materials goes to qc_pending status
   - Per-material QC requirement override possible (some materials always need QC even if module enabled for others)

2. Quality inspection creation:
   - POST /api/quality-inspections
     Input: grn_id, grn_line_id (optional — for line-specific), material_id, inspection_type='incoming', inspector_user_id
     Auto-generates: inspection_number
     Status: pending
   - Auto-triggered on GRN submission when module enabled

3. Inspection parameters:
   - Per material/category, admin defines QC parameters (in a separate seed)
     Examples: Board → Thickness (expected 18mm ±0.5), Surface defects (none), Sheet count
     Hardware → Count (matches PO), Functional check (pass/fail), Brand match
   - POST /api/admin/qc-parameter-templates (admin defines per material/category)
   - Inspection auto-creates inspection_parameters from template
   - POST /api/quality-inspections/:id/parameters/:param_id/record
     Input: actual_value, result (pass/fail), notes

4. Photos:
   - POST /api/quality-inspections/:id/photos
     Types: defect, sample, spec_doc
   - Required if any parameter fails (capture evidence)

5. Inspection result:
   - POST /api/quality-inspections/:id/complete
     Input: overall_result (accepted / rejected / accepted_with_deviation), deviation_notes
     If accepted_with_deviation: requires approval from quality_head or higher
   - If accepted: triggers stock movements (GRN status → accepted)
   - If rejected: GRN line marked rejected, return-to-vendor process initiated
   - If accepted_with_deviation: stock accepted but flagged

6. Reject flow:
   - Rejected material moves to quarantine location (separate stock area)
   - POST /api/quality-inspections/:id/initiate-return
     Generates Material Return to Vendor request
     Communication to vendor
     Debit note placeholder (Phase 8 finance handles actual)

7. Conditional acceptance:
   - Inspector accepts with noted issues (e.g., edge damage on 3 sheets out of 50 — usable but documented)
   - Requires manager+ approval
   - Stock accepted with deviation flag on batch
   - Visible in stock reports

8. Re-inspection:
   - If initial inspection inconclusive, can mark for re-inspection
   - POST /api/quality-inspections/:id/request-reinspection

9. QC reports:
   - Inspection turnaround time per inspector
   - Reject % by vendor (vendor performance metric)
   - Common defect types

Tests:
- Inspection creation
- Parameter recording
- Pass → GRN accepted
- Fail → reject flow with return initiation
- Conditional acceptance with approval
- Photo upload on fail
- Module disabled → auto-skip
- Per-material QC override

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-08
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Inbound QC with bypass support
- Parameter templates per material
- Photo capture, conditional acceptance
- Return to vendor flow

❌ OUT OF SCOPE:
- In-process QC during production → Phase 4 (P4 has its own QC module)
- Pre-dispatch QC → Phase 5
- Statistical process control / SPC → Out of scope
- Calibration tracking → Phase 8 if needed

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"In-process QC is Phase 4. Continue with inbound QC scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-08] Quality check inbound with bypass support and parameter templates`

---

### PROMPT P3-09 — FIFO Inventory Engine

```
Build the FIFO inventory engine that tracks stock by batch and computes cost on issue.

1. Stock state:
   - inventory.stock represents current state per material × location × bin
   - Updated by every stock movement
   - inventory.stock_batches represents FIFO layers per material

2. Stock movement creation (the core of inventory):
   - All inventory changes go through createStockMovement service:
     Input: movement_type, material_id, source_location, destination_location, source_bin, destination_bin, quantity, batch_id (for outward), unit_cost_at_movement (for inward), reference_doc info
     Logic:
       inward_grn:
         - Create new stock_batch with received quantity and unit cost (landed cost for imports)
         - Update inventory.stock.current_quantity += qty
       outward_min:
         - FIFO pick: select oldest stock_batches with available quantity
         - Multiple batches may be consumed for one issue (recorded as multiple movement lines internally)
         - Update batch.current_quantity, mark depleted if zero
         - Update inventory.stock.current_quantity -= qty
         - Cost recorded = weighted average of batches used
       transfer:
         - Move from source to destination location
         - Batch identity preserved (or split if partial)
         - inventory.stock for source decremented, destination incremented
       adjustment_plus/minus:
         - Create adjustment record
         - Affects current quantity; if minus, FIFO from oldest batch
       return_from_production:
         - Returns to stock with original batch identity (so cost reverts correctly)
         - Quality check: good → back to available; damaged → scrap movement
       scrap:
         - Writes off quantity from batch
         - Total cost impact recorded

3. Reservations:
   - Soft reservation (from order confirmation):
     POST /api/inventory/reservations
       Input: material_id, quantity, source_type='order', source_id, expires_at
       Creates inventory.reservations record
       Updates inventory.stock.reserved_quantity_soft
   - Hard reservation (from production job + nesting run approval — set in Phase 4, consumed here):
     POST /api/inventory/reservations
       Input: material_id, quantity, source_type='production_job', source_id
       Updates inventory.stock.reserved_quantity_hard
       Releases corresponding soft reservation for the same order (so no double-count)
   - available_quantity = current_quantity − reserved_soft − reserved_hard
   - Cannot issue material that would make available negative (except force with override)

4. Available stock query:
   - GET /api/inventory/stock?material_id=&location=&available_only=
     Shows: current, reserved_soft, reserved_hard, available, batches
   - GET /api/materials/:id/stock-summary
     Aggregated across locations
     Days of stock (current / avg consumption)

5. FIFO valuation:
   - GET /api/inventory/material/:id/valuation
     Returns: batch-by-batch breakdown showing FIFO layers
     Total valuation = sum of (batch.current_quantity × batch.unit_cost)

6. Reorder alerts:
   - Background job runs hourly
   - For each material × location:
     If current_quantity − reserved_hard < min_stock_level:
       Create inventory.reorder_alerts entry
       Notify procurement team
   - Setting REORDER_ALERT_ENABLED can disable

7. Stock transfer:
   - POST /api/inventory/transfers
     Input: from_location, to_location, lines (material_id, quantity)
     Creates stock_movements
     Optional approval workflow for high-value transfers

8. Negative stock prevention:
   - Hard rule: cannot move stock below zero
   - Exception: with explicit override (audit logged) — for emergency situations
   - Adjustment to zero allowed but logged

9. Multi-location aggregation:
   - GET /api/inventory/stock-aggregate?material_id=
     Total across all locations
     Used by PR generation (sees overall stock, not per-location)

Tests:
- GRN creates batch, increments stock
- MIN consumes FIFO across batches
- Cost calculation correctness in mixed-batch issue
- Soft → hard reservation handover (no double count)
- Available calculation
- Reorder alert fires correctly
- Stock transfer between locations
- Cannot go negative (except override)
- Valuation report accurate

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-09
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- FIFO costing engine
- Batch tracking
- Reservations (soft/hard)
- Reorder alerts
- Transfers
- Valuation

❌ OUT OF SCOPE:
- LIFO / Weighted Average costing methods → Future option (FIFO chosen per addendum)
- Inventory ABC analysis → Phase 8 reports
- Inventory turnover dashboards → Phase 8

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Continue with FIFO engine scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-09] FIFO inventory engine with batch tracking and reservations`

---

### PROMPT P3-10 — Material Requisition & Issue (driven by Production Job + Nesting Run)

```
Build the material requisition and issue flow. This is where Layer 2 Planned Requirement from Phase 4 nesting drives material issue.

CRITICAL per addendum: MIN does NOT use BOM theoretical requirement. It uses nesting_run output. Phase 4 will populate production.production_jobs and production.nesting_runs; Phase 3 consumes them.

For Phase 3 build, since Phase 4 isn't built yet, this prompt creates the MIN infrastructure but:
- production_job_id and nesting_run_id columns remain nullable
- MIN can be created manually for testing
- When Phase 4 is built, MIN auto-creation from nesting runs will be wired up (Phase 4 prompt does that)

1. Material requisition (MR):
   - POST /api/material-requisitions
     Input: production_job_id (nullable for now), nesting_run_id (nullable for now), request_type, requesting_user_id, required_by_date, lines (material_id, quantity, uom)
     For production type: ideally linked to a nesting_run which has planned_quantity per material
     Auto-generates mr_number
     Status: draft → submitted
   - GET /api/material-requisitions?status=&production_job=&date_range=
   - GET /api/material-requisitions/:id

2. MR approval:
   - Required for high-value or non-production requisitions
   - Auto-approved for production-type linked to approved nesting run
   - POST /api/material-requisitions/:id/approve / reject

3. Issue note (MIN) creation:
   - POST /api/material-issue-notes
     Input: mr_id, issued_from_location_id, issued_to_destination (text — e.g., "Beam Saw station")
     Auto-generates min_number
     Logic:
       a. For each MR line:
          - Use FIFO to select batches that fulfill quantity
          - Suggest bin picking based on availability
       b. Creates min_lines with batch references and unit_cost from FIFO
       c. Status: draft (store keeper reviews and confirms)
   - POST /api/material-issue-notes/:id/confirm-issue
     Input: bin_picks (override suggestions if needed), received_by_user_id, signature
     Triggers stock_movements (outward_min)
     Decrements stock and batch quantities
     Status: draft → issued

4. Pick list (for store keeper):
   - GET /api/material-issue-notes/:id/pick-list
     Sorted by bin location for efficient picking
     Printable for shop floor

5. Issue confirmation with scan (mobile UI from P3-17):
   - Store keeper scans material QR/bin QR to confirm picking
   - System validates correct material and batch
   - Mobile-friendly interface

6. Partial issue:
   - MIN can be partially issued if stock insufficient for full quantity
   - Remaining quantity tracked, can be fulfilled in later MIN
   - Or production can decide to proceed partially

7. Material return note (MRN):
   - POST /api/material-return-notes
     Input: original_min_id, lines (min_line_id, quantity_returned, condition, destination)
     Auto-generates mrn_number
     For each line:
       - condition=good_back_to_stock: stock_movement (return_from_production), batch identity preserved
       - condition=damaged_scrap: stock_movement (scrap), batch quantity reduced
       - condition=quarantine_for_review: moved to quarantine location
   - GET /api/material-return-notes?production_job=
   - Common for: excess material not used, damaged during transport to floor, wrong material picked

8. Reservation handling:
   - When MIN issues material, hard_reservation reduced accordingly
   - When MRN returns to stock, hard_reservation NOT restored (production job already used capacity)
   - Returned material goes to available pool

9. Cost tracking:
   - Each issue records unit_cost from batch (FIFO)
   - Issue cost flows to production_job for costing rollup (Phase 4 cost allocation uses this)

10. Production-job-job link (Phase 4 prep):
    - MIN.production_job_id will be populated by Phase 4 logic
    - Cross-reference: GET /api/production-jobs/:id/material-issues (will be valid endpoint after Phase 4)
    - Phase 3 build can test with manually-set production_job_id (null acceptable)

Tests:
- MR creation and approval
- MIN with FIFO selection
- Pick list correctness
- Issue confirmation updates stock
- Partial issue
- MRN with good/damaged/quarantine conditions
- Cost flows correctly
- Reservations adjust correctly

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-10
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- MR and MIN flow
- FIFO-driven batch selection
- Pick list with bin location
- Issue confirmation
- Returns (MRN)

❌ OUT OF SCOPE:
- Nesting run auto-MIN creation → Phase 4 (this prompt builds the MIN infrastructure; Phase 4 wires automation)
- Production tracking → Phase 4
- Panel-level material consumption tracking → Phase 4
- Shop floor scanning → P3-17 (mobile UI here) + Phase 4 (panel tracking)

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Auto-MIN from nesting is Phase 4 wiring. Continue with MIN core?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-10] Material requisition and issue with FIFO and bin-based picking`

---

### PROMPT P3-11 — Stock Count & Physical Verification

```
Build stock count module for monthly cycle counts and quarterly full counts.

1. Count session creation:
   - POST /api/stock-counts
     Input: count_type (cycle / full / spot), location_id, planned_start_date, planned_end_date, counted_by_users (array)
     Auto-generates count_number
     Status: planned
   - Cycle count: subset of materials (e.g., high-value items every month, rest every quarter)
   - Full count: all materials in location (annual or quarterly)
   - Spot count: ad-hoc verification of specific material

2. Count line generation:
   - POST /api/stock-counts/:id/generate-lines
     For cycle: based on cycle strategy (ABC class, last-counted date)
     For full: all materials with stock in location
     Each line: material × bin (or general area), system_quantity (snapshot)

3. Counting:
   - POST /api/stock-counts/:id/lines/:line_id/record
     Input: counted_quantity, counter_user_id, notes
     Auto-computes variance = counted − system

4. Variance resolution:
   - Lines with non-zero variance require resolution:
     - If variance > tolerance: recount
     - If after recount still variance: adjustment with reason
   - POST /api/stock-counts/:id/lines/:line_id/recount
   - POST /api/stock-counts/:id/lines/:line_id/finalize
     Creates stock_adjustment if variance non-zero

5. Mobile-friendly counting interface (P3-17 builds UI):
   - Counter scans bin → sees expected materials → enters counted quantity
   - Offline support for warehouse scanning

6. Approval:
   - POST /api/stock-counts/:id/submit
     All lines must be finalized
     Status: in_progress → completed
   - Adjustments created during count go through stock_adjustments approval

7. Count freeze:
   - Optional: during count, can freeze stock movements for the location
   - Prevents discrepancies during counting
   - POST /api/storage-locations/:id/freeze (admin only)
   - POST /api/storage-locations/:id/unfreeze

8. Stock adjustments:
   - POST /api/stock-adjustments (manual adjustment outside count session)
     Input: adjustment_type, lines (material, quantity, direction)
     Approval based on value threshold
   - Common reasons: damage, theft, system correction, write-off

9. Count history:
   - GET /api/materials/:id/count-history
     Shows past counts, variances over time
     Identifies materials with frequent discrepancies (process issue or theft)

10. Reports:
    - Variance by counter (training opportunity)
    - Variance by material (process or storage issue)
    - Annual shrinkage value
    - Count compliance (% of materials counted in last cycle)

Tests:
- Cycle count creation
- Full count generation
- Counting with variance
- Recount flow
- Adjustment creation
- Approval for high-value adjustments
- Stock freeze during count
- Reports

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-11
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Stock count sessions (cycle/full/spot)
- Variance and adjustment handling
- Stock freeze during count

❌ OUT OF SCOPE:
- AI-based discrepancy investigation → Out of scope
- Theft/shrinkage analytics → Phase 8
- RFID-based counting → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Continue with stock count scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-11] Stock count with variance, adjustments, and freeze support`

---

### PROMPT P3-12 — Vendor Master Admin UI

```
Build admin UI for vendor management.

1. Vendor list (/admin/vendors):
   - DataTable: code, name, type, GSTIN, primary email/phone, rating, status, active POs count
   - Filters: type, country, currency, rating, status
   - Bulk actions: export, deactivate

2. Vendor detail (/admin/vendors/:id):
   - Tabs:
     - Basic Info (name, GST, contact, bank, payment terms)
     - Contacts (multiple with roles)
     - Addresses (multiple with types)
     - Documents (with expiry tracking)
     - Rate Contracts (per material with manufacturer validation)
     - PO History (all POs from this vendor)
     - Performance (lead time, on-time %, reject %)

3. Vendor create wizard:
   - Step 1: Type (domestic/import) and basic info
   - Step 2: Contacts
   - Step 3: Addresses
   - Step 4: Bank and payment
   - Step 5: For imports: IEC, incoterms
   - Step 6: Review and create

4. Rate contracts UI:
   - List per vendor with material, manufacturer, price, currency, validity
   - Add/edit/clone (clone for related materials at similar price)
   - Bulk import via CSV (sample template provided)
   - Price history per contract

5. Document management:
   - Upload with expiry date
   - Visual indicator for expiring/expired documents
   - Renewal reminder configurable

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-12
═══════════════════════════════════════════════════════════
✅ IN SCOPE: Vendor admin UI
❌ OUT OF SCOPE: Vendor portal → Out of scope; advanced analytics → Phase 8
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-12] Vendor master admin UI with rate contracts and document management`

---

### PROMPT P3-13 — PR and PO Admin UI

```
Build admin UI for purchase requisitions and purchase orders.

1. PR list (/admin/purchase-requisitions):
   - Filters: status, date, source (auto/manual/reorder)
   - Bulk: approve, raise PO

2. PR detail with PO creation:
   - View lines, source orders (for consolidated)
   - Per line: quantity, suggested vendor, rate
   - "Create PO" with vendor split (lines from one PR can go to multiple POs)

3. PO list (/admin/purchase-orders):
   - DataTable: PO#, vendor, date, status, value, currency, expected delivery, age
   - Filters: status, vendor, date, value range, type (domestic/import)
   - Approval queue badge for pending approvals
   - Quick actions: view, edit (draft), send, cancel

4. PO builder:
   - Header: vendor (search), type, delivery location, currency, dates
   - Lines:
     - Add line: material search → rate from contract (override allowed) → quantity → expected delivery
     - Live total with taxes
   - Other charges section
   - Payment and delivery terms
   - Action bar: Save Draft, Submit for Approval, Send to Vendor, Cancel, Print

5. PO detail (for approved/sent POs):
   - All info read-only
   - Approval history
   - Communications log (when sent, opened, acknowledged)
   - GRN history (received against this PO)
   - Status timeline

6. PO send modal:
   - Select channels (email/WhatsApp)
   - Recipient override (default to vendor primary)
   - Custom message
   - PDF preview

7. PO PDF preview/download

8. Approval queue (/admin/purchase-orders/pending-approval):
   - Filtered by current user's approval role
   - Quick approve/reject

9. Multi-currency display:
   - Foreign currency POs show INR equivalent in lists
   - Detail view shows both

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-13
═══════════════════════════════════════════════════════════
✅ IN SCOPE: PR and PO admin UI
❌ OUT OF SCOPE: E-procurement / marketplace → Out of scope
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-13] PR and PO admin UI with builder, approval, and send`

---

### PROMPT P3-14 — Import Shipment & Customs UI

```
Build UI for import shipment tracking.

1. Shipment list (/admin/import-shipments):
   - Filters: status, vendor, ETA range, port
   - Cards or table view
   - Overdue indicator

2. Shipment detail (/admin/import-shipments/:id):
   - Tabs:
     - Overview (vessel, ETA, status timeline)
     - POs linked
     - Customs (BoE entry with all charges)
     - Landed Cost Allocation (per-line breakdown)
     - Documents (BoL, BoE, invoice, photos)

3. Shipment create wizard:
   - Step 1: PO(s) selection
   - Step 2: Vessel and container details
   - Step 3: Loading and discharge ports
   - Step 4: Documents upload

4. Customs clearance form:
   - All duty/tax fields with calculations
   - CHA details
   - Auto-allocate landed cost button

5. Landed cost breakdown view:
   - Per material line: FOB + freight + duty + others = total landed
   - Per-unit landed cost displayed
   - Used by GRN

6. Dashboard widget:
   - Active shipments
   - Pending customs clearance
   - Cost variance from estimate

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-14
✅ Import shipment UI
❌ Real-time vessel tracking → Out of scope
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-14] Import shipment and customs admin UI`

---

### PROMPT P3-15 — GRN and QC Admin UI

```
Build UI for GRN and QC.

1. GRN list (/admin/grns):
   - Filters: status, vendor, date, PO, QC pending
   - Quick view of qty received vs ordered

2. GRN create flow:
   - Step 1: Gate entry (PO/shipment ref, vehicle, driver)
   - Step 2: Line receipt (per PO line, scan or enter quantities, batch numbers, expiry)
   - Step 3: Storage destination (bin or general area per line)
   - Step 4: Documents upload (challan, invoice, photos)
   - Step 5: Submit (triggers QC or auto-accept)

3. GRN detail:
   - All info, line status, QC status, stock movements created
   - Re-print gate pass

4. QC inspection list (/admin/quality-inspections):
   - Pending inspections queue
   - Filters: inspector, material, date, result

5. QC inspection form:
   - Parameter checklist with pass/fail
   - Actual vs expected values
   - Photo upload (mandatory for fails)
   - Overall result (accept/reject/deviation)
   - Submit triggers downstream actions

6. QC module disabled banner:
   - When module disabled, GRN UI skips QC step, shows "QC module disabled"

7. Mobile-friendly QC scan UI (used by inspector):
   - Scan GRN QR → inspection screen → record results

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-15
✅ GRN and QC UI
❌ Statistical QC → Out of scope
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-15] GRN and QC admin UI with mobile scan support`

---

### PROMPT P3-16 — Inventory and Stock Admin UI

```
Build inventory views.

1. Stock dashboard (/admin/inventory/dashboard):
   - Total stock value
   - Materials at reorder level
   - Recent movements
   - Top materials by value/quantity
   - Slow-moving materials

2. Stock list (/admin/inventory/stock):
   - DataTable: material, location, bin, current, soft-reserved, hard-reserved, available, valuation
   - Filters: material, location, low-stock, zero-stock, category
   - Drill-down to batches

3. Stock detail per material:
   - All locations breakdown
   - Batch list (FIFO order) with received date, original qty, current qty, cost
   - Movement history
   - Reservations active
   - Days of stock estimate

4. Stock movements list:
   - Filterable timeline of all movements
   - Per-movement detail with linked document

5. Stock transfer UI:
   - From/to location, lines, submit
   - Approval workflow if configured

6. Reorder alerts panel:
   - Active alerts
   - "Convert to PR" action

7. Stock count UI (separate prompt P3-17 covers mobile counting):
   - Session list
   - Create new session
   - View variances per session

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-16
✅ Inventory admin UI
❌ Advanced analytics → Phase 8
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-16] Inventory and stock admin UI with dashboards`

---

### PROMPT P3-17 — Mobile Store Keeper Interface

```
Build mobile interface for warehouse operations (store keepers).

1. /store-keeper mobile route:
   - Login restricted to store_keeper role
   - Touch-friendly large UI

2. Today's tasks:
   - GRNs pending storage
   - MINs pending issue
   - MRNs being received
   - Stock counts active
   - Approved PRs awaiting PO

3. GRN storage flow:
   - Pick GRN → scan each line's material → enter bin or general area → confirm
   - Updates stock_movements with bin assignment

4. MIN issue flow:
   - Pick MIN → view pick list sorted by bin
   - Scan each bin → confirm material → enter quantity issued
   - Hand to production with signature

5. Stock count flow:
   - Pick count session
   - Scan bin → view expected materials → enter physical counts
   - Variance shown immediately
   - Offline support: queue counts if no network

6. Transfer flow:
   - Pick from/to → scan materials → confirm

7. Stock lookup:
   - Scan material QR → show available quantity, locations, batches

8. Offline sync:
   - Local queue for all actions
   - Sync when connection returns
   - Conflict handling: server wins for hard validations

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-17
✅ Mobile store keeper UI with offline support
❌ Voice picking, AR navigation → Out of scope
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-17] Mobile store keeper interface with scanning and offline support`

---

### PROMPT P3-18 — Material Requisition & Issue Admin UI

```
Build admin UI for MR and MIN.

1. MR list (/admin/material-requisitions):
   - Filters: status, production job (when Phase 4 ready), date
   - Pending approvals badge

2. MR detail with approval action

3. MR create form:
   - For non-production requisitions (sample, R&D)
   - Line entry with material search

4. MIN list (/admin/material-issue-notes):
   - Filters: status, location, date

5. MIN detail:
   - Pick list view (printable)
   - Issue confirmation form
   - Stock impact display

6. MRN list and create:
   - For material returns from production
   - Per-line condition (good/damaged/quarantine)

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-18
✅ MR/MIN admin UI
❌ Production-side requisition raising → Phase 4 UI
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-18] Material requisition and issue admin UI`

---

### PROMPT P3-19 — Reorder Alerts and Stock Count Admin UI

```
Build remaining UIs.

1. Reorder alerts (/admin/inventory/reorder-alerts):
   - Active alerts list
   - "Convert to PR" → opens PR draft with material pre-filled
   - Acknowledge or dismiss alert
   - Configuration: per material min levels, per location

2. Stock count sessions (/admin/stock-counts):
   - List sessions with status
   - Create new (cycle/full/spot)
   - Generate count lines (based on type)

3. Stock count detail:
   - Lines with variance
   - Recount action
   - Finalization with adjustment creation

4. Stock adjustments (/admin/inventory/adjustments):
   - List with status, reason, value impact
   - Approval queue
   - Manual adjustment creation

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-19
✅ Alerts, counts, adjustments UI
❌ Predictive reorder ML → Out of scope
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-19] Reorder alerts and stock count admin UI`

---

### PROMPT P3-20 — Phase 2 ↔ Phase 3 Integration

```
Tighten integration between Phase 2 (BOM/material) and Phase 3 (supply chain).

1. Material master integration:
   - When material is deactivated in Phase 2, prevent new PR/PO/rate-contract creation
   - Existing stock and pending POs continue
   - Warning on attempts

2. BOM resolution → material requirement:
   - When order's resolved BOM is created (Phase 2 P2-14), aggregate material needs
   - Cache for PR auto-generation efficiency
   - GET /api/orders/:id/material-requirements (already in P2-17, now consumed by PR engine)

3. Rate contract → material cost reference:
   - When material's preferred rate contract changes price, optionally trigger BOM re-costing (Phase 2)
   - Setting: AUTO_RECOST_ON_RATE_CHANGE (default true)

4. Cross-reference views:
   - On material detail: show vendors carrying this material, current stock, open POs
   - On vendor detail: show materials they carry, total PO value YTD
   - On order detail: show material procurement status

5. Soft reservation creation:
   - When sales.orders confirmed (Phase 1 P1-06): create soft reservations on materials per Layer 1 BOM
   - When order cancelled: release soft reservations
   - When production starts (Phase 4): soft converted to hard via Phase 4 trigger

Tests:
- Material deactivation blocks new procurement
- BOM resolution triggers PR demand
- Rate change triggers re-costing
- Cross-references display correctly
- Soft reservations lifecycle

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-20
✅ Phase 2 ↔ Phase 3 integration
❌ Production triggers → Phase 4 wires them
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-20] Phase 2-3 integration: material deactivation, BOM-to-PR, soft reservations`

---

### PROMPT P3-21 — Communications, Audit, Notifications

```
Ensure full audit and notification coverage for Phase 3 entities.

1. Audit coverage:
   - Verify Prisma middleware logs all changes to vendor and inventory schemas
   - Especially: PO approvals, rate contract changes, stock adjustments, inventory movements

2. Notifications:
   - Vendor events: rate contract expiring, document expiring, blacklisted
   - PR events: created, approved, rejected
   - PO events: approval required at each level, sent to vendor, acknowledged, partially received
   - GRN events: created, accepted, rejected
   - QC events: pending inspection, conditional acceptance approval needed
   - Inventory events: reorder alert, stock count required, adjustment needs approval
   - MIN events: issued (notify production team), MRN created (notify store)
   - Import events: shipment arrived, customs cleared

3. Notification preferences:
   - Use Phase 0 user preferences
   - Defaults per role

4. Daily digests:
   - Procurement: open POs, pending acknowledgements, alerts
   - Store: pending GRNs, MINs, stock count tasks

Tests:
- Audit logs on all Phase 3 entities
- Notifications fire on key events
- Daily digests generated correctly

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-21
✅ Audit + notifications
❌ Real-time alerts via push notification → Out of scope unless mobile app added
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-21] Phase 3 audit and notification coverage`

---

### PROMPT P3-22 — Reports (Procurement, Inventory, Vendor)

```
Build standard Phase 3 reports.

1. Procurement reports:
   - PO aging (open POs by age)
   - PO compliance (received on-time %)
   - Spend by vendor (last 12 months)
   - Spend by material/category
   - Open PR backlog
   - Average PR-to-PO cycle time

2. Vendor reports:
   - Vendor performance scorecard (lead time, quality, on-time)
   - Top vendors by spend
   - Vendor concentration risk (% of total spend on top 5)
   - Rate contract expiry calendar

3. Inventory reports:
   - Stock valuation (per location, per category)
   - Slow-moving materials (no movement in 90 days)
   - Stock aging (oldest batches)
   - Inventory turnover (consumption / avg stock)
   - ABC analysis (high/medium/low value materials)
   - Reorder pending vs delivered

4. Import reports:
   - Active imports with ETAs
   - Customs duty paid YTD
   - Landed cost vs FOB markup

5. QC reports:
   - Reject % by vendor (input to vendor scorecard)
   - Inspection turnaround time
   - Common defects

6. Cycle count reports:
   - Variance by counter, by material
   - Annual shrinkage

7. Standard formats:
   - All reports exportable Excel/CSV/PDF
   - Scheduled email delivery via Phase 0 communication

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P3-22
✅ Standard reports
❌ Custom report builder → Phase 8
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-22] Phase 3 reports for procurement, vendor, inventory, imports, QC`

---

### PROMPT P3-23 — Storage Location Admin UI

```
Build storage location management UI.

1. Storage tree (/admin/storage):
   - Hierarchical tree: branches → locations → racks → bins; separately general areas
   - Drag-drop reordering (optional)
   - Add/edit/delete nodes
   - Bulk bin creation

2. Bin label printing:
   - Select bins → "Print Labels" → generates printable sheet with QR codes
   - Useful for initial warehouse setup

3. Material-bin assignment view:
   - Per bin: what's currently in it
   - Per material: which bins it's in
   - Empty bins list (utilization tracking)

═══════════════════════════════════════════════════════════
✅ Storage UI
❌ 3D visualization, IoT → Out of scope
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-23] Storage location admin UI with tree view and label printing`

---

### PROMPT P3-24 — Procurement Dashboard

```
Build the procurement operations dashboard.

1. /admin/procurement-dashboard:

2. KPI cards:
   - Open POs (count, total value)
   - Pending approvals (current user's queue)
   - Overdue POs (past expected delivery)
   - Active imports
   - Reorder alerts active
   - Pending GRNs
   - QC pending

3. Charts:
   - Spend trend (monthly, last 12 months)
   - Top 10 vendors by spend
   - Material category spend breakdown
   - Open PR-PO funnel

4. Action items:
   - "Convert reorder alerts to PRs"
   - "Approve pending POs"
   - "Receive overdue POs"

5. Filters:
   - Date range, vendor, material, branch

═══════════════════════════════════════════════════════════
✅ Dashboard
❌ AI-based procurement suggestions → Out of scope
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-24] Procurement operations dashboard`

---

### PROMPT P3-25 — CSV Imports for Vendor and Rate Setup

```
Build CSV import for bulk vendor and rate contract setup (initial migration).

1. Vendor import:
   - GET /api/vendors/import-template (per type: domestic or import)
   - POST /api/vendors/import
   - Validates: GST format, IEC for imports, unique vendor identification

2. Rate contract import:
   - GET /api/vendors/rate-contracts/import-template
   - POST /api/vendors/rate-contracts/import
   - Validates: vendor exists, material exists, manufacturer matches material's manufacturer

3. Stock opening balance import:
   - For migrating existing inventory at go-live
   - GET /api/inventory/stock/import-template
   - POST /api/inventory/stock/import
   - Creates: stock_batches with received_at=migration_date, original quantity, cost
   - Special migration mode that bypasses GRN

4. PO opening balance import (for in-flight POs at migration):
   - Bulk import open POs from existing system
   - Marks as is_historical for differentiation

5. Error resolution UI:
   - Per-batch error list
   - Inline correction and retry

═══════════════════════════════════════════════════════════
✅ CSV imports for Phase 3 entities
❌ ERP-to-ERP migration tooling → Out of scope unless added
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-25] CSV imports for vendors, rate contracts, and stock opening balances`

---

### PROMPT P3-26 — Phase 3 Integration Tests & Checklist

```
Final Phase 3 prompt. End-to-end testing.

End-to-end scenarios:

SCENARIO A — Full procurement lifecycle (domestic):
- Create vendor with rate contracts
- Confirm sales order in Phase 1 with resolved BOM (Phase 2)
- Auto-PR generated from BOM theoretical
- Procurement approves PR
- Convert PR to PO with vendor split
- PO submitted, manager approves (above threshold)
- PO sent to vendor via email
- Vendor acknowledges
- GRN created on receipt, lines added with batches
- QC inspection: pass
- GRN accepted → stock movement → batches created with FIFO cost
- Material available in stock

SCENARIO B — Import lifecycle:
- Create import vendor with USD currency
- Create PO in USD with exchange rate snapshot
- Create import_shipment with vessel, BoL, container
- Update status as shipment progresses
- Enter customs clearance with duty/IGST
- Allocate landed cost
- GRN against import: uses landed cost as unit_cost
- Verify FIFO batch has correct landed cost

SCENARIO C — QC reject and return:
- GRN with damaged material
- QC fails
- Reject flow initiates return to vendor
- Communications to vendor
- Stock not added (rejected quantity)

SCENARIO D — Material issue with FIFO:
- Material with 3 batches (different costs)
- Create MR (manually for testing — Phase 4 will auto-create)
- Create MIN, system selects oldest batches first
- Cost of issue weighted across batches
- Verify stock_movements and batch updates

SCENARIO E — Stock count with variance:
- Create cycle count for one location
- Count with variance on some lines
- Recount: still variance
- Finalize with adjustment
- Verify stock matches counted, adjustment recorded

SCENARIO F — Reorder alert workflow:
- Material drops below min stock level
- Alert fires
- Convert alert to PR
- Verify PR created with material pre-filled

SCENARIO G — Module bypass:
- Disable quality_check_inbound module
- Run GRN → auto-accepts without QC
- Stock movements created directly

SCENARIO H — Reservations:
- Confirm order (Phase 1) → soft reservation
- Manually simulate production job start (would be Phase 4) → hard reservation, soft released
- Issue material → hard reservation reduced as MIN issues

Validation checklist:
- [ ] All 38 tables functional
- [ ] All numbering series work
- [ ] All 8 modules registered with correct flags
- [ ] All 11 system settings present
- [ ] Vendor master with rate contracts per manufacturer rule
- [ ] PR auto-generation from BOM theoretical
- [ ] PO multi-level approval (4 tiers)
- [ ] PO sent via email/WhatsApp with tracking
- [ ] Import shipment full lifecycle
- [ ] Landed cost allocation correct
- [ ] GRN with tolerance, rate matching
- [ ] QC bypass works (module on/off)
- [ ] FIFO inventory engine accurate
- [ ] Soft/hard reservations work
- [ ] Material issue flow with batch picking
- [ ] Material return with conditions
- [ ] Stock count with variance and adjustment
- [ ] All admin UIs functional
- [ ] Mobile store keeper UI works with offline
- [ ] CSV imports for migration
- [ ] Cross-phase integrations functional
- [ ] Audit logging on all entities
- [ ] Notifications fire correctly
- [ ] Reports work
- [ ] RBAC enforced

Documentation:
- Phase 3 README

If any check fails, fix with [P3-26-FIX] commits before Phase 4.

═══════════════════════════════════════════════════════════
✅ Phase 3 final validation
❌ Phase 4 features → Phase 4

⚠️ "Phase 3 complete with this prompt. Phase 4 starts after green. Continue with validation?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P3-26] Phase 3 integration tests and checklist validation`

---

## PART 6 — COMMIT MESSAGES QUICK REFERENCE

| # | Commit Message |
|---|----------------|
| P3-01 | `[P3-01] Vendor and inventory schema with 38 tables` |
| P3-02 | `[P3-02] Vendor master with manufacturer-dealer rate contracts` |
| P3-03 | `[P3-03] Storage locations with racks, bins, and general areas` |
| P3-04 | `[P3-04] Purchase requisition with auto-generation from BOM theoretical requirements` |
| P3-05 | `[P3-05] Purchase order with multi-level approval and vendor communication` |
| P3-06 | `[P3-06] Import shipment tracking with customs and landed cost allocation` |
| P3-07 | `[P3-07] Goods receipt note with PO matching and tolerance check` |
| P3-08 | `[P3-08] Quality check inbound with bypass support and parameter templates` |
| P3-09 | `[P3-09] FIFO inventory engine with batch tracking and reservations` |
| P3-10 | `[P3-10] Material requisition and issue with FIFO and bin-based picking` |
| P3-11 | `[P3-11] Stock count with variance, adjustments, and freeze support` |
| P3-12 | `[P3-12] Vendor master admin UI with rate contracts and document management` |
| P3-13 | `[P3-13] PR and PO admin UI with builder, approval, and send` |
| P3-14 | `[P3-14] Import shipment and customs admin UI` |
| P3-15 | `[P3-15] GRN and QC admin UI with mobile scan support` |
| P3-16 | `[P3-16] Inventory and stock admin UI with dashboards` |
| P3-17 | `[P3-17] Mobile store keeper interface with scanning and offline support` |
| P3-18 | `[P3-18] Material requisition and issue admin UI` |
| P3-19 | `[P3-19] Reorder alerts and stock count admin UI` |
| P3-20 | `[P3-20] Phase 2-3 integration: material deactivation, BOM-to-PR, soft reservations` |
| P3-21 | `[P3-21] Phase 3 audit and notification coverage` |
| P3-22 | `[P3-22] Phase 3 reports for procurement, vendor, inventory, imports, QC` |
| P3-23 | `[P3-23] Storage location admin UI with tree view and label printing` |
| P3-24 | `[P3-24] Procurement operations dashboard` |
| P3-25 | `[P3-25] CSV imports for vendors, rate contracts, and stock opening balances` |
| P3-26 | `[P3-26] Phase 3 integration tests and checklist validation` |

---

## PART 7 — DEPENDENCIES & INTEGRATION

### From Phase 0:
- core.workflow_engine, core.communication_*, core.audit_logs, core.documents
- core.numbering_series for all P3 series
- core.payment_transactions (vendor payments — accounting in Phase 8)
- core.modules for 8 P3 modules

### From Phase 1:
- sales.orders → soft reservations created on confirmation
- sales.customers (vendor master uses same patterns)

### From Phase 2:
- material.materials → rate contracts and stock
- material.manufacturers → rate contracts (manufacturer must match material)
- product_engineering.boms → BOM theoretical for PR

### To Phase 4 (production):
- production.production_jobs (Phase 4 creates) → MIN references via production_job_id
- production.nesting_runs (Phase 4 creates) → MIN references via nesting_run_id; Phase 4 wires up auto-MIN
- inventory.stock → Phase 4 reads available stock for job planning

### To Phase 5:
- inventory.stock → after production, finished goods join FG stock (separate from raw material stock)

### To Phase 8 (finance):
- inventory.purchase_orders → accounts payable
- inventory.goods_receipt_notes → vendor invoice matching (3-way match)
- inventory.stock_movements → COGS posting

---

## PART 8 — BEFORE STARTING PHASE 3

1. Phase 0, 1, 2 complete and tested
2. Decide your storage layout — at least one factory store and one warehouse, with bins or general areas defined
3. Have vendor list ready (Excel) for bulk import during P3-25
4. Have rate contracts data ready if available
5. Have opening stock data ready if migrating from existing system
6. Configure Phase 0 communication providers (PO will be sent via email at minimum)
7. Decide PO approval thresholds for your company size (defaults provided)

---

## PART 9 — WHAT PHASE 3 DELIBERATELY DEFERS

🔄 Production execution → Phase 4
🔄 Nesting run / Layer 2 generation → Phase 4 (Phase 3 consumes when Phase 4 builds it)
🔄 Panel tracking → Phase 4
🔄 Finished goods stock (post-production) → Phase 5
🔄 Vendor portal → Out of scope unless requested
🔄 Real-time vessel tracking → Out of scope (manual updates fine)
🔄 Vendor performance auto-scoring → Phase 8
🔄 Accounts payable / finance posting → Phase 8
🔄 3-way match automation (PO ↔ Invoice ↔ GRN) → Phase 8
🔄 ICEGATE / customs API → Out of scope
❌ LIFO / weighted average costing → FIFO chosen per addendum
❌ Configurator-based requisitions → Out of scope

---

**End of Phase 3 specification — Version 2.0 (clean)**

When you complete P3-26 with all checklist items green, Phase 4 (production) regeneration comes next. Phase 4 will:
- Build production_jobs and nesting_runs tables
- Wire up auto-MIN from nesting runs (completing the Layer 2 flow that Phase 3 prepared for)
- Build panel traceability with QR codes
- Build the three production tracks (wooden, aluminium, MS metal)
- Build job work outsourcing
- Build in-process QC

This file supersedes: old PROMPTS_P3.md and the Phase 3 sections of PHASES_2345_ADDENDUM_MATERIAL_PLANNING.md. After saving this file to /specs, you can delete the old PROMPTS_P3.md.
