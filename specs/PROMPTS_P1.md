# PHASE 1 — ORDER ENTRY, CUSTOMER MASTER & PRODUCT MASTER

**Version:** 2.0
**Total prompts:** 12
**Total tables:** 23
**Estimated timeline:** 3-4 weeks at 4-6 hours/day
**Dependencies:** Phase 0 must be complete (at minimum P0-04 schema, P0-05 auth, P0-06 RBAC, P0-08 workflow, P0-09 audit, P0-15 communication, P0-20 payment foundation, P0-21 customer accounts)

---

## CLAUDE CODE — READ BEFORE EVERY PROMPT IN THIS FILE

```
═══════════════════════════════════════════════════════════
SCOPE PROTECTION INSTRUCTIONS — APPLIES TO ALL PROMPTS HERE
═══════════════════════════════════════════════════════════
Before agreeing to ANY scope addition during a prompt:
1. Check the SCOPE BOUNDARIES section at end of the current prompt
2. Check FORWARD_REFERENCES.md in project root
3. If the requested feature is listed for a future phase:
   Respond: "That feature is planned for [Phase X, Prompt PX-NN].
   Adding it here will create incomplete functionality dependent on
   tables/services not yet built. Recommend deferring. Continue with
   current Phase 1 scope?"
4. Only proceed with out-of-scope work if user explicitly says:
   "Override scope protection. Add this as an exception."
5. If user overrides, prefix the commit message with [OVERRIDE].
═══════════════════════════════════════════════════════════
```

---

## PART 1 — WHAT PHASE 1 BUILDS

Phase 1 gets orders into the system so that production (Phase 4) has data to work with. It builds three connected sub-modules:

**Sub-module A — Customer Master** (basic, NOT full CRM)
Customer records with multiple addresses and contacts, tier classification, GST/PAN, bank details for refunds. This is the minimal customer data needed for orders. The full CRM (360 view, activity timeline, lead pipeline, segmentation) is Phase 6.

**Sub-module B — Product Master**
Product catalog with categories, standard size variants, tier-based pricing, HSN codes, images, installation flag, warranty period. BOM linkage and cost tracking come in Phase 2.

**Sub-module C — Order Management**
Order entry (manual + CSV import + portal source), multi-product orders, size variants and custom items on lines, multiple delivery addresses, tax calculation, payment terms with milestones, order status workflow, and document generation (proforma, sales order, tax invoice, payment receipt).

**What Phase 1 explicitly does NOT build:**
- Lead Management or full CRM → Phase 6
- Quotation / RFQ → Phase 6
- BOM → Phase 2
- Material requirement calculation → Phase 2 (theoretical) + Phase 4 (planned)
- Production trigger → Phase 4
- Dispatch documents (challan, packing list, E-Way Bill) → Phase 5
- Installation certificate, warranty card → Phase 5
- Credit notes, advance receipt vouchers, E-invoice → Phase 8
- Customer portal order placement screens → Phase 7
- Order amendment via quote revision → Phase 6

---

## PART 2 — DATABASE SCHEMA SUMMARY

All Phase 1 tables go in the `sales` schema. 23 tables:

**Customer Master (4 tables):**
customers, customer_addresses, customer_contacts, customer_tier_pricing.

**Product Master (4 tables):**
product_categories, products, product_size_variants, product_tier_pricing.

**Order Management (12 tables):**
orders, order_lines, order_line_custom_specs, order_shipments, order_shipment_lines, payment_terms_templates, payment_term_milestones, order_payment_schedule, order_documents, order_status_history, order_charges, order_tax_breakup.

**Supporting (3 tables):**
order_import_batches, order_import_errors, document_sequences (links to core.numbering_series).

---

## PART 3 — KEY DESIGN DECISIONS (FROM YOUR EARLIER ANSWERS)

### Decision 1 — Order sources: manual + CSV + portal
Orders enter via internal sales team (manual), CSV import from existing CRM, and customer portal (architects/dealers placing online). The schema supports all three from day one; portal placement UI is Phase 7 but the data path exists now.

### Decision 2 — All customer/delivery scenarios supported
Dealer orders, delivery to end-customer site, architect-on-behalf-of-client, multiple delivery locations per order, separate billing and delivery entities — all supported via flexible address linking and order-level overrides.

### Decision 3 — All order composition scenarios
Single product, multiple products with different quantities, same product in different sizes, custom one-off items, mix of catalog + custom — all supported via order line types.

### Decision 4 — Mixed pricing
Catalog price + customer-type tier pricing + individual customer override + manual line price entry. Resolution order: manual override > customer-specific > customer-type tier > catalog base.

### Decision 5 — Flexible payment terms with varying milestones
Default 50% advance + 40% before dispatch + 10% after installation, BUT milestones vary per customer/order. The payment schedule is per-order (not locked to a template), so admin can adjust milestone percentages and trigger events for individual orders.

### Decision 6 — All 8 documents, but split across phases
Phase 1 generates: Proforma Invoice, Sales Order Confirmation, Tax Invoice, Payment Receipt. Phase 5 generates: Delivery Challan, Packing List, Installation Certificate, Warranty Card. (E-Way Bill also Phase 5.)

### Decision 7 — Product master minimum + extensibility
Product code/SKU, name, category at minimum. Plus standard size, HSN, base price, UOM, tax rate, tier pricing, image, weight, is_custom flag. BOM linkage column exists but stays empty until Phase 2.

### Decision 8 — GST compliance from the start
Tax invoice is fully GST-compliant: HSN codes, CGST+SGST (intrastate) vs IGST (interstate), place of supply, amount in words (Indian Lakh/Crore format), QR code for B2B above ₹500. This matters legally.

---

## PART 4 — THE 12 PROMPTS

Copy each prompt verbatim. After success: test → commit → push → next prompt.

---

