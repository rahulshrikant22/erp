# PHASE 2 — PRODUCT ENGINEERING
## Material Master, Manufacturer Catalogs, BOM, Selection Lists, Costing

**Version:** 2.0 (clean rewrite — supersedes old PROMPTS_P2.md, PHASE2_ADDENDUM.md, gap analysis files)
**Total prompts:** 22
**Total tables:** ~32
**Estimated timeline:** 5-6 weeks at 4-6 hours/day
**Dependencies:** Phase 0 complete, Phase 1 complete

---

## CLAUDE CODE — READ BEFORE EVERY PROMPT IN THIS FILE

```
═══════════════════════════════════════════════════════════
SCOPE PROTECTION INSTRUCTIONS — APPLIES TO ALL PROMPTS HERE
═══════════════════════════════════════════════════════════
Before agreeing to ANY scope addition during a prompt:
1. Check the SCOPE BOUNDARIES section at end of the current prompt
2. Check FORWARD_REFERENCES.md in project root
3. Check MATERIAL_MASTER_DESIGN_LOCK.md for authoritative design
4. If the requested feature is listed for a future phase:
   Respond: "That feature is planned for [Phase X, Prompt PX-NN].
   Adding it here will create incomplete functionality dependent on
   tables/services not yet built. Recommend deferring. Continue with
   current Phase 2 scope?"
5. Only proceed with out-of-scope work if user explicitly says:
   "Override scope protection. Add this as an exception."
6. If user overrides, prefix the commit message with [OVERRIDE].
═══════════════════════════════════════════════════════════
```

---

## PART 1 — WHAT PHASE 2 BUILDS

Phase 2 is the engineering heart of the ERP. Five sub-modules:

**Sub-module A — Material Master (per MATERIAL_MASTER_DESIGN_LOCK.md)**
The fully-dynamic, attribute-based material system. Categories, material types, attribute templates, manufacturer catalogs, brand-scoped values, auto-generated codes and names, structural duplicate prevention, image rules, dual UOM. Implements every part of the design lock.

**Sub-module B — Process Master**
Manufacturing operations definition: cutting, edge banding, drilling, lamination, assembly, etc. Standard time and cost per process. Job-work outsource process definitions.

**Sub-module C — BOM (Bill of Materials)**
Per-product BOMs with material lines (primary + alternates) and process lines. Multi-level (sub-assemblies). Wastage per line. Versioning with lock-at-production-start. BOM purpose explicitly labelled as estimation+PO source.

**Sub-module D — Selection List**
The order-time finish/material selection workflow. Generic BOM template + selection list → resolved BOM with actual SKUs. Customer-portal integration ready.

**Sub-module E — Costing**
Material cost rollup from BOM, labor/process cost addition, overhead allocation, margin calculation, selling price computation. Reference-only for orders; quote builder (Phase 6) uses this.

**What Phase 2 explicitly does NOT build:**
- Vendor rate contracts / vendor pricing → Phase 3
- FIFO inventory costing → Phase 3
- Material stock movements → Phase 3
- Purchase orders → Phase 3
- Production execution → Phase 4
- Nesting runs (the Layer-2 planned requirement) → Phase 4 (this phase produces only Layer-1 BOM theoretical)
- Customer-tier margin engine / volume slabs → Phase 6 (Phase 2 builds base costing only)
- Quote builder UI → Phase 6
- Parametric/configurator BOM → Deferred indefinitely

---

## PART 2 — THE TWO-LAYER MATERIAL PLANNING MODEL

Phase 2 only owns Layer 1. Phase 4 owns Layer 2. This is critical to understand for every BOM-related prompt below.

**Layer 1 — Theoretical (from BOM) — built here in Phase 2:**
BOM × order quantity × wastage% = Theoretical material requirement. Used for: quote cost (Phase 6), order costing reference (Phase 1), Purchase Order generation (Phase 3). Slight over-purchase is acceptable per your decision; over-stock becomes inventory.

**Layer 2 — Planned (from nesting) — built in Phase 4:**
Spazio cut list + B-Opti optimization output = Planned sheet requirement. Used for: Material Issue Note (Phase 3 consumes this). NOT calculated here in Phase 2. The BOM column structure includes nothing-yet placeholder fields for it.

**No Layer 3 (actual consumption tracking).** Per your decision, variances absorbed into margin, no reconciliation reports needed. Phase 2 carries no logic for this.

---

## PART 3 — KEY DESIGN DECISIONS FOLDED INTO PHASE 2

These come from earlier discussions and are now baked into the prompts:

1. **Material master = MATERIAL_MASTER_DESIGN_LOCK.md** — manufacturer-based identity, 7 material types, manufacturer catalog, brand-scoped values, 12 field types, conditional dependencies, category-configurable images. Zero hardcoding.

2. **Standard BOM, not parametric configurator** — fixed BOM per product/size. Custom sizes quote nearest bigger standard. Configurator deferred.

3. **BOM versioning with lock-at-production-start** — orders confirmed but not yet in production use the latest BOM version. Once production starts, that order's BOM version is frozen. Admin override possible with audit.

4. **Primary + alternate materials per BOM line** — customer/admin may substitute. Selection list resolves which alternate is used per order.

5. **Wastage % per BOM line, not flat** — boards may have 8-12% wastage, hardware 0%.

6. **Generic BOM (template) → Selection List → Resolved BOM** — generic BOM uses material *categories/types* for finish-dependent lines; selection list maps to specific SKUs per order; resolved BOM has actual material references.

7. **BOM purpose = estimation + PO source only** — flagged in schema. Not used for material issue (Phase 4 nesting drives that).

8. **Multi-level BOM supported** — products can have sub-assemblies (e.g., Executive Table has Drawer Unit + Pedestal as sub-assemblies).

9. **Outsourced process lines in BOM** — powder coating, glass cutting, MS laser cutting captured as job-work process lines with vendor and cost. Vendor master in Phase 3.

10. **Internal margin visibility restricted** — costing visible only to sales manager + director roles (RBAC from Phase 0).

---

## PART 4 — DATABASE SCHEMA (~32 tables)

All Phase 2 tables go in **two schemas**:
- `material` schema → material master (from design lock)
- `product_engineering` schema → process, BOM, selection list, costing

### A. Material Schema (~16 tables, per MATERIAL_MASTER_DESIGN_LOCK.md)

**material.categories** — 12 OutDo categories seeded
**material.material_types** — 7 types seeded (Raw, Semi-Finished, Finished, Packaging, Consumables, Spare Parts, MRO)
**material.category_type_profiles** — links category + type to attribute set
**material.attributes** — attribute definitions per profile
**material.attribute_values** — admin-managed dropdown values
**material.attribute_visibility_rules** — conditional display rules
**material.attribute_value_dependencies** — value filtering rules
**material.manufacturers** — Hettich, Ebco, Hafele, Action Tesa, "Regular Brand", etc.
**material.manufacturer_catalogs** — code→name per manufacturer (color, variant, design)
**material.catalog_import_batches** — Excel catalog upload tracking
**material.naming_formats** — format rules per category+type profile
**material.materials** — the actual materials (with attribute_hash for dedup)
**material.material_attribute_values** — selected values per material
**material.material_images** — multiple images per material
**material.category_image_rules** — required/optional/deferrable per category
**material.material_import_batches** + **material.material_import_errors**

### B. Product Engineering Schema (~16 tables)

**product_engineering.processes**
- id, process_code, process_name, process_category (cutting/edge_banding/drilling/lamination/sanding/assembly/finishing/outsource)
- standard_time_minutes, time_unit (per_panel/per_sheet/per_job)
- labor_cost_per_hour, machine_cost_per_hour
- is_outsourced (bool), default_outsource_vendor_notes
- station_id (FK, nullable — links to Phase 4 station when built)
- is_active, audit columns

**product_engineering.process_capabilities**
- id, process_id (FK), capability_key, capability_value
- For storing process-specific specs (e.g., max thickness for CNC, max sheet size for beam saw)

**product_engineering.boms**
- id, bom_code (auto-generated), product_id (FK to sales.products), product_size_variant_id (FK, nullable)
- bom_name (auto: product name + size), description
- bom_purpose (estimation_and_po — per addendum decision; informational)
- status (draft/active/superseded/archived)
- current_version (integer), is_locked_for_orders (bool)
- created_by, approved_by, approved_at
- audit columns, soft-delete