### PROMPT P1-01 — Sales Schema (23 Tables)

```
Build the Phase 1 database schema. All 23 tables in `sales` schema.

Read ERP_SPEC.md, PROMPTS_P1.md Part 2, and FORWARD_REFERENCES.md for context.

CUSTOMER MASTER:

sales.customers:
  id, customer_code (auto-generated, unique), customer_name, legal_name,
  customer_type (retail/dealer/architect/interior_designer/corporate),
  gstin, pan, primary_phone, primary_email,
  default_billing_address_id (FK), default_shipping_address_id (FK),
  credit_limit, credit_days, payment_terms_template_id (FK, nullable),
  bank_name, bank_account_number, bank_ifsc (for refunds),
  is_active, is_blacklisted, notes,
  source (manual/csv_import/portal), linked_customer_account_id (FK to core.customer_accounts, nullable),
  audit columns, soft-delete columns

sales.customer_addresses:
  id, customer_id (FK), address_type (billing/shipping/site/registered),
  contact_person, contact_phone, address_line_1, address_line_2,
  city, state, state_code (for GST), pincode, country (default India),
  is_default_billing, is_default_shipping, notes

sales.customer_contacts:
  id, customer_id (FK), contact_name, designation, phone, email,
  role (decision_maker/purchase/accounts/site_contact), is_primary, notes

sales.customer_tier_pricing:
  id, customer_id (FK), product_id (FK, nullable for category-wide),
  product_category_id (FK, nullable), discount_percent, special_price,
  valid_from, valid_until, notes

PRODUCT MASTER:

sales.product_categories:
  id, category_code, name, parent_category_id (FK, self-ref for hierarchy),
  description, display_order, is_active, audit columns

sales.products:
  id, product_code (SKU, auto or manual), product_name, category_id (FK),
  description, standard_dimensions (jsonb: L/W/H/D), hsn_code,
  base_price, uom_id (FK to core), tax_rate_percent,
  requires_installation (bool), warranty_period_months,
  weight_kg, image_url, is_custom (bool), is_active,
  bom_id (FK, nullable — STAYS EMPTY until Phase 2),
  audit columns, soft-delete columns

sales.product_size_variants:
  id, product_id (FK), variant_name, dimensions (jsonb: L/W/H/D),
  variant_sku, price_override (nullable — uses product base_price if null),
  weight_kg, is_active

sales.product_tier_pricing:
  id, product_id (FK), customer_type (retail/dealer/architect/interior_designer/corporate),
  discount_percent OR fixed_price, valid_from, valid_until

ORDER MANAGEMENT:

sales.orders:
  id, order_number (auto-series ORD-YYYY-NNNN), customer_id (FK),
  order_date, order_type (regular/sample/replacement),
  source (manual/csv_import/portal/quote_conversion),
  source_quote_id (FK, nullable — populated by Phase 6 conversion),
  source_quote_version_id (FK, nullable),
  billing_address_id (FK), default_shipping_address_id (FK),
  expected_delivery_date, promised_delivery_date,
  payment_terms_template_id (FK, nullable),
  status (draft/confirmed/in_production/ready_for_dispatch/dispatched/delivered/installed/completed/cancelled),
  subtotal, total_discount, taxable_value, total_tax, total_charges, grand_total,
  amount_paid, amount_due,
  place_of_supply_state_code, is_interstate (bool),
  actual_material_cost (nullable — populated by Phase 4 cost allocation, reference only),
  notes, internal_notes,
  created_by, confirmed_by, confirmed_at,
  audit columns, soft-delete columns

sales.order_lines:
  id, order_id (FK), line_sequence,
  line_type (catalog_product/custom_item/charge_line),
  product_id (FK, nullable), product_size_variant_id (FK, nullable),
  description, quantity, uom_id (FK),
  unit_price_before_discount, discount_type (none/percent/amount), discount_value,
  unit_price_final, line_subtotal,
  hsn_code, tax_rate_percent, cgst_amount, sgst_amount, igst_amount, line_tax_total,
  line_grand_total,
  custom_dimensions (jsonb, nullable — for custom-size orders),
  bom_resolved (bool, default false — set true in Phase 2 when BOM resolves),
  notes

sales.order_line_custom_specs:
  id, order_line_id (FK), spec_key, spec_value, spec_type (dimension/finish/material/other),
  notes
  (For custom items: captures additional specifications)

sales.order_shipments:
  id, order_id (FK), shipment_number, shipping_address_id (FK),
  expected_dispatch_date, status (planned/ready/dispatched/delivered),
  notes
  (Supports multiple delivery locations per order)

sales.order_shipment_lines:
  id, shipment_id (FK), order_line_id (FK), quantity_in_shipment
  (Maps which order lines go to which shipment — supports split delivery)

sales.payment_terms_templates:
  id, template_code, template_name, description, is_active, audit columns
  (e.g., "Standard 50-40-10", "Full Advance", "30-day Credit")

sales.payment_term_milestones:
  id, template_id (FK), milestone_sequence, milestone_name,
  percentage, trigger_event (on_order/before_dispatch/on_delivery/after_installation/fixed_days),
  trigger_days (for fixed_days type), notes

sales.order_payment_schedule:
  id, order_id (FK), milestone_sequence, milestone_name,
  percentage, amount, trigger_event, trigger_days,
  due_date (computed when trigger fires), status (pending/partial/paid/overdue),
  amount_paid, paid_at, payment_transaction_id (FK to core.payment_transactions, nullable),
  notes
  (Per-order — copied from template but EDITABLE per order so milestones can vary per customer)

sales.order_documents:
  id, order_id (FK), document_type (proforma/sales_order/tax_invoice/payment_receipt),
  document_number (auto-series), pdf_file_path, generated_at, generated_by,
  is_cancelled, cancelled_reason
  (Links to core.documents for storage)

sales.order_status_history:
  id, order_id (FK), from_status, to_status, changed_by, changed_at,
  time_in_previous_status_hours, notes

sales.order_charges:
  id, order_id (FK), charge_type (transport/installation/packaging/other),
  description, amount, is_taxable, hsn_code, tax_rate_percent

sales.order_tax_breakup:
  id, order_id (FK), hsn_code, taxable_value,
  cgst_rate, cgst_amount, sgst_rate, sgst_amount, igst_rate, igst_amount,
  total_tax
  (HSN-wise tax summary for the tax invoice)

SUPPORTING:

sales.order_import_batches & sales.order_import_errors:
  Standard import tracking pattern (like other phases)

Implementation requirements:
1. All tables in `sales` schema with @@schema("sales")
2. UUIDs for PKs
3. Standard audit columns (created_at, updated_at, created_by, updated_by)
4. Soft-delete on customers, products, orders
5. Indexes on all FK columns and filter fields (status, order_date, customer_id, customer_type)
6. Unique constraints: customer_code, product_code, order_number, document_number per type
7. Numbering series (register in core.numbering_series): ORD, PROF (proforma), SO (sales order), INV (tax invoice), RCPT (receipt)
8. Module registry entries (core.modules):
   - customer_master (core=true, bypassable=false)
   - product_master (core=true, bypassable=false)
   - order_management (core=true, bypassable=false)
9. Seed: 2-3 payment_terms_templates (Standard 50-40-10, Full Advance, 30-day Credit)

Generate Prisma migration. Run it. Verify all 23 tables via \dt sales.*. Show output.

Schema only — no APIs or UI.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P1-01
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- All 23 sales-schema tables
- Indexes, constraints, numbering series, module registry
- Payment term template seed

❌ OUT OF SCOPE (DO NOT EXPAND):
- BOM tables → Phase 2 (bom_id column exists but empty)
- Material requirement tables → Phase 2/4
- Quote/lead tables → Phase 6
- Dispatch/shipment execution tables → Phase 5 (order_shipments here is just planning)
- Credit note / advance receipt tables → Phase 8

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"That table belongs to [Phase X]. Phase 1 schema is order intake only.
Continue with the 23-table Phase 1 schema?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P1-01] Sales schema with 23 tables for customers, products, and orders`

---

### PROMPT P1-02 — Customer Master Management

```
Build customer master management (basic — NOT full CRM).

Read ERP_SPEC.md and PROMPTS_P1.md for context.

1. Customer APIs:
   - POST /api/customers — create (auto-generate customer_code)
     Permission: customers.create
     Validates: unique GSTIN if provided, valid GST format, valid PAN format
   - GET /api/customers?type=&search=&is_active=&page=&limit=
     Permission: customers.view (data-filtered per RBAC)
   - GET /api/customers/:id (with addresses, contacts, tier pricing)
   - PUT /api/customers/:id
   - DELETE /api/customers/:id (soft delete; block if active orders exist)
   - POST /api/customers/:id/reactivate
   - POST /api/customers/:id/blacklist (with reason)

2. Addresses:
   - POST /api/customers/:id/addresses
   - PUT /api/customers/addresses/:address_id
   - DELETE /api/customers/addresses/:address_id (block if used in active order)
   - Set default billing/shipping
   - State code auto-derived from state (for GST place-of-supply)

3. Contacts:
   - CRUD under /api/customers/:id/contacts
   - One primary contact enforced

4. Tier pricing:
   - POST /api/customers/:id/tier-pricing (customer-specific overrides)
   - GET /api/customers/:id/tier-pricing
   - Used by order pricing resolution later

5. GST validation:
   - GSTIN format check (15 chars, state code + PAN + entity + checksum)
   - PAN format check (10 chars)
   - State code extraction from GSTIN for interstate determination

6. Customer code generation:
   - Auto from numbering series (e.g., CUST-2026-0001)
   - Configurable format

7. Link to portal account:
   - If customer also has a core.customer_accounts (portal access), link via linked_customer_account_id
   - Allows portal users to see their orders (Phase 7)

8. CSV import:
   - POST /api/customers/import
   - Sample template download
   - Validation, per-row outcome, error report

Tests: customer CRUD, GST validation, address management, tier pricing, soft delete with active-order block, CSV import.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P1-02
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Customer CRUD with addresses, contacts, tier pricing
- GST/PAN validation
- CSV import
- Portal account linking

❌ OUT OF SCOPE:
- Customer 360 view (all orders/quotes/activities) → Phase 6, P6-02
- Customer activity timeline → Phase 6, P6-05
- Customer segmentation → Phase 6, P6-16
- Architect→end-customer hierarchy → Phase 6, P6-02
- Lead conversion → Phase 6

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"360 view and CRM features are Phase 6. This is basic customer master.
Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P1-02] Customer master with addresses, contacts, and tier pricing`

---

### PROMPT P1-03 — Product Master Management