**product_engineering.bom_versions**
- id, bom_id (FK), version_number
- version_status (draft/approved/superseded)
- supersedes_version_id (FK, self-ref)
- revision_summary (what changed), approved_by, approved_at
- locked_at_production_start (timestamp when this version got locked into an order's production)
- audit columns

**product_engineering.bom_material_lines**
- id, bom_version_id (FK), line_sequence
- line_type (primary / alternate)
- alternate_group_id (groups primary with its alternates — same group_id = interchangeable)
- material_category_id (FK to material.categories, for generic template lines)
- material_type_id (FK to material.material_types, optional)
- specific_material_id (FK to material.materials, nullable — if generic template, null until selection list resolves)
- is_finish_dependent (bool — true means must be resolved via selection list before production)
- quantity_per_unit, uom_id (FK to core.uom_master)
- wastage_percent (per-line, default category-based)
- notes
- audit columns

**product_engineering.bom_process_lines**
- id, bom_version_id (FK), line_sequence
- process_id (FK to product_engineering.processes)
- quantity (e.g., 4 panels to drill), time_per_unit_minutes
- is_outsourced (bool — overrides process default), outsource_vendor_notes
- estimated_cost (computed)
- notes

**product_engineering.bom_subassemblies**
- id, parent_bom_version_id (FK), child_bom_id (FK to product_engineering.boms)
- quantity (e.g., 1 Drawer Unit per Executive Table)
- notes
- Supports multi-level BOM (parent BOM references child product's BOM)

**product_engineering.bom_change_log**
- id, bom_id (FK), version_id (FK), change_type (line_added/line_removed/line_modified/version_approved/version_superseded)
- changed_by, changed_at, change_details (jsonb)
- Per addendum: ensures BOM changes are auditable

**product_engineering.selection_lists**
- id, selection_list_code (auto-generated), order_id (FK to sales.orders)
- status (draft/submitted/approved/applied_to_bom)
- submitted_by_type (customer / sales_team / engineering)
- submitted_by_user_id, submitted_at, approved_by, approved_at
- finish_group_name (e.g., "Project ABC — Natural Oak theme")
- notes, audit columns

**product_engineering.selection_list_items**
- id, selection_list_id (FK), order_line_id (FK to sales.order_lines, nullable for project-wide selections)
- bom_material_line_id (FK to product_engineering.bom_material_lines)
- selected_material_id (FK to material.materials)
- alternate_chosen (bool — true if alternate, not primary)
- quantity_override (nullable), notes

**product_engineering.resolved_boms**
- id, order_id (FK), order_line_id (FK), bom_version_id (FK)
- selection_list_id (FK, nullable for orders without finish dependency)
- resolved_at, resolved_by
- total_theoretical_material_cost (Layer 1 cost)
- status (draft / approved / locked_for_production)

**product_engineering.resolved_bom_material_lines**
- id, resolved_bom_id (FK), bom_material_line_id (FK to template)
- material_id (FK to material.materials — actual specific SKU)
- quantity_required, uom_id
- wastage_percent_applied
- theoretical_quantity_with_wastage (computed)
- unit_cost_at_resolution (snapshot of cost at resolution time — Layer 1)
- line_cost

**product_engineering.resolved_bom_process_lines**
- id, resolved_bom_id (FK), bom_process_line_id (FK)
- process_id (FK), quantity, time_per_unit_minutes
- cost_per_unit_at_resolution
- line_cost
- is_outsourced, vendor_notes

**product_engineering.costing_runs**
- id, bom_version_id (FK), costing_run_number (auto)
- run_type (initial / re-cost / what-if)
- material_cost_total, labor_cost_total, overhead_cost_total, outsourcing_cost_total
- manufacturing_cost (sum of above)
- overhead_percent_applied, margin_percent_applied
- landing_cost, selling_price_excl_tax, tax_rate, mrp_incl_tax
- run_by, run_at, notes

**product_engineering.costing_assumptions**
- id, key (overhead_percent_default / margin_percent_default / labor_rate_default / etc.)
- value, valid_from, valid_until, audit columns
- Per-org costing defaults that costing_runs reference

**Total: ~32 tables across material and product_engineering schemas**

---

## PART 5 — THE 22 PROMPTS

### Setup before starting Phase 2

Before P2-01:
- Phase 0 must be complete and tested
- Phase 1 must be complete and tested
- Verify core.modules, core.numbering_series, core.audit_logs, core.documents accessible
- Verify sales.products and sales.product_size_variants populated (or at least functional)
- Have MATERIAL_MASTER_DESIGN_LOCK.md in /specs (Claude Code reads it)

---

### PROMPT P2-01 — Material Schema Foundation

```
Read MATERIAL_MASTER_DESIGN_LOCK.md (especially Part 3 — Database Schema) and PROMPTS_P2.md Part 4A.

Build the `material` schema with all ~16 tables exactly as specified in MATERIAL_MASTER_DESIGN_LOCK.md Part 3.

Implementation rules:
1. New `material` schema, all tables with @@schema("material")
2. Multi-schema support (we set this up in P0-02)
3. UUIDs for PKs
4. Standard audit columns (created_at, updated_at, created_by, updated_by)
5. Soft-delete on materials, manufacturers (others: hard delete OK)
6. Indexes on all FK columns
7. Indexes on: materials.attribute_hash (UNIQUE), materials.material_code (UNIQUE), materials.category_id, materials.material_type_id, materials.manufacturer_id, materials.is_active
8. Indexes on: manufacturer_catalogs (manufacturer_id, catalog_type, code) UNIQUE
9. Standard import-batch tracking pattern

Module registry entries (core.modules):
- material_master (core=true, bypassable=false)
- manufacturer_catalog (core=true, bypassable=false)

Numbering series (core.numbering_series):
- MAT (material code): format derived dynamically per category, but the underlying registry exists
- MNF_CAT (manufacturer catalog batch tracking)

System settings:
- MATERIAL_DEDUP_NORMALIZATION_ENABLED (default true)
- MATERIAL_CATEGORY_IMAGE_DEFAULT_BEHAVIOR (default 'optional')

DO NOT add any seed data yet — that comes in P2-02.

Generate Prisma migration. Run it. Verify all ~16 material-schema tables exist. Show \dt material.* output.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-01
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- All ~16 material-schema tables per MATERIAL_MASTER_DESIGN_LOCK.md
- Indexes, constraints, module registry, system settings

❌ OUT OF SCOPE:
- product_engineering schema → P2-09
- Seed data → P2-02
- API logic → P2-03 onwards
- Vendor rate contracts → Phase 3
- Inventory tables → Phase 3

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Schema-only prompt. APIs and seed data come in later prompts. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-01] Material schema with 16 tables per design lock`

---

### PROMPT P2-02 — Material Master Seed Data

```
Read MATERIAL_MASTER_DESIGN_LOCK.md (Part 5 — 12 Categories) and PROMPTS_P2.md.

Load the OutDo seed data into material schema. ALL DATA HERE IS SEED — admin can edit through UI later.

1. Categories (12) — load from MATERIAL_MASTER_DESIGN_LOCK.md Part 5:
   - Boards & Panels, Laminates, Edge Banding, Hardware & Fittings, Metal Components, Seating, Fabric & Upholstery, Adhesives & Chemicals, Tools & Consumables, Raw Steel & Metal, Packing Materials, Gas Springs & Mechanisms

2. Material types (7):
   - RAW, SEMI_FINISHED, FINISHED, PACKAGING, CONSUMABLES, SPARE_PARTS, MRO

3. Category-type profiles — for each valid (category, type) combination, create a profile:
   - (Boards & Panels, RAW) — minimal profile
   - (Boards & Panels, SEMI_FINISHED) — full profile with color/code
   - (Hardware & Fittings, RAW or appropriate type)
   - (Seating, FINISHED) — chair profile
   - (Packing Materials, PACKAGING)
   - ... etc per OutDo data
   - Create profiles only for combinations that actually exist in your operation

4. Attributes per profile — per MATERIAL_MASTER_DESIGN_LOCK.md Part 5:
   For each profile, define attributes with:
     - attribute_code, label, field_type (from 12 types)
     - is_required, is_identity, feeds_name, feeds_sku
     - name_position, sku_position
     - is_manufacturer_scoped
   Examples from design lock Part 5:
     - Boards Raw: Board Type, Manufacturer, Thickness, Sheet Size (all identity)
     - Boards Semi-Finished: + Color Code (mfr-scoped), Color Name (auto_fill), Surface Finish
     - Edge Banding: Material, Manufacturer, Color Code (mfr-scoped), Color Name (auto-fill), Width, Thickness, Finish
     - Hardware: Hardware Type, Manufacturer, Quality Variant (mfr-scoped), Sub-Type (dependent), Size/Length (dependent), Opening Angle (Hinge only), Crank Type (Hinge only), Material, Finish

5. Attribute values — load OutDo data:
   - Board Type: PLPB, MDF, HDMR, Plywood, Raw Particle Board
   - Thickness: 4, 6, 7.30, 8, 9, 16, 17, 18, 25 (mm)
   - Surface Finish: BSL, DSL, OSL, RAW, Pre-Laminated
   - Sheet Sizes: 8x4 (2440x1220), 8x6 (2440x1830)
   - Hardware Type: Hinge, Drawer Slide, Telescopic Channel, Lock, Knob, Screw, Leveler, Slim Box, Sliding Door System, D-Nut, Drywall Screw
   - Crank Type: 0-Crank, 8-Crank, 16-Crank
   - Opening Angle: 110, 155, 170 (degrees)
   - Laminate Finish: SF, RH, VR, FT, MG, HG, Matte
   - Laminate Thickness: 0.8, 1.0, 1.5 (mm)
   - Edge Banding Material: PVC, ABS
   - Edge Banding Widths: 22, 23, 30, 45 (mm)
   - Edge Banding Thicknesses: 0.40, 0.80, 1.00, 1.30, 1.50, 2.00 (mm)
   - Edge Banding Finish: SHGL, HGLL, ML, NL, MATT, TOL
   ... and so on for all 12 categories. Use the OutDo blueprint as exhaustive seed source.

6. Conditional visibility rules:
   - Crank Type visible only when Hardware Type = Hinge
   - Opening Angle visible only when Hardware Type = Hinge
   - Sub-Type values filtered by Hardware Type (Hinge → soft_close/clip_on/etc.; Slide → ball_bearing/undermount/etc.)
   - Color Code visible only when material_type = SEMI_FINISHED (for boards)

7. Manufacturers (initial seed):
   - Hettich, Ebco, Hafele (hinges/slides — manufacturer brands)
   - Action Tesa, Greenply, Century, Merino, Greenlam, Royale Touche (board/laminate brands)
   - Godrej, Ipsa (hardware)
   - Solitaire (chairs)
   - Regular Brand (the catch-all for unbranded materials)
   - More can be added via UI later

8. Format rules per profile:
   - Boards RAW: name = "{Thickness} {Board Type} {Manufacturer} {Sheet Size}", SKU = "BRD-{Board Type code}-{Thickness code}-{Sheet Size code}"
   - Boards SEMI-FINISHED: name = "{Thickness} {Surface} {Board Type} {Color Name} {Manufacturer} {Sheet Size}", SKU = "BRD-{Board Type code}-{Mfr code}-{Color code}-{Thickness code}-{Surface code}-{Sheet Size code}"
   - Hardware Hinge: name = "Hinge - {Manufacturer} {Variant} - {Sub-Type} - {Angle}° - {Crank}", SKU = "HDW-HNG-{Mfr code}-{Variant code}-{Sub-Type code}-{Angle}-{Crank code}"
   - Define for all profiles

9. UOM master entries (in core.uom_master from P0-04):
   - NOS (Numbers), MTR (Meter), KG (Kilogram), SET, PR (Pair), BOX, PKT (Packet), LTR (Liter), SQM (Sq.Meter), SQF (Sq.Feet), PCS (Pieces), ROLL, RM (Running Meter), SHT (Sheet)

10. Category image rules:
    - Boards, Laminates, Edge Banding, Fabric, Seating → REQUIRED
    - Hardware, Adhesives, Tools, Raw Steel, Packing, MRO → OPTIONAL

CRITICAL: Load all seed via Prisma seed scripts or DB migration with INSERT statements. After this prompt, the schema has working seed data — admin can add/edit through UI in later prompts.

Verify by querying:
- SELECT COUNT(*) FROM material.categories → should be 12
- SELECT COUNT(*) FROM material.material_types → should be 7
- SELECT COUNT(*) FROM material.category_type_profiles → varies
- SELECT COUNT(*) FROM material.attributes → many
- SELECT COUNT(*) FROM material.attribute_values → many

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-02
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- All OutDo seed data per design lock
- Categories, types, profiles, attributes, values, manufacturers, format rules
- UOM and image rules

❌ OUT OF SCOPE:
- API endpoints → later prompts
- Admin UI → P2-07
- Actual materials (the records users create) → users create them via UI

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Seed only. APIs and UI come next. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-02] Material master seed data: categories, types, profiles, attributes, values, manufacturers`

---

### PROMPT P2-03 — Material Master CRUD with Auto-Generation

```
Read MATERIAL_MASTER_DESIGN_LOCK.md (Parts 6, 7, 13) and PROMPTS_P2.md.

Build the core material creation/management APIs implementing:
- Auto-generated name and SKU from identity attributes
- Attribute hash for duplicate detection
- Manufacturer-scoped value resolution
- Conditional attribute handling

1. Material lookup APIs (used by form):
   - GET /api/material/categories
   - GET /api/material/material-types
   - GET /api/material/category-type-profiles?category_id=&material_type_id=
   - GET /api/material/attributes?profile_id= (returns attributes with field_type, required, identity flags, positions, manufacturer-scoped flag)
   - GET /api/material/attribute-values?attribute_id=&manufacturer_id= (manufacturer-scoped values filtered if manufacturer specified)
   - GET /api/material/visibility-rules?profile_id=
   - GET /api/material/value-dependencies?profile_id=
   - GET /api/material/manufacturers?category_id= (optional filter to manufacturers relevant for a category)
   - GET /api/material/manufacturer-catalog?manufacturer_id=&catalog_type=&code= (for auto-fill)

2. Material creation:
   - POST /api/material/materials
     Input: category_id, material_type_id, attribute_values (array of {attribute_id, attribute_value_id OR raw_value}), purchase_uom_id, consumption_uom_id, conversion_factor, min_stock_level, reorder_level, max_stock_level, primary_image (if required by category), notes
   
   Logic flow:
   a. Validate category + material_type → category_type_profile exists
   b. Validate all required attributes provided
   c. Apply normalization to typed fields (trim, uppercase for codes, strip special chars)
   d. Resolve manufacturer-scoped values (validate value belongs to selected manufacturer)
   e. Check conditional visibility rules — required attributes hidden by conditions are not required
   f. Check value dependencies — selected values must be allowed by parent attribute
   g. Build attribute_hash from identity attributes (ordered, normalized)
   h. Check material.materials for existing attribute_hash → if found, return DUPLICATE_FOUND with existing material_id
   i. Apply naming_formats to generate material_name and material_code (SKU)
   j. Check material_code uniqueness (sanity check — should never collide if hash logic is right)
   k. Check image requirement per category
   l. Create material + material_attribute_values rows
   m. If image provided, create material_images entry
   n. Return created material with name and code
   
3. Material update:
   - PUT /api/material/materials/:id
     Limited fields editable post-creation: notes, min/reorder/max stock, additional images
     Identity attributes are LOCKED after creation (changing them would change identity → that's a new material, not an edit)
     UoM and conversion factor: admin-only edit with audit
   
4. Material delete:
   - DELETE /api/material/materials/:id (soft)
     Block if material is used in any BOM (check product_engineering.bom_material_lines)
     Block if material has stock (Phase 3 check, skip for now)

5. Material query:
   - GET /api/material/materials?category=&material_type=&manufacturer=&search=&is_active=&page=&limit=
   - GET /api/material/materials/:id (full detail with all attribute values, images)
   - GET /api/material/materials/:id/where-used (which BOMs reference this material)

6. Duplicate-check helper:
   - POST /api/material/materials/check-duplicate
     Input: same as create, but doesn't actually create
     Returns: { duplicate_found: bool, existing_material_id, existing_material_code, existing_material_name, similar_materials: [...] }
     Used by frontend for live validation as user fills the form

7. Live name/code preview helper:
   - POST /api/material/materials/preview-name-and-code
     Input: same as create
     Returns: { material_name, material_code }
     Used by frontend to show live preview as user fills attributes

Important implementation notes:
- attribute_hash MUST be deterministic: sort identity attributes by position, concatenate normalized values, hash with SHA-256
- Normalization: lowercase trim for text_autocomplete fields; for free text, additionally strip special chars except hyphens; numbers/dimensions normalized to standard format
- Auto-fill type: when an attribute is auto_fill, the value is computed from another attribute's selection via manufacturer_catalogs lookup, NOT supplied by user

Tests:
- Create material with all required attributes → success, name/code generated
- Create same material again → DUPLICATE_FOUND with existing reference
- Create material missing required attribute → validation error
- Create with manufacturer-scoped value belonging to different manufacturer → validation error
- Update non-identity field → success
- Attempt to update identity attribute → blocked
- Delete material with no BOM usage → success
- Attempt delete material used in BOM → blocked
- Live preview returns correct name/code
- Duplicate check finds exact and similar matches

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-03
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Material CRUD with full auto-generation + dedup
- Lookup APIs for form
- Live preview and duplicate check

❌ OUT OF SCOPE:
- Manufacturer catalog management → P2-04
- Material images deeper management → P2-05
- Admin UI → P2-07
- CSV import → P2-06
- BOM-related anything → P2-09 onwards

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Catalog/images/UI come in later prompts. Continue with core CRUD?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-03] Material master CRUD with auto-gen name/SKU and dedup by attribute hash`

---

### PROMPT P2-04 — Manufacturer Catalog Management

```
Read MATERIAL_MASTER_DESIGN_LOCK.md (Part 8) and PROMPTS_P2.md.

Build the manufacturer catalog master that drives auto-fill.

1. Catalog management APIs:
   - GET /api/material/manufacturer-catalogs?manufacturer_id=&catalog_type=&search=&page=&limit=
   - POST /api/material/manufacturer-catalogs (manual entry)
     Input: manufacturer_id, catalog_type, code, name, additional_attributes (jsonb for variant catalogs), reference_image_path
   - PUT /api/material/manufacturer-catalogs/:id
   - DELETE /api/material/manufacturer-catalogs/:id (soft; block if any material currently references this entry)
   - GET /api/material/manufacturer-catalogs/:id

2. Excel import:
   - GET /api/material/manufacturer-catalogs/import-template?catalog_type=color
     Returns downloadable Excel with proper headers and example rows per catalog type
   - POST /api/material/manufacturer-catalogs/import
     Input: manufacturer_id, catalog_type, file (multipart)
     Validates per row, creates catalog entries
     Returns batch_id, summary, error_log_url

3. Catalog types supported:
   - color (board/edge-banding color codes — manufacturer's hex+name+code)
   - variant (hardware quality variants like Hettich Onsys/Sensys)
   - design (laminate design codes)
   - Extensible: admin can add new catalog types via system settings

4. Auto-fill lookup (used by material creation):
   - GET /api/material/manufacturer-catalogs/lookup
     Input: manufacturer_id, catalog_type, code
     Returns: name, additional_attributes, reference_image_path
     Used by P2-03's auto_fill attribute type

5. Catalog search:
   - GET /api/material/manufacturer-catalogs/search?manufacturer_id=&q=
     Fuzzy search across code and name
     For autocomplete UI

6. Bulk operations:
   - POST /api/material/manufacturer-catalogs/bulk-deactivate (mark catalog entries inactive when manufacturer discontinues a color)
   - POST /api/material/manufacturer-catalogs/merge (admin tool to merge accidentally-duplicated entries)

7. Per-manufacturer view:
   - GET /api/material/manufacturers/:id/catalog?catalog_type=
     Shows all catalog entries for one manufacturer
     Grouped by catalog_type

Excel template structure (for color catalog):
| Manufacturer Code | Display Name | Variant/Quality (optional) | Hex Color (optional) | Reference Image URL (optional) | Notes (optional) |

For variant catalog:
| Manufacturer Code | Variant Name | Sub-Variant (optional) | Notes |

For design catalog:
| Manufacturer Code | Design Name | Pattern Type (optional) | Color Family (optional) | Notes |

Validation on import:
- Required fields present
- Manufacturer Code unique within (manufacturer_id, catalog_type)
- Reference image URL valid format (if provided)
- Hex color valid format (if provided)

Tests:
- Manual catalog entry creation, update, delete
- Excel template download
- Excel import: valid file, file with errors, file with duplicates
- Auto-fill lookup returns correct name/image
- Manufacturer view shows all their catalog entries
- Bulk deactivate works
- Cannot delete catalog entry referenced by active materials

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-04
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Manufacturer catalog CRUD
- Excel import with template download
- Auto-fill lookup
- Bulk operations

❌ OUT OF SCOPE:
- Catalog approval workflow (admin direct creation is fine)
- AI-based catalog extraction from PDFs → Out of scope
- Public catalog browsing (it's internal data)

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Catalog approval/AI extraction out of scope. Continue with admin-managed catalog?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-04] Manufacturer catalog master with Excel import and auto-fill lookup`

---

### PROMPT P2-05 — Material Images Management

```
Read MATERIAL_MASTER_DESIGN_LOCK.md (Part 9) and PROMPTS_P2.md.

Build comprehensive image management for materials.

1. Image upload APIs:
   - POST /api/material/materials/:id/images (multipart, multiple files)
     Input: file(s), image_type (swatch/full/closeup/application/technical), is_primary
     Validates: file type (jpg/jpeg/png/webp), max size 10MB per file
     Stored via core.documents
     Returns created material_images entries
   - PUT /api/material/material-images/:id (update image_type, is_primary, display_order)
   - DELETE /api/material/material-images/:id
     If is_primary: auto-promote next image to primary
     Block delete if it's the only image and category requires image
   - POST /api/material/material-images/:id/set-primary (atomic — unsets others, sets this one)

2. Category image rules:
   - GET /api/admin/material/category-image-rules
   - PUT /api/admin/material/category-image-rules/:id
     Input: image_requirement (required / optional / required_deferrable)

3. Pending-image queue:
   - GET /api/material/materials?has_pending_image=true
     For categories with required_deferrable, materials can be created with has_pending_image=true and someone adds images later
     This endpoint lists materials waiting for images
   - POST /api/material/materials/:id/clear-pending-image-flag
     Called when first image is added to a material that was deferred

4. Image gallery for visual selection (used by BOM/Selection List later):
   - GET /api/material/materials/:id/images?type=swatch
     Returns swatch images for visual selection UI

5. Bulk image upload:
   - POST /api/material/materials/bulk-images
     Useful when adding photos of many materials at once
     Input: zip file of images + mapping CSV (material_code → filename)
     Background job processes and assigns

6. Image transformation:
   - Auto-generate thumbnails (256×256) for swatch type
   - Auto-generate medium size (800×800) for application/closeup types
   - Original retained
   - Use sharp library or equivalent

7. Image validation:
   - File format whitelist (jpg, jpeg, png, webp)
   - Max dimensions check (reject huge images >10000×10000)
   - Optional: NSFW filter (skip for now, can add later)

Tests:
- Upload single image
- Upload multiple images
- Set primary
- Delete primary (auto-promote)
- Delete only image when category requires (blocked unless deferrable)
- Pending-image queue
- Bulk upload via zip + CSV
- Thumbnail generation

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-05
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Image CRUD per material
- Category image rules
- Pending queue
- Bulk upload
- Thumbnail generation

❌ OUT OF SCOPE:
- Customer-facing visual finish selector → Phase 6 (selection list) / Phase 7 (portal)
- AI image tagging → Out of scope
- Image-based search → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Visual selectors come in Phase 6/7. Continue with image management?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-05] Material images with category rules, bulk upload, and thumbnails`

---

### PROMPT P2-06 — Material CSV Import

```
Read MATERIAL_MASTER_DESIGN_LOCK.md and PROMPTS_P2.md.

Build robust CSV import for bulk material creation.

1. Template generation:
   - GET /api/material/materials/import-template?category_id=&material_type_id=
     Returns Excel/CSV template appropriate to the chosen category+type profile
     Columns dynamically generated based on the profile's attributes
     Includes: required indicator, format examples, value list for dropdown attributes (as a separate sheet "Allowed Values")

2. Import process:
   - POST /api/material/materials/import
     Input: category_id, material_type_id, file (multipart)
     Validates each row:
       - Required attributes present
       - Dropdown values exist in attribute_values (auto-resolved by label or code)
       - Manufacturer-scoped values valid for selected manufacturer
       - Conditional attributes consistent with their dependencies
     For each valid row:
       - Compute attribute_hash
       - Check for duplicates (block or skip per import setting)
       - Generate name and SKU
       - Create material
     For invalid rows: log error to material_import_errors
     Returns batch_id for tracking

3. Import settings (per batch):
   - On_duplicate: skip / fail / update_existing (admin choice)
   - Auto_add_missing_attribute_values: false (default — admin must add new dropdown values first)
   - Auto_add_manufacturer_catalog_entries: false (default — admin must populate catalog first)
   - Generate_images_placeholder: true (creates pending-image flag if category requires images)

4. Import error resolution:
   - GET /api/material/import-batches/:id/errors
   - PATCH /api/material/import-batches/:id/errors/:error_id (inline correct)
   - POST /api/material/import-batches/:id/retry-errors
   - Export errored rows to corrected CSV for offline fixing

5. Multi-category bulk import:
   - For very large initial loads (whole catalog), allow multi-sheet Excel where each sheet is a category
   - Background processing with progress tracking
   - Email notification on completion

6. Catalog code resolution:
   - Importing semi-finished boards requires manufacturer catalog entries to exist (for color code → name auto-fill)
   - Import either:
     a. Fails rows where catalog entry missing (default)
     b. Auto-creates catalog entries if setting enabled (admin only)

Tests:
- Template download for each category+type
- Import valid file
- Import with various error types
- Resolve errors and re-import
- Duplicate detection during import
- Multi-sheet import

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-06
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Material CSV/Excel import with template
- Error handling and resolution
- Bulk multi-category import

❌ OUT OF SCOPE:
- Importing from competitor ERPs (no specific mappings) → Future
- API-based sync with other systems → Out of scope unless added

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Continue with CSV import scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-06] Material CSV import with dynamic templates and error resolution`

---

### PROMPT P2-07 — Material Master Admin UI

```
Read MATERIAL_MASTER_DESIGN_LOCK.md (Part 12 — Admin Screens), PROMPTS_P2.md, and /mnt/skills/public/frontend-design/SKILL.md.

Build the four admin management screens from the design lock.

This is the largest UI prompt in Phase 2. Build incrementally.

1. SCREEN 1 — Category & Profile Manager (/admin/material/categories):
   - Tab 1: Categories
     - List with: code, name, description, image rule, active materials count
     - Create/edit modal
     - Image rule setter (required/optional/deferrable)
   - Tab 2: Material Types
     - List with code, name, description
     - Create/edit (system types are read-only)
   - Tab 3: Category-Type Profiles
     - Matrix view: rows = categories, columns = types, cell = profile_id (exists/empty)
     - Create profile: select category + type → opens attribute editor (Screen 2)

2. SCREEN 2 — Attribute Manager (/admin/material/attributes):
   - URL: /admin/material/profiles/:profile_id/attributes
   - List of attributes for this profile with: code, label, field_type, required, identity, name pos, sku pos, manufacturer-scoped flag
   - Add attribute modal:
     - Pick field_type from 12 options
     - Set identity, required, feeds_name, feeds_sku
     - Set positions (name and SKU)
     - For manufacturer-scoped: toggle flag (values will need manufacturer association in Screen 3)
   - Edit/delete/reorder attributes
   - Conditional visibility rules section:
     - List rules: "Attribute X visible when Attribute Y = value Z"
     - Add/edit/delete rules
   - Value dependencies section:
     - List dependencies: "Attribute X values filtered by Attribute Y"
     - Add filter maps via JSON editor or guided UI
   - Clone profile button: copy attributes from another profile as starting point

3. SCREEN 3 — Value & Catalog Manager (/admin/material/values):
   - Tab 1: Attribute Values
     - Pick attribute from dropdown
     - List values with label, short code, display order, image (if image-type)
     - Add/edit/reorder/delete
     - Bulk import via CSV
     - Merge duplicates tool (select 2+, merge into one — all materials referencing old IDs get updated)
   - Tab 2: Manufacturer Catalog
     - Pick manufacturer
     - List catalog entries by catalog_type
     - Add/edit/delete
     - Bulk Excel import (uses P2-04 endpoints)
     - Search across all manufacturers' catalogs (for finding which mfr a color belongs to)
   - Tab 3: Manufacturers Master
     - CRUD for manufacturers
     - Cannot delete manufacturer used in any catalog or material

4. SCREEN 4 — Format Builder (/admin/material/formats):
   - Pick profile from dropdown
   - Drag-drop visual builder:
     - Left panel: available attributes (those with feeds_name or feeds_sku flag)
     - Right panel: format builder for Name and SKU
     - Drag attribute into position; reorder
     - Set separators between positions
   - Live preview with sample values (uses fake data matching attribute types)
   - Save format
   - "Regenerate all materials" button (with confirmation):
     - When format changes, optionally regenerate all material codes and names
     - Background job, audit logged
     - Affected counts shown before confirmation

5. Material list (/admin/material/materials):
   - DataTable with filters: category, material_type, manufacturer, status, has_pending_image, search
   - Columns: code, name, category, type, manufacturer, primary image thumbnail, status, stock (if Phase 3), updated_at
   - Bulk actions: deactivate, export
   - Quick filters: "Pending Images", "Recently Added", "Most Used in BOMs"

6. Material detail/create (/admin/material/materials/:id):
   - Step 1 — Classification (category + type) → loads profile
   - Step 2 — Attributes (dynamic form rendering based on profile, with live name/SKU preview)
   - Step 3 — UOM & Stock (purchase UOM, consumption UOM, conversion factor, stock levels)
   - Step 4 — Images (drag-drop upload, set primary, defer if category allows)
   - Step 5 — Review & Save (shows generated name, code, all selections; duplicate check displayed)
   - Edit mode: identity attributes locked, only non-identity editable

7. Where-used view per material:
   - Tab on material detail: "Used In" → lists BOMs that reference this material

Mobile considerations:
   - Material viewing OK on mobile
   - Material creation form not optimized for mobile (admin task, use desktop)
   - Image upload from mobile (photographing materials in stock) is well supported

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-07
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- All four admin management screens
- Material list and detail UI
- Live name/SKU preview, duplicate check display

❌ OUT OF SCOPE:
- Customer-facing material/finish selector → Phase 6 / Phase 7
- BOM UI → P2-12
- Selection list UI → P2-14
- Inventory views → Phase 3

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Phase 6/7 build customer selection. This is admin material master. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-07] Material master admin UI with 4 management screens and dynamic material form`

---

### PROMPT P2-08 — Material Master Integration Tests

```
End-to-end validation of material master before moving to BOM.

Run these scenarios:

SCENARIO A — Manufacturer catalog setup:
- Admin creates "Hettich" manufacturer
- Admin uploads Hettich color catalog Excel (50 entries)
- Verify all loaded, accessible via lookup API
- Repeat for "Action Tesa" board catalog

SCENARIO B — Material creation, full happy path:
- Admin opens material creation
- Selects "Boards & Panels" + "SEMI_FINISHED"
- Picks Action Tesa as manufacturer
- Picks color code 1103 → name auto-fills "Frosty White"
- Selects 18mm thickness, BSL surface, 8x4 sheet size
- Live preview shows: name "18mm BSL PLPB Frosty White Action Tesa 8x4", code "BRD-PLPB-AT-1103-18-BSL-84"
- No duplicate found
- Uploads swatch image
- Saves → material created

SCENARIO C — Duplicate prevention:
- Admin tries to create same material again
- System detects duplicate via attribute_hash
- Returns existing material reference
- Admin views existing instead

SCENARIO D — Conditional attributes (hinge):
- Admin creates Hardware material
- Selects Hardware Type = "Hinge"
- Crank Type and Opening Angle become visible (they were hidden before)
- Sub-Type values filter to hinge sub-types (soft_close, clip_on, etc.)
- Picks Hettich + Sensys variant
- Crank = 0-Crank, Angle = 110°, Sub-Type = soft_close
- SKU generated: HDW-HNG-HET-SENSYS-SC-110-0CR

SCENARIO E — Cross-manufacturer code reuse:
- Two different manufacturers both have catalog code "1103"
- Create material X with Mfr A + code 1103 → "Frosty White" (Mfr A)
- Create material Y with Mfr B + code 1103 → "White Wave" (Mfr B)
- Both created successfully (different attribute_hash because manufacturer differs)
- Codes differ: BRD-...-MFRA-1103-... vs BRD-...-MFRB-1103-...

SCENARIO F — Image deferral:
- Create material in category with "required_deferrable" image rule
- Save without image → has_pending_image=true
- Material appears in pending-image queue
- Admin uploads image later → flag cleared

SCENARIO G — CSV import:
- Download template for Boards SEMI-FINISHED
- Fill with 20 board variants
- Import → 18 succeed, 2 fail (one has unknown color code, one has invalid thickness)
- View errors, correct, re-import

SCENARIO H — Format change & regeneration:
- Change Boards SEMI-FINISHED SKU format to put Manufacturer earlier
- "Regenerate all materials" confirmed
- All existing semi-finished boards get new SKUs (old SKU as previous_code for audit)
- Verify name and code consistency

SCENARIO I — Type B field normalization (laminate design code):
- Create laminate with design code "  14177  " (with spaces)
- Create another with " 14177" → DETECTED AS DUPLICATE after normalization
- Create another with "lam-14177" → also detected (after special-char strip)

SCENARIO J — Where-used:
- Material X has no BOM references yet → where-used empty
- (After P2-09+ we'll have BOM linkage; for now just verify endpoint returns empty)

Validation checklist:
- [ ] All 16 material-schema tables functional
- [ ] All 12 categories, 7 types, profiles seeded
- [ ] Attribute system works with all 12 field types
- [ ] Conditional visibility rules functional
- [ ] Value dependency filtering functional
- [ ] Manufacturer-scoped values filter correctly
- [ ] Manufacturer catalog import (Excel) works
- [ ] Auto-fill from catalog works
- [ ] Auto-generated name and SKU match identity attributes exactly
- [ ] Duplicate detection via attribute_hash works (with normalization)
- [ ] Category image rules enforced
- [ ] Pending-image flag and queue work
- [ ] CSV bulk import with error resolution
- [ ] Format change and regeneration work
- [ ] All four admin screens functional
- [ ] RBAC: only material_master.* permissions can manage; sales roles can view
- [ ] Audit logging on all material/catalog changes

Documentation:
- Generate material master module README

Commit only when all scenarios pass. Fix issues with [P2-08-FIX] commits before P2-09.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-08
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Material master integration testing
- Validation of design lock implementation

❌ OUT OF SCOPE:
- BOM testing → P2-22 (final P2 integration tests)

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"BOM tests come in P2-22. Continue with material master validation?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-08] Material master integration tests and design lock validation`

---

### PROMPT P2-09 — Product Engineering Schema (Processes, BOM, Selection, Costing)

```
Read PROMPTS_P2.md Part 4B for context.

Build the product_engineering schema with all ~16 tables.

Tables to create (per Part 4B):
- product_engineering.processes
- product_engineering.process_capabilities
- product_engineering.boms
- product_engineering.bom_versions
- product_engineering.bom_material_lines (with alternate_group_id for primary+alternates)
- product_engineering.bom_process_lines
- product_engineering.bom_subassemblies
- product_engineering.bom_change_log
- product_engineering.selection_lists
- product_engineering.selection_list_items
- product_engineering.resolved_boms
- product_engineering.resolved_bom_material_lines
- product_engineering.resolved_bom_process_lines
- product_engineering.costing_runs
- product_engineering.costing_assumptions

Implementation rules:
1. New `product_engineering` schema
2. All standard audit columns
3. Soft-delete on boms, bom_versions, selection_lists, resolved_boms
4. Indexes on FKs and filter fields
5. Unique constraints:
   - boms.bom_code unique
   - bom_versions composite unique (bom_id, version_number)
   - selection_lists.selection_list_code unique
   - resolved_boms composite unique (order_id, order_line_id, bom_version_id)
6. Cross-schema FKs:
   - boms → sales.products
   - bom_material_lines → material.materials (and material.categories, material.material_types for generic template lines)
   - bom_process_lines → product_engineering.processes
   - selection_lists → sales.orders
   - resolved_boms → sales.orders, sales.order_lines

Module registry:
- process_master (core=true, bypassable=false)
- bom_management (core=true, bypassable=false)
- selection_list (core=false, bypassable=true — when bypassed, BOMs are used directly without finish resolution; risky but supported)
- costing (core=true, bypassable=false)

Numbering series:
- BOM (BOM code): BOM-{PRODUCT_CODE}-{NNNN}
- SL (selection list): SL-YYYY-NNNN
- COST (costing run): COST-YYYY-NNNN

System settings:
- BOM_LOCK_AT_PRODUCTION_START (default true — per addendum decision)
- BOM_ALWAYS_LATEST_OVERRIDE_ROLE (default null — only super_admin can force latest)
- COSTING_OVERHEAD_DEFAULT_PERCENT (default 15.0)
- COSTING_MARGIN_DEFAULT_PERCENT (default 30.0)
- COSTING_LABOR_RATE_DEFAULT_PER_HOUR (default 150 INR)

Costing assumptions seed:
- overhead_percent_default = 15.0
- margin_percent_default = 30.0
- labor_rate_default_per_hour = 150
- (Admin adjusts per company reality)

Generate Prisma migration. Run. Verify all ~16 product_engineering tables.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-09
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- product_engineering schema (~16 tables)
- Numbering series, module registry, system settings
- Initial costing assumptions seed

❌ OUT OF SCOPE:
- Process/BOM APIs → P2-10 onwards
- Nesting (Layer 2) → Phase 4
- Actual costing logic → P2-15

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Schema only. APIs come next. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-09] Product engineering schema with BOM, selection list, resolved BOM, costing tables`

---

### PROMPT P2-10 — Process Master APIs

```
Build process master management.

1. Process CRUD:
   - POST /api/processes
     Input: process_code, process_name, process_category (cutting/edge_banding/drilling/lamination/sanding/assembly/finishing/outsource), standard_time_minutes, time_unit, labor_cost_per_hour, machine_cost_per_hour, is_outsourced, default_outsource_vendor_notes, station_id (nullable)
   - GET /api/processes?category=&is_outsourced=&search=
   - GET /api/processes/:id (with capabilities)
   - PUT /api/processes/:id
   - DELETE /api/processes/:id (soft; block if used in any BOM)

2. Process capabilities:
   - POST /api/processes/:id/capabilities (add capability spec)
     Input: capability_key (e.g., "max_thickness_mm"), capability_value
   - PUT /api/processes/:id/capabilities/:cap_id
   - DELETE /api/processes/:id/capabilities/:cap_id

3. Seed standard processes:
   - Beam Saw Cutting (per_sheet, 5 min/sheet)
   - Pressing & Lamination (per_sheet, 10 min/sheet)
   - Edge Banding (per_panel_edge, 2 min/edge)
   - CNC Drilling — Rover Gold (per_panel, 8 min/panel)
   - CNC Drilling — 6-Side (per_panel, 5 min/panel)
   - Sanding & Cleaning (per_panel, 3 min/panel)
   - Assembly — Standard (per_unit, 30 min/unit)
   - Assembly — Complex (per_unit, 60 min/unit)
   - Powder Coating (OUTSOURCED, per_kg, vendor_notes "External vendor")
   - Glass Cutting (OUTSOURCED, per_piece, vendor_notes "External vendor")
   - MS Sheet Laser Cutting (OUTSOURCED, per_part, vendor_notes "External vendor")
   - MS Pipe Cutting (per_piece, 1 min/piece)
   - Punching (per_piece, 0.5 min/piece)
   - Welding (per_joint, 3 min/joint)
   - Nut Insert (per_piece, 0.5 min/piece)
   - Aluminium Panel Cutting (per_piece, 2 min/piece)
   - (Adjust per your factory's actual processes)

4. Process linkage to Phase 4:
   - station_id column on processes (FK to Phase 4 stations) is nullable now
   - Phase 4 will populate when stations are built
   - Process is a "definition"; station is a "physical location where process happens"

5. Process cost calculation helper:
   - GET /api/processes/:id/calculate-cost?quantity=&time_minutes=
     Returns cost breakdown (labor + machine)
     Used by costing engine later

6. Outsource process handling:
   - is_outsourced flag
   - For outsourced processes, "cost" is just an estimate (actual cost comes from vendor invoice in Phase 3)
   - Default vendor notes captured for reference (full vendor linkage in Phase 3)

7. Process import:
   - CSV import for bulk process setup

Tests:
- CRUD all process types
- Capability management
- Outsourced process flag affects cost calculation
- Cannot delete process used in active BOMs

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-10
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Process master CRUD
- Capabilities
- Standard seed processes
- Cost calculation helper

❌ OUT OF SCOPE:
- Actual time/cost tracking → Phase 4
- Job-work vendor master → Phase 3 (process points to "vendor_notes" until then)
- Machine utilization → Phase 4 / Phase 8

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Tracking and vendor master in later phases. Continue with definition only?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-10] Process master with definitions, capabilities, and standard seed`

---

### PROMPT P2-11 — BOM Core (CRUD with Versioning)

```
Read PROMPTS_P2.md and PHASES_2345_ADDENDUM_MATERIAL_PLANNING.md (for BOM purpose flag context).

Build BOM creation and management with versioning.

1. BOM creation:
   - POST /api/boms
     Input: product_id (FK to sales.products), product_size_variant_id (optional), description
     Auto-creates: bom_code (e.g., BOM-PROD-EXEC-001), first bom_versions row (v1, status=draft)
     Returns: bom_id, bom_version_id
   - GET /api/boms?product_id=&status=&search=
   - GET /api/boms/:id (with current version, all versions, lines)
   - PUT /api/boms/:id (header edits — name, description)
   - DELETE /api/boms/:id (soft; block if linked to confirmed orders)

2. BOM version management:
   - POST /api/boms/:id/versions/new
     Creates new version by copying current's lines (status=draft)
     Old version → superseded
     Returns: new version_id
   - GET /api/boms/:id/versions
   - GET /api/boms/:id/versions/:version_id (full detail)
   - POST /api/boms/:id/versions/:version_id/approve (status: draft → active)
   - GET /api/boms/:id/versions/:version_id/compare?with_version=v2 (diff view)

3. BOM material lines:
   - POST /api/boms/:id/versions/:version_id/material-lines
     Input options:
       generic_template: material_category_id (FK), material_type_id (optional), quantity, uom_id, wastage_percent, notes, alternate_group_id (optional — for adding to existing alternate group)
       specific_material: specific_material_id (FK), quantity, uom_id, wastage_percent, notes
       
   - PUT /api/boms/:id/versions/:version_id/material-lines/:line_id
   - DELETE /api/boms/:id/versions/:version_id/material-lines/:line_id
   - POST /api/boms/:id/versions/:version_id/material-lines/:line_id/add-alternate
     Adds alternate material to same alternate_group_id as the primary line
   - Validation: cannot edit lines of non-draft version

4. BOM process lines:
   - POST /api/boms/:id/versions/:version_id/process-lines
     Input: process_id, quantity, time_per_unit_minutes (optional, defaults to process standard), is_outsourced (optional override), notes
   - PUT/DELETE similar
   - estimated_cost auto-computed via process cost helper

5. Multi-level (sub-assemblies):
   - POST /api/boms/:id/versions/:version_id/subassemblies
     Input: child_bom_id (FK to another BOM), quantity, notes
     Validation: prevents circular references (BOM A → BOM B → BOM A)
   - GET /api/boms/:id/versions/:version_id/expanded
     Returns full hierarchical expansion: all sub-assembly materials and processes rolled up

6. BOM lock at production start:
   - Field: bom_versions.locked_at_production_start (timestamp)
   - Set by Phase 4 when production job starts using this version
   - Once locked, that version's lines cannot be edited even if it's still "active" status
   - New version supersedes if changes needed

7. Approval workflow:
   - BOM version status: draft → approved (POST /approve endpoint)
   - System setting controls whether engineering manager approval required
   - Use Phase 0 workflow engine if approval flow configured
   - Audit logged

8. BOM change log:
   - Every change to lines logged to bom_change_log
   - GET /api/boms/:id/change-log (full history across versions)

9. Where-used reverse lookup:
   - GET /api/materials/:id/where-used-in-boms
   - GET /api/processes/:id/where-used-in-boms

Tests:
- Create BOM
- Add material lines (generic, specific, primary+alternate)
- Add process lines (inhouse, outsourced)
- Add sub-assembly, verify no circular refs allowed
- Create v2, modify, approve, verify v1 superseded
- Try editing approved version → blocked
- Lock at production start → version becomes uneditable
- Compare versions
- Change log captures everything
- Where-used works

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-11
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- BOM core CRUD with versioning
- Material and process lines
- Sub-assemblies (multi-level)
- Approval and change log

❌ OUT OF SCOPE:
- Selection list workflow → P2-13
- BOM resolution (template → specific) → P2-14
- Costing → P2-15
- Nesting → Phase 4

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Selection list and resolution in next prompts. Continue with BOM core?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-11] BOM core with versioning, material/process lines, sub-assemblies`

---

### PROMPT P2-12 — BOM Admin UI

```
Read PROMPTS_P2.md and /mnt/skills/public/frontend-design/SKILL.md.

Build BOM management UI.

1. BOM list (/admin/boms):
   - DataTable: BOM code, product, current version, status, last updated
   - Filters: product, status, search
   - Actions: view, create new version, archive

2. BOM detail (/admin/boms/:id):
   - Header: BOM info, current version, version selector dropdown
   - Tabs:
     - Material Lines (table with material, quantity, UOM, wastage, alternate group, notes)
     - Process Lines (table with process, quantity, time, cost, outsourced flag)
     - Sub-Assemblies (linked child BOMs)
     - Change Log (timeline)
     - Version History (with compare)
   - Actions: edit (draft only), approve (draft only), create new version

3. BOM line editor:
   - "Add Material Line" → modal with two modes:
     - Generic Template: pick category + (optional) material type → these lines need selection list to resolve
     - Specific Material: search material master directly → resolves immediately
   - "Add as Alternate to existing line" → adds to same alternate_group_id
   - Quantity, UOM, wastage% inputs
   - Visual indicator for finish-dependent lines (need resolution)

4. Process line editor:
   - Pick process from dropdown
   - Quantity, time override, outsourced toggle
   - Live cost calculation preview

5. Sub-assembly linker:
   - Pick child BOM
   - Quantity
   - Visual tree view showing full expansion

6. Version comparison:
   - Side-by-side v1 vs v2
   - Color-coded: added (green), removed (red), modified (yellow)
   - Per-line diff

7. Where-used view:
   - From material detail (P2-07): "Used in BOMs" tab
   - From process detail: "Used in BOMs" tab
   - Lists BOMs with version, line details

8. Mobile:
   - BOM viewing on mobile (engineers checking BOMs on shop floor)
   - Editing not optimized for mobile

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-12
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- BOM admin UI (list, detail, line editing, version compare)

❌ OUT OF SCOPE:
- Selection list UI → P2-14
- Resolved BOM viewer → P2-14
- Costing UI → P2-16

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Coming in next prompts. Continue with BOM UI?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-12] BOM admin UI with line editor, version compare, and where-used`

---

### PROMPT P2-13 — Selection List Workflow

```
Build the selection list workflow that resolves generic BOM templates into order-specific material choices.

Background:
Per your earlier business reality: orders are placed without specific finishes. Generic BOM has lines like "18mm pre-laminated particle board" (category + type only). When customer confirms finishes (later, before manufacturing), a selection list maps each generic line to a specific material SKU.

1. Selection list creation:
   - POST /api/selection-lists
     Input: order_id, finish_group_name (e.g., "Project ABC — Natural Oak"), notes
     Auto-generates: selection_list_code
     Status: draft
   - GET /api/selection-lists?order_id=&status=
   - GET /api/selection-lists/:id (with items)

2. Selection list items:
   - For each generic (finish-dependent) BOM material line:
     - System auto-creates a placeholder selection_list_item
     - User selects actual material from material master
   - APIs:
     POST /api/selection-lists/:id/items
       Input: order_line_id (optional — for line-specific selections), bom_material_line_id, selected_material_id, alternate_chosen (true if picking alternate from BOM), quantity_override (optional), notes
     PUT/DELETE /api/selection-lists/:id/items/:item_id

3. Material discovery (helps user pick):
   - GET /api/material/materials/for-selection?bom_material_line_id=
     Returns materials matching the BOM line's category + material_type + alternate_group
     Includes visual swatches
     Supports filtering by manufacturer, finish family
     Stock availability shown (from Phase 3 when available; placeholder for now)

4. Selection list approval:
   - POST /api/selection-lists/:id/submit (status: draft → submitted)
     Submitted by: customer (via portal — Phase 7) or sales team or engineering
   - POST /api/selection-lists/:id/approve (status: submitted → approved)
     By: project_manager or engineering role
   - Once approved, no further changes; create new selection list if revisions needed

5. Selection list applied to order:
   - POST /api/selection-lists/:id/apply
     Triggers resolved BOM creation (P2-14) for the order
     Updates selection_list status: approved → applied_to_bom

6. Finish group convenience:
   - For projects with consistent finishes, "Apply finish group" auto-fills:
     Pick "Natural Oak" → all finish-dependent lines get pre-filled with Natural Oak materials of the right category
     User can override individual lines

7. Selection list versioning:
   - If revision needed after approval, create NEW selection list (not edit existing)
   - Old selection lists preserved for audit

8. Customer portal handoff:
   - GET /api/portal/orders/:id/selection-list (customer access — Phase 7 will build UI)
   - POST /api/portal/orders/:id/selection-list/items (customer-submitted selections)
   - Approval required by internal team before applying

Tests:
- Create selection list for order
- Auto-discover finish-dependent BOM lines
- Pick specific materials
- Pick alternate from BOM's alternate_group
- Submit for approval
- Approve
- Apply to order (triggers resolved BOM in P2-14)
- Finish group bulk-apply

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-13
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Selection list CRUD with workflow
- Material discovery for selection
- Approval workflow
- Customer portal API endpoints (UI is Phase 7)

❌ OUT OF SCOPE:
- Customer portal UI → Phase 7
- Resolved BOM (output of selection list) → P2-14
- Visual finish selector for customers → Phase 7

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Resolution in P2-14. Portal UI in Phase 7. Continue with selection list workflow?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-13] Selection list workflow with material discovery and approval`

---

### PROMPT P2-14 — BOM Resolution Engine + Selection List UI

```
Build the resolution engine that produces a resolved BOM from a generic BOM + selection list, plus the UI for selection lists.

1. Resolution engine:
   - POST /api/resolved-boms
     Triggered when selection list is applied (P2-13)
     Input: order_id, order_line_id, bom_id (uses current active version), selection_list_id (optional if BOM has no generic lines)
     
     Logic:
     a. Lock to current active BOM version (capture bom_version_id)
     b. For each BOM material line:
        - If specific_material_id is set (already specific) → copy to resolved_bom_material_lines as-is
        - If generic (category/type only) → look up selection_list_items for this BOM line
          - If selection found → use selected material
          - If no selection AND not finish-dependent → error: cannot resolve
          - If no selection AND finish-dependent → error: selection list incomplete
        - Calculate theoretical_quantity_with_wastage = qty × (1 + wastage_percent/100)
        - Snapshot unit_cost from material master (or rate contract in Phase 3 when available)
     c. For each BOM process line: copy as-is to resolved_bom_process_lines
     d. For sub-assemblies: recursively resolve (each sub-assembly creates its own resolved_bom)
     e. Compute total_theoretical_material_cost
     f. Status: draft (engineering review) or auto-approved if configured

   - GET /api/resolved-boms?order_id=&status=
   - GET /api/resolved-boms/:id (full detail with lines)
   - POST /api/resolved-boms/:id/approve
   - POST /api/resolved-boms/:id/lock-for-production (called by Phase 4 when production starts)

2. Resolved BOM update flow:
   - Once locked for production, cannot change
   - If selection changes mid-flight (rare), new selection list + new resolved BOM (versioned)
   - Old resolved BOM preserved for audit

3. Material requirement summary (Layer 1 — Theoretical):
   - GET /api/orders/:id/material-requirements
     Aggregates across all order lines and their resolved BOMs
     Returns per material: total quantity required (with wastage)
     This is the Layer 1 Theoretical Requirement used by:
       - PO generation (Phase 3) — over-stock acceptable
       - Cost estimation
     NOT used for material issue (Phase 4 nesting drives that — Layer 2)

4. Selection List UI (/admin/selection-lists):
   - List view (filters by order, status)
   - Detail view per selection list:
     - Order info
     - List of BOM lines needing selection (grouped by order line)
     - Material picker per line (with swatch images, filters)
     - "Apply Finish Group" bulk action
     - Submit/Approve buttons per role
   - Customer portal placeholder API ready for Phase 7

5. Resolved BOM viewer (/admin/orders/:id/resolved-bom):
   - Read-only view showing fully resolved BOM
   - Material requirement summary
   - Cost breakdown (uses P2-15 costing)
   - Status badge (draft / approved / locked for production)
   - "Lock for Production" button (for production manager — Phase 4 will use this)

Tests:
- Create order with finish-dependent BOM
- Create selection list, pick materials
- Approve and apply
- Verify resolved BOM created correctly
- Material requirement summary aggregates across order lines
- Lock for production prevents further changes
- Multi-level: sub-assembly resolution works
- Edge case: selection list missing items → resolution fails with clear error

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-14
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- BOM resolution engine
- Resolved BOM management
- Selection list UI
- Resolved BOM viewer
- Material requirement summary (Layer 1)

❌ OUT OF SCOPE:
- Nesting / Layer 2 planned requirement → Phase 4
- Material issue → Phase 3 (which uses Phase 4 nesting output)
- Customer portal finish selector UI → Phase 7

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Nesting and MIN are later phases. Continue with resolution engine + UI?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-14] BOM resolution engine with selection list UI and resolved BOM viewer`

---

### PROMPT P2-15 — Costing Engine

```
Build the costing engine that rolls up material + process + overhead into selling price.

Per your decisions: BOM is for estimation+PO; costing here is reference-only for orders (orders use Phase 1 pricing). Quote builder (Phase 6) will use this engine for cost computation.

1. Costing run:
   - POST /api/costing-runs
     Input: bom_version_id (or resolved_bom_id), run_type (initial/re-cost/what-if), overhead_percent_override (optional), margin_percent_override (optional), labor_rate_override (optional)
     
     Logic:
     a. Material cost = sum of (resolved line qty × material's snapshot unit cost)
        For generic BOMs without resolved version: use AVERAGE cost across matching specific materials (estimation)
     b. Labor cost = sum of (process line qty × time × labor_rate)
     c. Machine cost = sum of (process line qty × time × machine_cost_per_hour)
     d. Outsourcing cost = sum of estimated outsource process costs
     e. Manufacturing cost = a + b + c + d
     f. Overhead = manufacturing cost × overhead_percent
     g. Landing cost = manufacturing cost + overhead
     h. Selling price (excl tax) = landing cost × (1 + margin_percent/100)
     i. Tax = selling price × tax_rate
     j. MRP = selling price + tax
     
   - Store all line-level breakups in costing_run
   - Returns: full breakdown

2. Costing assumptions admin:
   - GET /api/admin/costing-assumptions
   - PUT /api/admin/costing-assumptions/:key (overhead %, margin %, labor rate)
   - Version-tracked (valid_from / valid_until)
   - System uses latest active assumption unless overridden in costing run

3. Re-costing:
   - When material prices change (Phase 3 will update unit costs), trigger re-cost
   - Background job: nightly recompute costs for active BOMs
   - Alert engineering if margin drops significantly

4. What-if analysis:
   - POST /api/costing-runs/what-if
     Input: bom_version_id, scenario_inputs (e.g., +10% material cost, -5% labor)
     Returns delta from baseline costing
     Not saved — for analysis only

5. Cost comparison:
   - GET /api/boms/:id/costing-comparison
     Compares latest costing across BOM versions
     Shows trend (cost going up/down)

6. Internal vs sales view:
   - Costing endpoints RBAC-restricted: sales_manager + sales_director + engineering see breakdowns
   - sales_executive sees only selling price, not cost components (per design)

7. Margin alerts:
   - System setting: MARGIN_ALERT_THRESHOLD_PERCENT (default 20)
   - When costing produces margin below threshold, alert engineering manager
   - Configurable

8. Order-level costing (reference):
   - GET /api/orders/:id/cost-summary
     For each order line, run costing on resolved BOM
     Sum into order-level material, labor, overhead, total cost
     Margin vs order price
     Reference-only — does not change order amounts

Tests:
- Costing run on simple BOM
- Costing on multi-level BOM (sub-assemblies)
- Override overhead/margin
- What-if analysis
- Re-costing reflects material price changes
- Margin alert fires below threshold
- Sales-executive role sees price but not cost
- Manager role sees full breakdown

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-15
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Costing engine
- Cost assumptions admin
- Re-costing automation
- What-if analysis
- Margin alerts

❌ OUT OF SCOPE:
- Quote-level pricing with customer-tier margins → Phase 6 (uses this engine + adds tiering)
- FIFO material costing (actual issued cost) → Phase 3
- Variance reports (BOM cost vs actual) → Out of scope per addendum decision

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Quote tiering is Phase 6. Variance tracking is out of scope. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-15] Costing engine with material rollup, overhead, margin, and what-if analysis`

---

### PROMPT P2-16 — Costing UI

```
Read PROMPTS_P2.md and /mnt/skills/public/frontend-design/SKILL.md.

Build costing UI for engineering and management.

1. Costing dashboard (/admin/costing):
   - Per-product cost trends
   - Margin distribution across products
   - Materials with biggest cost impact
   - Recent re-costings

2. BOM costing view (/admin/boms/:id/costing):
   - Cost breakdown card: Material / Labor / Machine / Outsource / Overhead / Margin / Selling Price / MRP
   - Material lines with individual costs
   - Process lines with individual costs
   - History of past costing runs
   - "Run new costing" button (with parameter overrides)

3. What-if simulator:
   - Sliders: material cost +/-, labor rate +/-, overhead +/-
   - Live preview of resulting price and margin
   - Save scenario for reference

4. Costing assumptions admin (/admin/costing/assumptions):
   - List of assumptions with values, validity dates
   - Edit form with audit trail
   - Schedule future changes (e.g., labor rate increase from next month)

5. Margin alerts:
   - /admin/costing/alerts
   - List of BOMs below margin threshold
   - Quick re-cost action

6. Internal-only visibility:
   - Costing UI restricted to engineering, sales_manager, sales_director, director roles
   - Sales executives don't see this menu

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-16
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Costing UI: dashboard, BOM costing, what-if, assumptions, alerts

❌ OUT OF SCOPE:
- Quote builder → Phase 6
- Cross-customer margin analysis → Phase 6

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Quote-level views in Phase 6. Continue with costing UI?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-16] Costing UI with dashboard, BOM view, what-if simulator, and alerts`

---

### PROMPT P2-17 — Integration: Link Products to BOMs (Phase 1 ↔ Phase 2)

```
Tighten the integration between Phase 1 products and Phase 2 BOMs.

1. Product detail enhancements:
   - GET /api/products/:id (extend response to include active BOM info)
     If BOM exists: bom_id, current_version, has_finish_dependency (bool)
     If no BOM: bom_id = null, message "No BOM configured"
   - On product detail UI: "Configure BOM" button (creates new BOM linked to product) if no BOM exists; "View BOM" button if exists

2. Order line BOM resolution trigger:
   - When order is confirmed (Phase 1 P1-06):
     - For each order line with product_id:
       - Check if product has active BOM
       - If yes, mark order_line.bom_resolved = false (resolution pending)
       - If BOM has finish dependencies: create draft selection list
       - If BOM has no finish dependencies: auto-resolve (create resolved_bom immediately)
     - For custom items: no BOM resolution
   - All this happens in background job after confirmation

3. Order-level BOM status:
   - GET /api/orders/:id/bom-status
     Returns per order line: BOM existence, resolution status, selection list status, resolved BOM status
     Used by production team to see what's ready for manufacturing

4. Material requirement at order confirmation:
   - On confirmation, compute Layer 1 theoretical material requirement aggregated across order
   - Store in cache for procurement team (Phase 3 PO generation)
   - Updates if order amended (rare in Phase 1)

5. Cost preview at order entry:
   - When adding catalog product to order, show internal cost reference (manager+ only)
   - Helps salesperson know margin impact
   - Doesn't override order line pricing (which uses Phase 1 logic)

6. Product cost in product master:
   - GET /api/products/:id/standard-cost
     Returns latest costing run for product's active BOM
     Cached, updated on BOM/material price changes

7. Bulk operations:
   - POST /api/products/bulk-create-boms
     For products without BOMs, create empty BOM shells
     Useful when migrating to BOM-based pricing

Tests:
- Order confirmation triggers BOM resolution for catalog products
- Custom items skip BOM resolution
- Finish-dependent products create draft selection lists
- Material requirements aggregate correctly
- Cost preview visible to managers, hidden from sales execs

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-17
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Product ↔ BOM integration
- Order confirmation trigger
- Material requirement aggregation
- Cost preview

❌ OUT OF SCOPE:
- PO generation → Phase 3
- Material issue → Phase 4 (via nesting)
- Customer-portal finish selection → Phase 7

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Continue with integration scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-17] Phase 1-2 integration: product-BOM linkage and order resolution triggers`

---

### PROMPT P2-18 — Notifications and Audit Coverage

```
Ensure Phase 2 entities flow through Phase 0 audit and communication.

1. Audit coverage check:
   - Verify Prisma middleware logs ALL changes to:
     - material.materials, material.manufacturer_catalogs, material.attributes, material.attribute_values
     - product_engineering.boms, bom_versions, bom_material_lines, bom_process_lines
     - product_engineering.selection_lists, resolved_boms, costing_runs
   - Run a test transaction on each, verify audit_logs entry created

2. Communication triggers:
   - Material master events:
     - Material created → engineering team notification (optional, configurable)
     - Manufacturer catalog imported → admin confirmation
     - Material image queue building up → reminder to photo team
   - BOM events:
     - BOM created (new product) → engineering manager
     - BOM version approved → relevant production team
     - BOM cost change above threshold → finance + engineering manager
   - Selection list events:
     - Draft selection list created → assigned to sales for filling
     - Submitted → engineering for review
     - Approved → production manager (ready for production planning)
   - Resolved BOM:
     - Locked for production → production team can proceed

3. Notification preferences:
   - Per-user notification preferences from Phase 0 P0-18 applied here
   - Defaults configurable per role

4. Slack/Teams integration (optional, defer if not needed):
   - Not in this prompt; just note in P2 README that channels can extend communication

Tests:
- Audit logging on all entity types
- Notifications fire correctly
- User preferences respected

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-18
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Phase 2 audit and notification integration

❌ OUT OF SCOPE:
- New notification channels (Slack, Teams) → Phase 8 if needed
- AI summarization of changes → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Continue with audit + notification coverage?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-18] Phase 2 audit logging and notification coverage`

---

### PROMPT P2-19 — Reports (Material, BOM, Costing)

```
Build reports for Phase 2 entities.

1. Material reports:
   - Materials by category breakdown
   - Materials with pending images
   - Most-used materials (across BOMs)
   - Unused materials (defined but in no BOM)
   - Recent additions
   - Manufacturer-wise material catalog summary

2. BOM reports:
   - Products without BOMs (gap report)
   - BOMs by complexity (number of materials, processes, sub-assemblies)
   - BOM version churn (which BOMs change frequently — possible spec instability)
   - BOMs with finish dependencies (need selection lists)

3. Costing reports:
   - Margin distribution across products
   - Products below margin threshold
   - Material cost trends per product
   - High-cost materials (which materials drive most cost in BOMs)
   - Outsourcing dependency (% of cost from outsourced processes)

4. Cross-reports:
   - Material cost as % of selling price (per product)
   - Process cost as % of selling price
   - Margin by product category

5. Export:
   - All reports exportable to Excel/CSV
   - PDF format for printable reports

6. Scheduled delivery (Phase 0 notification):
   - Weekly material/BOM summary to engineering manager
   - Monthly costing review to finance + director

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-19
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Standard reports for material/BOM/costing
- Export and scheduled delivery

❌ OUT OF SCOPE:
- Custom report builder (drag-drop dimensions) → Phase 8
- Predictive analytics → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Custom builder is Phase 8. Continue with standard reports?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-19] Phase 2 reports for material, BOM, and costing`

---

### PROMPT P2-20 — Process Master Admin UI

```
Build process master UI (smaller than material/BOM but needed).

1. Process list (/admin/processes):
   - DataTable: code, name, category, time, costs, outsourced flag
   - Filters: category, outsourced, search

2. Process create/edit:
   - Standard form
   - Capabilities sub-section (key-value list)
   - Cost calculation preview

3. Process where-used:
   - List of BOMs using this process

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-20
═══════════════════════════════════════════════════════════
✅ IN SCOPE: Process master UI
❌ OUT OF SCOPE: Production execution UI → Phase 4
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-20] Process master admin UI`

---

### PROMPT P2-21 — Customer Portal Selection List API (Foundation)

```
Build customer-facing selection list APIs. UI is Phase 7, but APIs prepared here.

1. Customer endpoints:
   - GET /api/portal/orders/:id/selection-list
     Customer sees pending finish selections for their order
     Returns: list of selection items needing customer input, with available material options (with swatch images)
   - POST /api/portal/orders/:id/selection-list/items
     Customer picks finishes
     Status: submitted (awaiting internal approval)
   - GET /api/portal/orders/:id/selection-list/status

2. Data isolation:
   - Customer can only see selection lists for THEIR orders
   - Enforced server-side via RBAC + ownership check

3. Visual finish browser API:
   - GET /api/portal/materials/finishes-for-selection?category=&order_line_id=
     Returns swatch-rich material list for browsing
     Filtered by what's appropriate for the BOM line

4. Communication:
   - When customer submits selection, internal team notified
   - When internal approves, customer notified

Phase 7 will build the actual UI. These APIs are ready for it.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-21
═══════════════════════════════════════════════════════════
✅ IN SCOPE: Customer-facing selection list APIs
❌ OUT OF SCOPE: Portal UI → Phase 7
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-21] Customer portal selection list APIs (UI in Phase 7)`

---

### PROMPT P2-22 — Phase 2 Integration Tests & Checklist

```
Final Phase 2 prompt. End-to-end testing and validation.

End-to-end scenarios:

SCENARIO A — Full product lifecycle:
- Create new product in Phase 1
- Create BOM for product in Phase 2 (catalog and BOM linked)
- Add material lines (specific + generic with alternates), process lines, sub-assembly
- Approve BOM v1
- Create order in Phase 1 referencing this product
- Confirm order → selection list draft auto-created (finish-dependent lines exist)
- Sales fills selection list with specific materials
- Engineering approves selection list
- Apply → resolved BOM created
- View material requirements
- Run costing → see cost breakdown
- Lock resolved BOM for production (Phase 4 will use this)

SCENARIO B — BOM versioning:
- Edit BOM → create v2
- Change a material, change quantity
- Approve v2
- Verify v1 superseded
- Old orders using v1 keep v1; new orders use v2
- Lock-at-production-start: order's locked v1 doesn't change even when v2 exists

SCENARIO C — Multi-level BOM:
- Create sub-assembly BOM (e.g., Drawer Unit)
- Reference in main BOM (e.g., Executive Table)
- Resolve order → both main and sub-assembly resolved BOMs created
- Material requirements aggregate across levels

SCENARIO D — Primary + Alternate materials:
- BOM line has primary material + 2 alternates
- Selection list picks alternate 2
- Resolved BOM uses alternate 2's material
- Verify cost reflects alternate choice

SCENARIO E — Pure catalog item (no finish dependency):
- Product with BOM containing only specific materials (no generic)
- Order confirmation → auto-resolved (no selection list needed)
- Resolved BOM created immediately

SCENARIO F — Custom item handling:
- Order with line_type = custom_item
- No BOM resolution
- No material requirements from this line
- Costing only for catalog items

SCENARIO G — Re-costing on material price change:
- Update material's unit cost
- Re-costing job runs
- Affected BOMs' costs update
- Margin alert if dropped below threshold

SCENARIO H — Material master scenarios from P2-08:
- Re-run all P2-08 scenarios to verify nothing regressed

Validation checklist:
- [ ] All ~32 tables (material + product_engineering) functional
- [ ] All MATERIAL_MASTER_DESIGN_LOCK.md requirements met (re-validate)
- [ ] Process master with seed processes
- [ ] BOM CRUD with versioning, alternates, sub-assemblies
- [ ] BOM lock at production start (when Phase 4 triggers it)
- [ ] Selection list workflow end-to-end
- [ ] BOM resolution engine produces correct resolved BOMs
- [ ] Material requirement aggregation (Layer 1 Theoretical)
- [ ] Costing engine with overhead, margin, what-if
- [ ] Cost preview RBAC (managers see, executives don't)
- [ ] Re-costing automation
- [ ] Margin alerts
- [ ] Phase 1 ↔ Phase 2 integration (product-BOM linkage)
- [ ] Customer portal APIs ready (UI in Phase 7)
- [ ] All admin UIs functional
- [ ] Audit logging on all P2 entities
- [ ] Notifications on key events
- [ ] Reports working

Documentation:
- Phase 2 module README with full API list, screens, integrations
- ER diagram for material + product_engineering schemas
- Migration guide from blueprint to design lock (already done, document it for reference)

Performance checks:
- BOM with 50 lines + 10 sub-assemblies resolves in < 3 seconds
- Material list with 5000 materials loads in < 2 seconds
- Material detail with full attributes in < 1 second

If any check fails, fix with [P2-22-FIX] commits.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P2-22
═══════════════════════════════════════════════════════════
✅ IN SCOPE: Phase 2 final validation
❌ OUT OF SCOPE: Phase 3 features → Phase 3

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Phase 2 complete with this prompt. Phase 3 starts when this is green.
Continue with Phase 2 validation?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P2-22] Phase 2 integration tests and checklist validation`

---

## PART 6 — COMMIT MESSAGES QUICK REFERENCE

| # | Commit Message |
|---|----------------|
| P2-01 | `[P2-01] Material schema with 16 tables per design lock` |
| P2-02 | `[P2-02] Material master seed data: categories, types, profiles, attributes, values, manufacturers` |
| P2-03 | `[P2-03] Material master CRUD with auto-gen name/SKU and dedup by attribute hash` |
| P2-04 | `[P2-04] Manufacturer catalog master with Excel import and auto-fill lookup` |
| P2-05 | `[P2-05] Material images with category rules, bulk upload, and thumbnails` |
| P2-06 | `[P2-06] Material CSV import with dynamic templates and error resolution` |
| P2-07 | `[P2-07] Material master admin UI with 4 management screens and dynamic material form` |
| P2-08 | `[P2-08] Material master integration tests and design lock validation` |
| P2-09 | `[P2-09] Product engineering schema with BOM, selection list, resolved BOM, costing tables` |
| P2-10 | `[P2-10] Process master with definitions, capabilities, and standard seed` |
| P2-11 | `[P2-11] BOM core with versioning, material/process lines, sub-assemblies` |
| P2-12 | `[P2-12] BOM admin UI with line editor, version compare, and where-used` |
| P2-13 | `[P2-13] Selection list workflow with material discovery and approval` |
| P2-14 | `[P2-14] BOM resolution engine with selection list UI and resolved BOM viewer` |
| P2-15 | `[P2-15] Costing engine with material rollup, overhead, margin, and what-if analysis` |
| P2-16 | `[P2-16] Costing UI with dashboard, BOM view, what-if simulator, and alerts` |
| P2-17 | `[P2-17] Phase 1-2 integration: product-BOM linkage and order resolution triggers` |
| P2-18 | `[P2-18] Phase 2 audit logging and notification coverage` |
| P2-19 | `[P2-19] Phase 2 reports for material, BOM, and costing` |
| P2-20 | `[P2-20] Process master admin UI` |
| P2-21 | `[P2-21] Customer portal selection list APIs (UI in Phase 7)` |
| P2-22 | `[P2-22] Phase 2 integration tests and checklist validation` |

---

## PART 7 — DEPENDENCIES & INTEGRATION

### From Phase 0:
- core.users, core.roles → RBAC on all material/BOM/costing APIs
- core.numbering_series → BOM, SL, COST series
- core.modules → Phase 2 module registrations
- core.communication_* → Phase 2 notifications
- core.documents → material images storage
- core.audit_logs → all Phase 2 entities
- core.uom_master → material UOMs

### From Phase 1:
- sales.products → BOM linkage (bom_id was placeholder; now populated)
- sales.product_size_variants → variant-specific BOMs
- sales.orders → selection list and resolved BOM linkage
- sales.order_lines → resolved BOM per line

### To Phase 3 (supply chain):
- material.materials → vendor rate contracts reference these
- Material requirement (Layer 1) → PO generation
- Specific materials list → procurement targets

### To Phase 4 (production):
- Resolved BOMs → production job inputs
- BOM version lock-at-production-start triggered from here
- Process definitions → station mapping
- Layer 1 Theoretical → input to Layer 2 Planned (via nesting)

### To Phase 6 (CRM/Quote):
- Costing engine → quote builder uses for cost computation
- BOM-fallback line type in quotes → calls Phase 2 BOM costing

### To Phase 7 (Customer Portal):
- Selection list APIs → portal finish selector UI
- Material images → portal catalog browsing

---

## PART 8 — BEFORE STARTING PHASE 2

1. Phase 0 complete with green P0-30 checklist
2. Phase 1 complete with green P1-12 checklist
3. MATERIAL_MASTER_DESIGN_LOCK.md saved in /specs and accessible
4. Have OutDo manufacturer catalogs (Excel/PDF) ready to upload during P2-04
5. Plan material naming/code conventions one more time before P2-02 (seed) so you don't regret them after data is loaded
6. Verify Phase 0 communication providers actually configured (P2-18 sends notifications)

---

## PART 9 — WHAT PHASE 2 DELIBERATELY DEFERS

Per FORWARD_REFERENCES.md:

🔄 Vendor rate contracts → Phase 3 (material has cost snapshot from materials table; FIFO and vendor-specific pricing come Phase 3)
🔄 FIFO costing → Phase 3
🔄 Material stock movements → Phase 3
🔄 Purchase orders → Phase 3
🔄 Nesting / Layer 2 Planned Requirement → Phase 4
🔄 Production batches and panel tracking → Phase 4
🔄 Customer-tier margin engine, volume slabs → Phase 6
🔄 Quote builder UI → Phase 6
🔄 Customer portal UI → Phase 7
❌ Parametric/configurator BOM → Deferred indefinitely
❌ Variance reports (BOM vs actual) → Out of scope per addendum

---

**End of Phase 2 specification — Version 2.0 (clean)**

When you complete P2-22 with all checklist items green, Phase 3 (supply chain) regeneration comes next. Same approach: I regenerate it clean before you build it, folding in the material planning addendum.

This file supersedes: old PROMPTS_P2.md, PHASE2_ADDENDUM.md, PROMPT_GAP_ANALYSIS.md, GAP_ANALYSIS_ADDENDUM.md. Delete those from /specs to avoid confusion.