```
Build product master management.

1. Product categories:
   - CRUD with hierarchy (parent_category_id)
   - GET /api/product-categories (tree view)
   - POST/PUT/DELETE

2. Products:
   - POST /api/products — create
     Auto-generate product_code OR accept manual
     Required: name, category, base_price, uom, tax_rate, hsn_code
     Optional: dimensions, weight, image, warranty, requires_installation, is_custom
   - GET /api/products?category=&search=&is_active=&is_custom=
   - GET /api/products/:id (with size variants, tier pricing)
   - PUT /api/products/:id
   - DELETE /api/products/:id (soft; block if used in active orders)

3. Size variants:
   - POST /api/products/:id/variants
     Input: variant_name, dimensions, price_override (optional), variant_sku
   - GET /api/products/:id/variants
   - PUT/DELETE variants
   - If price_override null, variant uses product base_price

4. Tier pricing:
   - POST /api/products/:id/tier-pricing
     Per customer_type: discount_percent OR fixed_price, validity dates
   - GET /api/products/:id/tier-pricing

5. Product image:
   - POST /api/products/:id/image (multipart)
   - Stored via core.documents
   - Updates product.image_url

6. HSN and tax:
   - HSN code from core HSN master (P0-04)
   - Tax rate auto-suggested from HSN, override allowed

7. BOM linkage placeholder:
   - bom_id column exists, stays null
   - Do NOT build BOM logic — that's Phase 2
   - When viewing product, show "BOM not configured (Phase 2)" placeholder

8. CSV import:
   - POST /api/products/import
   - Sample template with all fields
   - Validation (category exists, HSN valid, UOM exists)
   - Per-row outcome

Tests: product CRUD, category hierarchy, size variants with/without price override, tier pricing, image upload, CSV import, soft delete block.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P1-03
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Product CRUD, categories, size variants, tier pricing, images
- CSV import

❌ OUT OF SCOPE:
- BOM creation/management → Phase 2 (bom_id stays empty)
- Product cost calculation → Phase 2, P2-09
- Material requirements → Phase 2/4
- Parametric/configurator pricing → Deferred indefinitely
- Selling-via-portal catalog UI → Phase 7

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"BOM is Phase 2. Configurator is deferred. This is product master only.
Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P1-03] Product master with categories, size variants, and tier pricing`

---

### PROMPT P1-04 — Order Core (Header & Lines)

```
Build order creation core — header and lines.

1. Order header APIs:
   - POST /api/orders — create order (status=draft)
     Input: customer_id, order_date, order_type, source, billing_address_id, shipping_address_id, expected_delivery_date, payment_terms_template_id, notes
     Auto: order_number from series, place_of_supply from shipping state, is_interstate computed (org state vs customer state)
   - GET /api/orders?status=&customer=&date_range=&source=&page=&limit=
   - GET /api/orders/:id (full: lines, charges, payment schedule, documents, tax breakup)
   - PUT /api/orders/:id (header edits, draft only)
   - DELETE /api/orders/:id (soft, draft only; confirmed orders use cancel)

2. Order lines APIs:
   - POST /api/orders/:id/lines — add line
     line_type options:
       catalog_product: product_id, size_variant_id (optional), quantity
         → fetches price via pricing resolution (P1-05)
       custom_item: description, quantity, uom, unit_price (manual), custom_dimensions, custom specs
       charge_line: handled via order_charges, not lines
   - PUT /api/orders/:id/lines/:line_id (draft only)
   - DELETE /api/orders/:id/lines/:line_id (draft only)
   - POST /api/orders/:id/lines/:line_id/custom-specs (for custom items)

3. Multiple delivery addresses (shipments):
   - POST /api/orders/:id/shipments — define a delivery location
   - POST /api/orders/:id/shipments/:shipment_id/assign-lines
     Maps which order lines (and quantities) go to which shipment
   - Supports: one order delivered to multiple sites
   - Default: single shipment to order's shipping address

4. Order calculation engine:
   - On any line change, recalculate:
     - Line subtotals (qty × unit_price_final)
     - Line discounts
     - Line taxes (CGST+SGST if intrastate, IGST if interstate — uses P1-05 tax engine)
     - Order subtotal, total_discount, taxable_value, total_tax, total_charges, grand_total
   - Store HSN-wise breakup in order_tax_breakup

5. Business rules:
   - Cannot add lines to non-draft order
   - At least one line required to confirm
   - Custom items require description + unit_price
   - Quantity > 0

Tests: order creation, all 3 line types, multi-shipment, calculation accuracy, draft-only edit enforcement.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P1-04
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Order header and lines
- Catalog/custom/charge line types
- Multi-shipment (delivery location planning)
- Order total calculation

❌ OUT OF SCOPE:
- Pricing resolution detail → P1-05 (next prompt fills it)
- Tax calculation detail → P1-05
- Order confirmation workflow → P1-06
- Payment schedule → P1-07
- Documents → P1-08
- Production trigger → Phase 4
- BOM resolution → Phase 2

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Pricing and tax detail are P1-05. Confirmation is P1-06. Continue with
order structure?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P1-04] Order core with header, lines, and multi-shipment support`

---

### PROMPT P1-05 — Pricing Resolution & Tax Engine

```
Build the pricing resolution engine and GST tax calculation.

1. Pricing resolution (priority order):
   Function: resolvePrice(product_id, size_variant_id, customer_id, quantity)
   Resolution order (first match wins):
     1. Manual override (if order line has manual price) → use it
     2. Customer-specific tier pricing (customer_tier_pricing for this customer + product)
     3. Customer-type tier pricing (product_tier_pricing for customer's type)
     4. Size variant price_override (if set)
     5. Product base_price
   Returns: { unit_price, price_source, applied_discount }

2. Discount application:
   - Line-level: discount_type (percent/amount), discount_value
   - Applied after base price resolution
   - unit_price_final = resolved_price − discount

3. GST tax calculation:
   Function: calculateTax(taxable_value, hsn_code, is_interstate, tax_rate)
   - Intrastate (org state = customer state): CGST (rate/2) + SGST (rate/2)
   - Interstate (different states): IGST (full rate)
   - Determination: compare org state_code with order's place_of_supply_state_code
   Returns: { cgst_rate, cgst_amount, sgst_rate, sgst_amount, igst_rate, igst_amount, total_tax }

4. Place of supply logic:
   - Default: shipping address state
   - Determines interstate vs intrastate
   - Stored on order, drives tax type

5. Order-level recalculation:
   - Aggregates all lines
   - Computes HSN-wise tax breakup (groups lines by HSN, sums per HSN)
   - Stores in order_tax_breakup
   - Handles charges (taxable charges add to tax base)

6. Amount in words:
   - Indian format with Lakh/Crore
   - Function: amountToWords(amount) → "Rupees Two Lakh Forty-Five Thousand Only"
   - Used in documents (P1-08)

7. Rounding:
   - Round-off handling per Indian invoice norms
   - Round to nearest rupee, store round_off amount

Tests: pricing resolution at each priority level, intrastate tax (CGST+SGST), interstate tax (IGST), HSN-wise breakup, amount in words, rounding.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P1-05
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Pricing resolution (4-level priority)
- GST tax calculation (CGST/SGST/IGST)
- Place of supply
- Amount in words, rounding

❌ OUT OF SCOPE:
- Quote-based pricing / margin engine → Phase 6, P6-09
- BOM-derived cost → Phase 2
- Volume slab pricing → Phase 6 (margin rules)
- E-invoice IRN → Phase 8

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Margin engine and volume slabs are Phase 6. This is order pricing + GST.
Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P1-05] Pricing resolution engine and GST tax calculation`

---

### PROMPT P1-06 — Order Status Workflow & Confirmation

```
Build order status workflow and confirmation.

1. Order status lifecycle:
   draft → confirmed → in_production → ready_for_dispatch → dispatched → delivered → installed → completed
   (Plus: cancelled from most states)

   Phase 1 owns: draft → confirmed
   Later phases drive subsequent transitions:
     - in_production: Phase 4 sets this
     - ready_for_dispatch onwards: Phase 5

2. Confirmation:
   - POST /api/orders/:id/confirm
     Preconditions: at least one line, customer valid, addresses set, payment terms set
     Actions:
       - Status draft → confirmed
       - Generate payment schedule (P1-07)
       - Generate Sales Order Confirmation document (P1-08)
       - Lock order from line edits (amendments require new flow)
       - Notify customer (Phase 0 communication)
       - Log status history
     - If order.source = 'quote_conversion', this may be auto-called by Phase 6

3. Status transition API (generic):
   - POST /api/orders/:id/status
     Validates allowed transitions
     Records status history with time-in-previous-status
   - Phase 1 only allows draft↔confirmed and →cancelled
   - Later-phase statuses rejected if attempted from Phase 1 context (those phases own them)

4. Cancellation:
   - POST /api/orders/:id/cancel
     Input: cancellation_reason
     Allowed from: draft, confirmed (before production)
     After production started: requires elevated permission + reason (production impact)
     Reverses payment schedule, notifies customer

5. Workflow engine integration:
   - Use Phase 0 workflow engine for confirmation approval (if configured)
   - Order value threshold → manager approval before confirm (admin-configurable)
   - If no approval workflow active, direct confirm

6. Order amendment note:
   - Phase 1 does NOT build full amendment (that's via quote revision in Phase 6)
   - Confirmed orders are locked
   - Minor corrections: admin-only edit with audit, before production

Tests: confirmation with preconditions, status transitions (valid/invalid), cancellation, workflow approval if configured.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P1-06
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Order confirmation (draft → confirmed)
- Status workflow framework
- Cancellation
- Approval workflow integration

❌ OUT OF SCOPE:
- Production status transitions → Phase 4
- Dispatch/delivery transitions → Phase 5
- Full order amendment → Phase 6 (via quote revision)
- Material requirement on confirm → Phase 2

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Production/dispatch transitions are owned by Phases 4/5. Amendment is
Phase 6. Continue with confirmation scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P1-06] Order status workflow and confirmation with approval integration`

---

### PROMPT P1-07 — Payment Terms & Schedule

```
Build payment terms templates and per-order payment schedules.

1. Payment terms templates (admin):
   - CRUD: /api/admin/payment-terms-templates
   - Each template has milestones (payment_term_milestones)
   - Milestone: name, percentage, trigger_event (on_order/before_dispatch/on_delivery/after_installation/fixed_days), trigger_days
   - Seeded: "Standard 50-40-10", "Full Advance", "30-day Credit"
   - Validation: milestone percentages sum to 100%

2. Per-order payment schedule generation:
   - On order confirmation (P1-06), generate order_payment_schedule from template
   - Calculate amount per milestone = percentage × grand_total
   - CRITICAL: schedule is EDITABLE per order (your requirement — milestones vary per customer)
     - Admin can adjust milestone percentages, amounts, trigger events for THIS order
     - Without changing the template
   - APIs:
     POST /api/orders/:id/payment-schedule/generate (from template)
     GET /api/orders/:id/payment-schedule
     PUT /api/orders/:id/payment-schedule/:milestone_id (adjust this order's milestone)
     POST /api/orders/:id/payment-schedule/milestone (add custom milestone for this order)

3. Due date computation:
   - on_order: due at confirmation
   - before_dispatch: due date set when dispatch is planned (Phase 5 will trigger)
   - on_delivery: due at delivery (Phase 5)
   - after_installation: due after install (Phase 5)
   - fixed_days: due = order_date + trigger_days

4. Payment recording:
   - POST /api/orders/:id/payments
     Input: milestone_id, amount, payment_mode (online/bank_transfer/cheque/cash), reference
     For online: links to Phase 0 payment gateway
     For offline: records UTR/cheque/cash via Phase 0 payment foundation
     Updates order_payment_schedule.amount_paid, status
     Updates order.amount_paid, amount_due
   - GET /api/orders/:id/payments (history)

5. Payment status:
   - Per milestone: pending/partial/paid/overdue
   - Overdue: due_date passed and not fully paid
   - Background job marks overdue daily

6. Payment receipt:
   - On payment recording, generate Payment Receipt document (P1-08)

Tests: template CRUD with 100% validation, schedule generation, per-order milestone adjustment, payment recording (online + offline), status updates, overdue detection.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P1-07
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Payment term templates with milestones
- Per-order editable payment schedule
- Payment recording (online + offline)
- Due date computation, overdue tracking

❌ OUT OF SCOPE:
- Pre-dispatch payment enforcement → Phase 5, P5-06
- Auto-billing post-install → Phase 5, P5-17
- Customer portal payment → Phase 7
- Credit note / refund accounting → Phase 8

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Dispatch enforcement is Phase 5. Portal payment is Phase 7. Continue with
payment terms + recording?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P1-07] Payment terms templates and per-order editable payment schedule`

---

### PROMPT P1-08 — Document Generation (Proforma, Sales Order, Tax Invoice, Receipt)

```
Build Phase 1 document generation.

Read /mnt/skills/public/pdf/SKILL.md before starting.

Generate 4 documents (the other 4 — challan, packing list, certificate, warranty — are Phase 5).

1. Proforma Invoice (before payment):
   - Trigger: manual generate OR on order confirmation (configurable)
   - Contents: PROFORMA label, number, date, validity, consignor (org), consignee (customer billing), shipping address, line items (description, HSN, qty, rate, discount, taxable value, tax, total), tax breakup (CGST/SGST or IGST), other charges, grand total, amount in words, payment terms, bank details, "This is a proforma invoice, not a tax invoice" disclaimer
   - GET /api/orders/:id/documents/proforma

2. Sales Order Confirmation:
   - Trigger: on order confirmation
   - Contents: SALES ORDER label, number, date, customer details, line items, delivery date, payment terms, terms & conditions, authorized signatory
   - GET /api/orders/:id/documents/sales-order

3. Tax Invoice (GST compliant — CRITICAL, legal document):
   - Trigger: manual generate (typically at/after dispatch, but Phase 1 builds the capability)
   - GST-mandatory contents:
     - "TAX INVOICE" title
     - Invoice number (sequential, from series), date
     - Supplier: name, address, GSTIN, state + code
     - Recipient: name, address, GSTIN, state + code
     - Place of supply (state + code)
     - HSN-wise line items: description, HSN, qty, unit, rate, taxable value
     - Tax: CGST rate+amount, SGST rate+amount (intrastate) OR IGST rate+amount (interstate)
     - Total taxable value, total tax, round off, grand total
     - Amount in words (Indian format)
     - Reverse charge applicability (Yes/No)
     - QR code for B2B invoices above ₹500 (per GST e-invoice norms — generate the QR with invoice data; full IRN integration is Phase 8)
     - Bank details
     - Declaration and authorized signatory
   - GET /api/orders/:id/documents/tax-invoice
   - Invoice numbering: strictly sequential, no gaps (GST requirement)

4. Payment Receipt:
   - Trigger: on payment recording
   - Contents: RECEIPT label, number, date, received from (customer), amount, payment mode, reference (UTR/cheque), against which order/milestone, amount in words
   - GET /api/orders/:id/payments/:payment_id/receipt

5. Document infrastructure:
   - All PDFs stored via core.documents
   - Linked in sales.order_documents
   - Regeneration: POST /api/orders/:id/documents/:type/regenerate (admin, logged)
   - Cancellation: documents can be marked cancelled (not deleted — audit trail)
   - Template system: store templates so admin can customize layout later (use clean default with org logo + GSTIN now)

6. Number sequencing:
   - Tax invoice numbers MUST be sequential with no gaps (GST law)
   - Use core.numbering_series with strict atomic increment
   - Cancelled invoices: number retained, marked cancelled (cannot reuse)

Tests: each document generates correctly, GST tax invoice has all mandatory fields, amount-in-words correct, intrastate vs interstate tax display, QR code present for B2B>₹500, sequential invoice numbering, regeneration, cancellation.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P1-08
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Proforma, Sales Order, Tax Invoice, Payment Receipt
- GST-compliant tax invoice with QR
- Sequential invoice numbering

❌ OUT OF SCOPE:
- Delivery Challan, Packing List → Phase 5, P5-07
- Installation Certificate, Warranty Card → Phase 5, P5-13
- E-Way Bill → Phase 5, P5-08
- Credit Note, Debit Note, Advance Receipt Voucher → Phase 8
- E-Invoice IRN via NIC portal → Phase 8 (QR generated locally for now)

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Challan/packing list are Phase 5. Credit notes and e-invoice IRN are Phase 8.
Continue with the 4 Phase 1 documents?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P1-08] Document generation for proforma, sales order, tax invoice, and receipt`

---

### PROMPT P1-09 — CSV Imports (Customers, Products, Orders)

```
Build robust CSV import for customers, products, and orders.

1. Import templates:
   - GET /api/import-templates/customers
   - GET /api/import-templates/products
   - GET /api/import-templates/orders
   - Each downloads sample CSV with headers, required/optional indicators, format examples, enum value lists

2. Customer import:
   - POST /api/customers/import (covered in P1-02, ensure robust here)
   - Handles: customer + default addresses in one file (or addresses separate)

3. Product import:
   - POST /api/products/import (covered in P1-03, ensure robust here)
   - Handles: products + size variants

4. Order import (two-file approach):
   - File 1: order headers (order reference, customer code, dates, addresses, payment terms)
   - File 2: order lines (order reference, product code/custom, quantity, price)
   - POST /api/orders/import — accepts both files
   - Matches lines to headers via order reference
   - Validates: customer exists, products exist, prices valid
   - Creates orders in draft status (review before confirming)

5. Import process (all entities):
   - Upload → validate (dry run) → review errors → execute
   - Stores in import_batches and import_errors
   - Background processing for large files
   - Per-row outcome report
   - Error rows exportable for offline correction and re-import

6. Validation rules:
   - Required fields
   - Foreign key existence (customer, product, category, UOM, HSN)
   - Format (GST, PAN, phone, email, dates, numbers)
   - Duplicate detection (customer code, product code)
   - Enum value matching

7. Migration from existing CRM:
   - Order import supports source='csv_import'
   - Imported orders marked accordingly
   - Old data preserved as reference

Tests: each entity import with valid + invalid rows, two-file order import, validation, error export, large file background processing.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P1-09
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- CSV import for customers, products, orders
- Validation, error reporting, re-import

❌ OUT OF SCOPE:
- CRM activity/lead import → Phase 6, P6-17
- BOM import → Phase 2
- API integration with external CRM → Future (not in current scope)

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"CRM/lead import is Phase 6. BOM import is Phase 2. Continue with
customer/product/order import?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P1-09] CSV imports for customers, products, and orders`

---

### PROMPT P1-10 — Admin Frontend: Customer & Product Master

```
Build admin frontend for customer and product master.

Read /mnt/skills/public/frontend-design/SKILL.md before starting.

1. Customer list (/admin/customers):
   - DataTable: code, name, type, GSTIN, phone, city, status, total orders (count)
   - Filters: type, city, state, status, search
   - Actions: view, edit, deactivate, blacklist
   - Create button → customer form
   - Bulk: export, deactivate

2. Customer detail/form (/admin/customers/:id):
   - Tabs: Basic Info, Addresses, Contacts, Tier Pricing, Orders (list)
   - Address management (add/edit/delete, set defaults)
   - Contact management
   - Customer-specific pricing overrides
   - Orders tab: list of this customer's orders (links to order detail)

3. Customer create wizard:
   - Step 1: Basic info (name, type, GST, contact)
   - Step 2: Addresses (billing, shipping)
   - Step 3: Optional tier pricing
   - GST validation inline

4. Product list (/admin/products):
   - DataTable: code, name, category, base price, HSN, status, image thumbnail
   - Filters: category, status, is_custom
   - Actions: view, edit, deactivate
   - Create button

5. Product detail/form (/admin/products/:id):
   - Tabs: Basic Info, Size Variants, Tier Pricing, Image
   - Size variant management with dimensions and price overrides
   - Tier pricing per customer type
   - Image upload with preview
   - BOM placeholder: "Configure BOM in Phase 2" (disabled link)

6. Product categories (/admin/product-categories):
   - Tree view
   - Create/edit/reorder

7. CSV import UI:
   - Upload, validation preview, error display, execute
   - For both customers and products

8. Mobile responsive.

Use existing P0-14 layout and components.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P1-10
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Customer and product master UI
- CSV import UI

❌ OUT OF SCOPE:
- BOM UI → Phase 2
- Customer 360 view → Phase 6
- Catalog browsing for customers → Phase 7

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"BOM UI is Phase 2. Continue with master data UI?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P1-10] Admin frontend for customer and product master`

---

### PROMPT P1-11 — Admin Frontend: Order Management

```
Build admin frontend for order management.

Read /mnt/skills/public/frontend-design/SKILL.md before starting.

1. Order list (/admin/orders):
   - DataTable: order number, customer, date, status, grand total, amount due, delivery date
   - Filters: status, customer, date range, source, overdue payment
   - Status badges with colors
   - Actions: view, edit (draft), confirm (draft), cancel
   - Create button → order builder

2. Order builder (/admin/orders/:id):
   - Header section: customer (search-select), addresses, dates, payment terms
   - Lines section:
     - "Add Line" → modal with type selector (catalog product / custom item)
     - Catalog: product search, size variant, quantity → live price (showing resolution source)
     - Custom: description, quantity, unit, price, custom dimensions, specs
     - Line list with edit/delete (draft only)
   - Charges section: transport, installation, packaging
   - Shipments section: define delivery locations, assign lines
   - Live totals panel: subtotal, discount, taxable, CGST/SGST/IGST, charges, grand total
   - Action bar: Save Draft, Confirm, Generate Proforma, Cancel

3. Order detail (confirmed orders):
   - Read-only line view
   - Payment schedule with record-payment action
   - Documents tab (proforma, sales order, tax invoice, receipts) with download
   - Status history timeline
   - Status: shows current stage (production/dispatch stages owned by later phases, shown read-only)

4. Payment recording UI:
   - From order detail → "Record Payment"
   - Milestone selector, amount, mode (online/offline), reference
   - For online: Razorpay flow (Phase 0)
   - For offline: UTR/cheque/cash entry
   - Generates receipt

5. Document viewer:
   - Inline PDF preview
   - Download
   - Regenerate (admin)

6. Order CSV import UI:
   - Two-file upload (headers + lines)
   - Validation, preview, execute

7. Mobile: order viewing and payment recording mobile-friendly; order building desktop-preferred.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P1-11
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Order builder, list, detail UI
- Payment recording UI
- Document viewing
- Order CSV import UI

❌ OUT OF SCOPE:
- Production tracking UI → Phase 4
- Dispatch UI → Phase 5
- Quote builder → Phase 6
- Customer portal order placement → Phase 7

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Production and dispatch UI are Phases 4/5. Quote builder is Phase 6.
Continue with order management UI?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P1-11] Admin frontend for order management with builder and payment recording`

---

### PROMPT P1-12 — Phase 1 Integration Tests & Checklist Validation

```
Final Phase 1 prompt. Build integration tests and validate the completion checklist.

End-to-end scenarios:

1. Full order lifecycle (manual):
   - Create customer with billing + shipping addresses
   - Create products with size variants and tier pricing
   - Create order, add catalog lines + custom item + charges
   - Verify pricing resolution (tier pricing applied)
   - Verify tax calculation (intrastate CGST+SGST)
   - Confirm order → payment schedule generated, sales order doc created
   - Record advance payment (50%) → receipt generated
   - Generate proforma and tax invoice
   - Verify all documents correct

2. Interstate order:
   - Customer in different state from org
   - Verify IGST applied (not CGST+SGST)
   - Verify place of supply on invoice

3. Multi-shipment order:
   - One order, two delivery addresses
   - Assign lines to shipments
   - Verify shipment structure

4. Custom-size order:
   - Order with custom dimensions and specs
   - Verify custom item handling

5. Varying payment milestones:
   - Order with non-standard milestones (adjust the 50-40-10 for this customer)
   - Verify per-order schedule editable without changing template

6. Pricing priority:
   - Product with base price, tier price, customer-specific price
   - Verify customer-specific wins over tier wins over base
   - Verify manual override wins over all

7. CSV imports:
   - Import customers (with errors), products, orders (two-file)
   - Verify validation and error reporting

8. Quote conversion readiness:
   - Verify orders table accepts source='quote_conversion' with source_quote_id
   - (Actual conversion is Phase 6, but the data path must work)

Checklist validation:
- [ ] All 23 tables exist
- [ ] Numbering series work (ORD, PROF, SO, INV, RCPT)
- [ ] 3 modules registered (customer_master, product_master, order_management)
- [ ] Customer CRUD with addresses, contacts, tier pricing
- [ ] GST/PAN validation
- [ ] Product CRUD with variants and tier pricing
- [ ] Order creation with all line types
- [ ] Multi-shipment support
- [ ] Pricing resolution (4-level priority)
- [ ] Tax calculation (intrastate + interstate)
- [ ] HSN-wise tax breakup
- [ ] Order confirmation with workflow
- [ ] Payment schedule (editable per order)
- [ ] Payment recording (online + offline)
- [ ] All 4 documents generate correctly
- [ ] Tax invoice GST-compliant with QR
- [ ] Sequential invoice numbering (no gaps)
- [ ] Amount in words (Indian format)
- [ ] CSV imports for all 3 entities
- [ ] RBAC enforced on all APIs
- [ ] Audit logging on all order actions
- [ ] Communication on confirmation
- [ ] bom_id column exists but empty (Phase 2 ready)
- [ ] source='quote_conversion' path works (Phase 6 ready)

Documentation:
- Phase 1 README with APIs, screens, documents

If any check fails, fix with [P1-12-FIX] before proceeding to Phase 2.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P1-12
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Phase 1 integration testing and validation
- Documentation

❌ OUT OF SCOPE:
- Phase 2 features → Phase 2

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Phase 1 is complete with this prompt. Phase 2 (BOM/materials) starts after
this is green. Continue with Phase 1 validation?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P1-12] Phase 1 integration tests and checklist validation`

---

## PART 5 — COMMIT MESSAGES QUICK REFERENCE

| # | Commit Message |
|---|----------------|
| P1-01 | `[P1-01] Sales schema with 23 tables for customers, products, and orders` |
| P1-02 | `[P1-02] Customer master with addresses, contacts, and tier pricing` |
| P1-03 | `[P1-03] Product master with categories, size variants, and tier pricing` |
| P1-04 | `[P1-04] Order core with header, lines, and multi-shipment support` |
| P1-05 | `[P1-05] Pricing resolution engine and GST tax calculation` |
| P1-06 | `[P1-06] Order status workflow and confirmation with approval integration` |
| P1-07 | `[P1-07] Payment terms templates and per-order editable payment schedule` |
| P1-08 | `[P1-08] Document generation for proforma, sales order, tax invoice, and receipt` |
| P1-09 | `[P1-09] CSV imports for customers, products, and orders` |
| P1-10 | `[P1-10] Admin frontend for customer and product master` |
| P1-11 | `[P1-11] Admin frontend for order management with builder and payment recording` |
| P1-12 | `[P1-12] Phase 1 integration tests and checklist validation` |

---

## PART 6 — DEPENDENCIES & INTEGRATION

### From Phase 0:
- core.users, core.roles → RBAC on all order APIs
- core.numbering_series → ORD, PROF, SO, INV, RCPT
- core.modules → register 3 modules
- core.communication_* → order confirmation, payment notifications
- core.payment_transactions, payment_gateways → payment recording
- core.documents → document storage
- core.workflow_engine → order confirmation approval
- core.audit_logs → all order actions
- core.customer_accounts → link customers to portal accounts
- core HSN master, UOM master, tax rates → product and tax setup

### To later phases:
- Phase 2: products link to BOMs (bom_id), order lines get BOM resolution
- Phase 4: confirmed orders feed production jobs
- Phase 5: orders drive dispatch; payment milestones enforce at dispatch
- Phase 6: quote conversion creates orders (source='quote_conversion'); customers get 360 view
- Phase 7: portal order placement and tracking
- Phase 8: order data feeds finance/accounting

---

## PART 7 — BEFORE STARTING PHASE 1

1. Phase 0 must be complete and tested (all P0-30 checklist green)
2. Verify these Phase 0 pieces work: auth, RBAC, numbering series, communication (at least email), payment foundation, customer accounts, document storage
3. Have sample data ready: 5-10 real customers, 10-20 products with HSN codes, one real order to test against
4. Confirm org GSTIN and state are set (P0-11) — tax calculation depends on it

---

## PART 8 — WHAT PHASE 1 DELIBERATELY DEFERS (read FORWARD_REFERENCES.md for full list)

🔄 Lead Management, CRM, RFQ, Quotation → Phase 6
🔄 BOM, material requirements, costing → Phase 2
🔄 Production → Phase 4
🔄 Dispatch documents, installation → Phase 5
🔄 Customer portal order screens → Phase 7
🔄 Credit notes, e-invoice, finance → Phase 8
🔄 Order amendment via quote revision → Phase 6

**End of Phase 1 specification — Version 2.0**

When you complete P1-12 and all checklist items are green, your foundation (Phase 0 + Phase 1) is solid. Phase 2 (Product Engineering / BOM / Material Master) comes next, implementing MATERIAL_MASTER_DESIGN_LOCK.md.
