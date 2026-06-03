# MATERIAL MASTER — DESIGN LOCK
## The Canonical, Fully-Dynamic, Attribute-Based Material Master Specification

**Version:** 1.0 (LOCKED)
**Prepared for:** OutDo Furnishings Private Limited
**Applies to:** Phase 2 material master prompts (P2-01, P2-02, P2-02A, P2-02B and related)
**Status:** This document supersedes the earlier Phase 2 material master design, the Phase 2 addendum, and the gap analysis prompts for the material master specifically. When building Phase 2, the material master prompts implement THIS document.

---

## PURPOSE OF THIS DOCUMENT

The raw material master is the backbone of the entire ERP. Every BOM line, purchase order, stock movement, FIFO cost, nesting calculation, and dispatch references a material. If material identity is wrong, every downstream module inherits the error.

This document locks the design so that:
1. **Zero hardcoding** — every category, attribute, value, format rule is admin-controlled data, not code.
2. **Zero duplicates** — the same physical material can never be created twice under different names.
3. **Standardized naming and coding** — name and SKU are always auto-generated, never typed.
4. **Manufacturer-based identity** — a material IS what the manufacturer made; the dealer is separate.
5. **Scalable** — new categories, attributes, variants, manufacturers added through UI, never code.

Everything below is derived from real OutDo data and confirmed business decisions.

---

## PART 1 — CORE PRINCIPLES (THE RULES THAT GOVERN EVERYTHING)

### Principle 1 — Identity = the physical product as the manufacturer made it
A material's identity is the combination of: its category, its material type, its manufacturer (brand), the manufacturer's code/spec, and its physical attributes (dimensions, finish, etc.). Two products that differ in any identity attribute are different materials — even if they share a common name like "Frosty White" or "0-Crank hinge."

### Principle 2 — Manufacturer ≠ Dealer
The "Brand" attribute holds the **manufacturer** (Hettich, Ebco, Action Tesa, or "Regular Brand" for unbranded). The **dealer** (who you buy from) lives entirely in the vendor/rate-contract layer (Phase 3). The same manufacturer's product bought from two dealers is ONE material with two vendor rate contracts.

### Principle 3 — Name and SKU are computed, never typed
The user selects attribute values from controlled inputs. The system computes the material name and SKU from those values. Both are read-only. The user cannot type or override them.

### Principle 4 — SKU and Uniqueness Key are the same attributes
The attributes flagged as "identity attributes" form BOTH the uniqueness key AND the SKU. They are derived from one source and can never drift apart. This prevents both false duplicates (different products getting the same SKU) and missed duplicates (same product with different SKUs).

### Principle 5 — Everything is admin-controlled data
Categories, material types, attributes, attribute values, format rules, conditional dependencies, manufacturer catalogs, image rules — all are records in admin-managed tables. The real OutDo data (12 categories, color codes, vendor list) is loaded as initial SEED, then owned and editable by admin forever through the UI. A developer never touches it after the initial build.

### Principle 6 — Attribute set depends on Category + Material Type together
A Raw board and a Semi-Finished board are both category "Boards & Panels" but show different attribute sets (Raw needs no color/code; Semi-Finished requires them). The system resolves the attribute set from the Category + Material Type combination.

---

## PART 2 — THE FOUR-LAYER DYNAMIC MODEL

Nothing in these four layers is hardcoded. All are admin-managed data.

### Layer 1 — Categories
Admin creates material categories. Seeded initially from your 12 OutDo categories. Each is a record. Adding a 13th is a UI action.

### Layer 2 — Material Types (classification axis)
A separate classification from category. Seven seeded types:
Raw, Semi-Finished, Finished, Packaging, Consumables, Spare Parts, MRO.
Every material is assigned both a category AND a type. Type affects inventory behavior, costing, and which attribute set applies. Admin can add types.

### Layer 3 — Attributes (per Category + Type combination)
Admin defines which attributes apply to each Category + Type combination, their order, field type, whether required, whether they feed name/SKU, and whether they're identity attributes. This is where Raw-board-vs-Semi-finished-board difference lives.

### Layer 4 — Attribute Values (per attribute, often manufacturer-scoped)
For dropdown attributes, admin maintains allowed values, each with a display label and a short code (for SKU). Some attribute values are scoped to manufacturer (color codes, quality variants). The OutDo color/finish lists are seeded here.

### Layer 5 (cross-cutting) — Format Rules & Manufacturer Catalogs
- Format rules: admin defines, per category+type, the order attributes appear in name and SKU.
- Manufacturer Catalog Master: per-manufacturer code→name (and code→variant) catalogs, populated by Excel import or manual entry, driving auto-fill.

---

## PART 3 — DATABASE SCHEMA (material schema)

### Group A — Classification

**material.categories**
- id, category_code (unique), name, description, display_order, icon, is_active, audit columns
- Seeded: Boards & Panels, Laminates, Edge Banding, Hardware & Fittings, Metal Components, Seating, Fabric & Upholstery, Adhesives & Chemicals, Tools & Consumables, Raw Steel & Metal, Packing Materials, Gas Springs & Mechanisms

**material.material_types**
- id, type_code (unique), name, description, inventory_behavior (jsonb — flags for how this type behaves in stock/costing), display_order, is_active
- Seeded: RAW, SEMI_FINISHED, FINISHED, PACKAGING, CONSUMABLES, SPARE_PARTS, MRO

**material.category_type_profiles**
- Links a category to the material types valid for it, and defines the attribute set per combination
- id, category_id (FK), material_type_id (FK), profile_name, is_active
- Example rows:
  - (Boards & Panels, RAW) → minimal attribute profile
  - (Boards & Panels, SEMI_FINISHED) → full profile with color/code
  - (Seating, FINISHED) → chair attribute profile
- This is the mechanism that makes Raw board ≠ Semi-finished board

### Group B — Attributes

**material.attributes**
- id, category_type_profile_id (FK — attributes belong to a category+type profile)
- attribute_code, label, field_type (see 12 types in Part 4), display_order, display_group (for form sectioning)
- is_required, is_identity (part of uniqueness key + SKU), feeds_name (appears in auto-name), feeds_sku (appears in SKU)
- name_position, sku_position (order within name/SKU)
- is_manufacturer_scoped (values depend on selected manufacturer — for colors, variants)
- default_value, placeholder, help_text
- is_active, audit columns

**material.attribute_values**
- id, attribute_id (FK)
- value_label (display), value_short_code (for SKU), display_order
- manufacturer_id (FK, nullable — set when value is manufacturer-scoped)
- swatch_image_path (nullable — for image-as-value or visual reference)
- hex_color (nullable — for color_picker type)
- is_active, audit columns
- Seeded with OutDo data: board types, thicknesses, finishes, sheet sizes, hardware types, etc.

**material.attribute_visibility_rules** (conditional display)
- id, attribute_id (the attribute that shows/hides)
- depends_on_attribute_id (the controlling attribute)
- condition_operator (equals / not_equals / in / not_in)
- condition_values (jsonb)
- action (show / hide)
- Example: "Crank Type" visible only when "Hardware Type" = "Hinge"
- Example: "Color Code" visible only when material_type = "Semi-Finished" (for boards)

**material.attribute_value_dependencies** (value filtering)
- id, attribute_id (whose values get filtered)
- depends_on_attribute_id (the controlling attribute)
- filter_map (jsonb — e.g., {"Hinge": ["soft_close","clip_on"], "Slide": ["ball_bearing","undermount"]})
- Example: "Sub-Type" values filtered based on "Hardware Type" selection

### Group C — Manufacturers & Catalog

**material.manufacturers**
- id, manufacturer_code (unique), name, description, website, is_active, audit columns
- Seeded: Hettich, Ebco, Hafele, Action Tesa, Greenlam, Merino, Century, etc. + "Regular Brand" (for unbranded materials)
- NOTE: This is manufacturers, NOT dealers. Dealers are vendors in Phase 3.

**material.manufacturer_catalogs**
- The per-manufacturer code→name catalog that drives auto-fill
- id, manufacturer_id (FK), catalog_type (color / variant / design / other)
- code (the manufacturer's code, e.g., "1103"), name (e.g., "Frosty White")
- additional_attributes (jsonb — for variants: quality tier, etc.)
- reference_image_path (nullable)
- is_active, audit columns
- UNIQUE constraint: (manufacturer_id, catalog_type, code) — code unique within manufacturer, reusable across
- Populated via Excel import OR manual entry

**material.catalog_import_batches**
- Tracks Excel catalog uploads
- id, manufacturer_id, catalog_type, source_filename, total_rows, success_rows, failed_rows, status, uploaded_by, uploaded_at, error_log_path

### Group D — Format Configuration

**material.naming_formats**
- id, category_type_profile_id (FK)
- format_type (name / sku)
- format_template (ordered list of attribute references + separators, jsonb)
- separator (default "-")
- preview_example (cached sample output)
- is_active, audit columns
- Example for (Boards, Semi-Finished) SKU: BRD-{board_type}-{mfr_code}-{thickness}-{surface}-{size}

### Group E — The Materials Themselves

**material.materials**
- id, material_code (auto-generated SKU, unique), material_name (auto-generated, computed)
- category_id (FK), material_type_id (FK), category_type_profile_id (FK)
- manufacturer_id (FK)
- attribute_hash (computed fingerprint of identity attributes — used for duplicate detection, unique)
- purchase_uom_id (FK), consumption_uom_id (FK), uom_conversion_factor
- min_stock_level, reorder_level, max_stock_level
- primary_image_path (nullable — required depends on category image rule)
- has_pending_image (boolean — true if image required but deferred)
- is_active, is_deleted, audit columns
- UNIQUE: material_code, attribute_hash

**material.material_attribute_values**
- The actual attribute values for a specific material
- id, material_id (FK), attribute_id (FK), attribute_value_id (FK, nullable for non-dropdown), raw_value (for typed/number/etc.)
- This stores what was selected/entered for each attribute when the material was created

**material.material_images**
- id, material_id (FK), image_path, image_type (swatch / full / closeup / application / technical)
- is_primary, display_order, uploaded_by, uploaded_at

**material.category_image_rules**
- id, category_id (FK), image_requirement (required / optional / required_deferrable)
- Seeded: Boards/Laminates/EdgeBanding/Fabric/Seating = required; Hardware/Adhesives/Tools/RawSteel = optional

### Group F — Import

**material.material_import_batches** & **material.material_import_errors**
- For bulk material creation via Excel with attribute validation
- Same pattern as other import features

**Total: ~16 tables in material schema**

---

## PART 4 — THE 12 ATTRIBUTE FIELD TYPES

Every attribute is one of these types. All admin-configurable.

| Type | Description | Example | Identity-capable? |
|---|---|---|---|
| single_select | Pick one from admin-managed dropdown | Board Type: PLPB | Yes |
| multi_select | Pick multiple | Applicable uses: [Office, Home] | No |
| manufacturer_scoped_select | Dropdown filtered by selected manufacturer | Color Code (Hettich's codes only) | Yes |
| dependent_select | Values filtered by another attribute | Sub-Type (filtered by Hardware Type) | Yes |
| text_autocomplete | Manual entry, suggests from existing, normalized | Design Code | Yes (after normalization) |
| text_free | Free text, no constraint | Notes | No |
| number | Numeric with optional unit | Force: 200 (N) | Yes (if identity) |
| number_range | Min-max | Thickness range | No |
| dimension | Structured L×W×H or LxW | Sheet Size: 2440x1220 | Yes |
| boolean | Yes/No toggle | Soft Close: Yes | Yes (if identity) |
| color_picker | Hex color selection | Base color | No |
| image_single | Upload image AS the attribute value | Finish Swatch | No |
| image_gallery | Multiple images as value | Application photos | No |
| url | Link | Spec sheet URL | No |
| auto_fill | Computed from another attribute (e.g., manufacturer catalog) | Color Name (from code) | No (derived) |

The **auto_fill** type is how "Color Name auto-fills from Color Code" works: it reads the manufacturer catalog based on the selected manufacturer + code and displays the name read-only.

---

## PART 5 — THE 12 CATEGORIES WITH ATTRIBUTE PROFILES (SEED DATA)

These are loaded as initial seed. Admin can modify everything after.

### CATEGORY 1: Boards & Panels

**Profile A — Type: RAW** (minimal)
| Attribute | Field Type | Required | Identity | In Name | In SKU |
|---|---|---|---|---|---|
| Board Type | single_select | Yes | Yes | Yes | Yes |
| Manufacturer | single_select | Yes | Yes | Yes | Yes |
| Thickness (mm) | single_select | Yes | Yes | Yes | Yes |
| Sheet Size | dimension | Yes | Yes | Yes | Yes |
| Image | image_single | Optional* | No | No | No |

**Profile B — Type: SEMI_FINISHED** (full — bought-in pre-laminated)
| Attribute | Field Type | Required | Identity | In Name | In SKU |
|---|---|---|---|---|---|
| Board Type | single_select | Yes | Yes | Yes | Yes |
| Manufacturer | single_select | Yes | Yes | Yes | Yes |
| Color Code | manufacturer_scoped_select | Yes | Yes | Yes | Yes |
| Color Name | auto_fill (from catalog) | Yes | No | Yes | No |
| Thickness (mm) | single_select | Yes | Yes | Yes | Yes |
| Surface Finish | single_select | Yes | Yes | Yes | Yes |
| Sheet Size | dimension | Yes | Yes | Yes | Yes |
| Image | image_single | Required | No | No | No |

Seed values: Board Type {PLPB, MDF, HDMR, Plywood, Raw Particle Board}; Thickness {4,6,7.30,8,9,16,17,18,25}; Surface {BSL, DSL, OSL, RAW, Pre-Laminated}; Sheet Size {8x4 (2440x1220), 8x6 (2440x1830)}.

### CATEGORY 2: Laminates
Type: typically RAW (decorative surface material)
| Attribute | Field Type | Required | Identity |
|---|---|---|---|
| Manufacturer | single_select | Yes | Yes |
| Design Code | text_autocomplete | Yes | Yes |
| Design Name | auto_fill / text_autocomplete | Yes | No |
| Finish Type | single_select | Yes | Yes |
| Thickness (mm) | single_select | Yes | Yes |
| Sheet Size | dimension | Yes | Yes |
| Image | image_single | Required | No |

Seed: Manufacturer {Merino, Greenlam, Royale Touche, Century, ...}; Finish {SF, RH, VR, FT, MG, HG, Matte}; Thickness {0.8, 1.0, 1.5}.

### CATEGORY 3: Edge Banding
| Attribute | Field Type | Required | Identity |
|---|---|---|---|
| Material | single_select | Yes | Yes |
| Manufacturer | single_select | Yes | Yes |
| Color Code | manufacturer_scoped_select | Yes | Yes |
| Color Name | auto_fill | Yes | No |
| Width (mm) | single_select | Yes | Yes |
| Thickness (mm) | single_select | Yes | Yes |
| Finish | single_select | Yes | Yes |
| Image | image_single | Required | No |

Seed: Material {PVC, ABS}; Width {22,23,30,45}; Thickness {0.40,0.80,1.00,1.30,1.50,2.00}; Finish {SHGL, HGLL, ML, NL, MATT, TOL}.

### CATEGORY 4: Hardware & Fittings
| Attribute | Field Type | Required | Identity |
|---|---|---|---|
| Hardware Type | single_select | Yes | Yes |
| Manufacturer | single_select | Yes | Yes |
| Quality Variant | manufacturer_scoped_select | Conditional | Yes |
| Sub-Type | dependent_select (on Hardware Type) | Yes | Yes |
| Size / Length | dependent_select | Conditional | Yes |
| Opening Angle | dependent_select (Hinges) | Conditional | Yes |
| Crank Type | dependent_select (Hinges) | Conditional | Yes |
| Material | single_select | Yes | No |
| Finish | single_select | No | No |
| Image | image_single | Optional | No |

Seed: Hardware Type {Hinge, Drawer Slide, Telescopic Channel, Lock, Knob, Screw, Leveler, Slim Box, Sliding Door System, D-Nut, Drywall Screw}; Manufacturer {Hettich, Ebco, Hafele, Godrej, Ipsa, ...}; Crank {0-Crank, 8-Crank, 16-Crank}; Angle {110, 155, 170}.
Quality Variant is manufacturer-scoped: Hettich {Onsys, Sensys, Veyosys, Obsidian}; admin adds variants for other manufacturers as discovered.
Sub-Type value dependencies: Hinge→{soft_close, clip_on, slide_on, ...}; Drawer Slide→{ball_bearing, undermount, premium}; etc.

### CATEGORIES 5-12
Metal Components, Seating, Fabric & Upholstery, Adhesives & Chemicals, Tools & Consumables, Raw Steel & Metal, Packing Materials, Gas Springs & Mechanisms — each seeded with attribute profiles per the OutDo blueprint, following the same structure. Full attribute lists carried from the blueprint, transformed into admin-managed seed data.

**Seating note:** Type = FINISHED, treated as bought-out material. Linked to Product Master (Phase 1) when sold. Attributes: Chair Type, Manufacturer, Model/Series, Back Type, Arm Type, Base Type, Color, Image (required).

**Unbranded materials** (Raw Steel, Packing, generic Consumables): Manufacturer defaults to "Regular Brand."

---

## PART 6 — SKU GENERATION (ALIGNED WITH UNIQUENESS)

### The single source of truth
The attributes flagged `is_identity = true` for a category+type profile form BOTH:
1. The uniqueness key (attribute_hash for duplicate detection)
2. The SKU (via attributes flagged feeds_sku, ordered by sku_position)

By design, every identity attribute feeds the SKU. This guarantees SKU and uniqueness can never disagree.

### SKU structure
```
[CATEGORY_PREFIX]-[identity attribute short codes in sku_position order]
```

Category prefixes (seeded, admin-editable): BRD, LAM, EBT, HDW, MET, CHR, FAB, ADH, TUL, STL, PKG, MCH.

### Examples (using your real data)
- Semi-finished board: `BRD-PLPB-1103-18-BSL-86` (Board Type, mfr code, thickness, surface, size)
- Raw board: `BRD-PB-18-84` (Board Type, thickness, size — no color/code, fewer segments because Raw profile has fewer identity attributes)
- Hinge: `HDW-HNG-HET-SENSYS-SC-110-0CR` (Type, mfr, variant, sub-type, angle, crank — all identity attributes present)
- Edge banding: `EBT-PVC-HET-10107-23-130-SHGL`

### Key fix from the blueprint
Unlike the blueprint where some SKUs were missing identity attributes (causing collision risk), here EVERY identity attribute appears in the SKU. The Raw board has a shorter SKU than Semi-Finished because it genuinely has fewer identity attributes — not because attributes were dropped. No two different materials can produce the same SKU.

### Auto-name generation
Parallel to SKU but human-readable, using feeds_name attributes in name_position order:
- `PLPB - Frosty White (1103) - 18mm - BSL - 8x6`
- `Hinge - Hettich Sensys - Soft Close - 110° - 0-Crank`

---

## PART 7 — DUPLICATE DETECTION

### The attribute_hash mechanism
When a material is being created:
1. System collects all `is_identity = true` attribute values
2. Normalizes them (trim, uppercase, strip special chars for typed fields)
3. Computes a deterministic hash of the ordered identity values
4. Checks if any existing material has the same attribute_hash
5. If exact match → block creation, show existing material, offer "View existing"
6. If partial match (some but not all identity attributes match) → show "Similar materials" as informational suggestions, allow creation if genuinely different

### Why this is duplicate-proof
- Identity is structural (attribute combination), not name-based
- Normalization prevents "14177" vs "14177 " vs "lam-14177" from being three materials
- Manufacturer-scoping prevents cross-brand code confusion
- The hash is computed from the same attributes as the SKU, so SKU uniqueness and material uniqueness are the same thing

### Manufacturer-scoped uniqueness for catalog codes
A manufacturer's code (1103) is unique within that manufacturer but reusable across manufacturers. Manufacturer X's 1103 (Frosty White) and Manufacturer Y's 1103 (different color) are different materials because manufacturer is an identity attribute.

---

## PART 8 — MANUFACTURER CATALOG MASTER (AUTO-FILL ENGINE)

### How auto-fill works
1. Admin maintains, per manufacturer, a catalog of code→name pairs (color, variant, design)
2. Populated via: (a) Excel import using downloadable template, or (b) manual entry
3. When a user creates a material: selects manufacturer → selects code → name auto-fills read-only from catalog
4. If code not in catalog: admin adds it to the catalog (not to the individual material), keeping names consistent

### Excel import flow (your Answer 4)
- Admin downloads sample template (columns: Manufacturer Code, Display Name, Catalog Type, optional Variant/Quality, optional Image URL)
- Admin fills with a manufacturer's catalog (from your Excel/PDF catalogs)
- Uploads filled file
- System validates, imports into manufacturer_catalogs, reports per-row outcome
- Available from day one; used whenever you're ready (deferred upload supported)

### Catalog types supported
- color (board/edge-banding color codes)
- variant (hardware quality variants like Onsys/Sensys)
- design (laminate design codes)
- extensible: admin can add catalog types

---

## PART 9 — IMAGE RULES (CATEGORY-CONFIGURABLE)

Per your concern about blocking the purchase team:

| Image Requirement | Behavior | Default Categories |
|---|---|---|
| required | Cannot save without image | Boards, Laminates, Edge Banding, Fabric, Seating |
| optional | Save without image allowed | Hardware, Adhesives, Tools, Raw Steel, Packing, MRO |
| required_deferrable | Save now with has_pending_image flag; image added later | Admin-configurable per category |

Admin sets the rule per category. Visual-selection categories require images (for customer-facing finish selection later). Functional items don't block creation. The "pending image" queue lets someone photograph deferred items in batch later.

---

## PART 10 — UOM (PURCHASE VS CONSUMPTION)

Every material has:
- purchase_uom (how you buy it): Sheets, Rolls, Boxes, Kg, etc.
- consumption_uom (how you use it): Sq.ft, Running Meters, Pieces, Grams
- uom_conversion_factor (1 purchase unit = N consumption units)

Example: Edge banding — purchase UOM Roll, consumption UOM Meter, factor 50 (1 roll = 50m). Board — purchase Sheet, consumption Sq.ft, factor computed from sheet dimensions.

UOM master seeded from blueprint: NOS, MTR, KG, SET, PR, BOX, PKT, LTR, SQM, PCS, ROLL, RM.

---

## PART 11 — MANUFACTURER ↔ DEALER ↔ PRODUCT MAPPING (NOTE FOR PHASE 3)

Your Answer 2 revealed a many-to-many reality: one manufacturer assigns different products to different dealers; one dealer carries products from multiple manufacturers, with overlaps.

**This does NOT affect material identity** (which is manufacturer-based). It affects the **vendor layer in Phase 3**. Note for Phase 3 vendor design:
- A material (manufacturer + spec) can be sourced from multiple dealers
- Not every dealer carries every product of a manufacturer
- The rate-contract table must support: material → multiple dealers, each with their own price, lead time, and "is authorized dealer for this product" flag
- When raising a PO, the system suggests dealers who actually carry that specific material

This is captured here so the Phase 3 vendor prompts account for it. No action needed in Phase 2 material master.

---

## PART 12 — ADMIN MANAGEMENT SCREENS

Four admin screens make the whole system manageable without code:

### Screen 1 — Category & Profile Manager
- Create/edit categories
- Define category + material-type profiles
- Set image requirement per category

### Screen 2 — Attribute Manager
- Per category+type profile: add/edit/reorder attributes
- Set field type, required, identity, feeds-name, feeds-sku, positions
- Configure conditional visibility rules
- Configure value dependencies
- Clone attributes across profiles (e.g., reuse "Manufacturer" everywhere)

### Screen 3 — Value & Catalog Manager
- Per attribute: add/edit/reorder/deactivate values with short codes
- Manage manufacturer-scoped values
- Bulk import values via CSV
- Merge duplicate values
- Manufacturer catalog management (color/variant/design code→name)
- Excel catalog import

### Screen 4 — Format Builder
- Per category+type: drag-drop attribute order for name and SKU
- Live preview with sample values
- Bulk regenerate codes if format changes (with confirmation)

---

## PART 13 — MATERIAL CREATION USER FLOW

```
STEP 1: Classification
  - Select Category (e.g., Boards & Panels)
  - Select Material Type (e.g., Semi-Finished)
  - System loads the attribute profile for this combination

STEP 2: Attributes (dynamic form)
  - Form renders attributes for this profile
  - Dropdowns populated from admin-managed values
  - Manufacturer-scoped fields filter on manufacturer selection
  - Conditional fields show/hide based on dependencies
  - Auto-fill fields populate from manufacturer catalog
  - Typed fields autocomplete from existing + normalize
  - Live preview of auto-generated Name and SKU updates as fields fill
  - Real-time duplicate check: "exact match exists" (block) or "similar exists" (inform)

STEP 3: UOM & Stock
  - Purchase UOM, Consumption UOM, conversion factor
  - Min/reorder/max stock levels

STEP 4: Image (per category rule)
  - Required categories: must upload (or defer if deferrable)
  - Optional categories: skip allowed

STEP 5: Confirm & Save
  - Review auto-name, auto-SKU, all attributes
  - Save → material created with computed identity
  - Cannot save if exact duplicate
```

---

## PART 14 — HOW THIS CHANGES THE PHASE 2 PROMPTS

When building Phase 2, these prompts implement THIS document instead of the earlier material master design:

- **P2-01 (schema)** — implement the ~16 material-schema tables from Part 3, seed categories/types/UOM
- **P2-02 (material management)** — implement creation flow from Part 13
- **P2-02A (attribute system)** — implement Layers 1-4, the 12 field types, conditional rules, manufacturer-scoping
- **P2-02B (visual + catalog)** — implement images (Part 9), manufacturer catalog + Excel import (Part 8)
- **NEW P2-02C (admin screens)** — implement the four admin management screens from Part 12
- Seed data prompt — load OutDo categories, attribute profiles, values, UOM, manufacturers as seed

The earlier gap analysis prompts (PROMPT_GAP_ANALYSIS.md, GAP_ANALYSIS_ADDENDUM.md) are now SUPERSEDED by this locked design. You don't need to run them — this document is the resolved output.

FORWARD_REFERENCES.md should be updated: material master entries now point to this design lock.

---

## PART 15 — WHAT'S DELIBERATELY DEFERRED (SCOPE BOUNDARIES)

To prevent scope creep during build:

🔄 **Material price history & FIFO costing** → Phase 3 (inventory). Material master holds identity, not stock or cost.
🔄 **Vendor/dealer rate contracts** → Phase 3. Manufacturer is in material master; dealers are in vendor master.
🔄 **Material substitution (primary + alternates)** → Phase 2 BOM (P2-06), not material master itself.
🔄 **Stock levels actual tracking** → Phase 3. Material master defines min/reorder; actual stock is inventory.
🔄 **In-house semi-finished production** → Not needed (your semi-finished is bought-in). If you ever laminate raw boards in-house, revisit.
🔄 **Customer-facing finish selection UI** → Phase 6 (selection list) and Phase 7 (portal). Material master provides the swatch images; the selection experience is built there.
❌ **Material approval workflow before activation** → Out of scope (admin-driven creation is sufficient).
❌ **Parametric/configurator BOM** → Deferred indefinitely (your decision).

---

## PART 16 — VALIDATION CHECKLIST FOR PHASE 2 MATERIAL MASTER

When P2 material master is built, verify:
- [ ] All ~16 material-schema tables exist
- [ ] 12 categories seeded
- [ ] 7 material types seeded
- [ ] Category+type profiles drive different attribute sets (Raw board ≠ Semi-finished board)
- [ ] 12 field types all functional
- [ ] Manufacturer-scoped values filter correctly (color codes by manufacturer)
- [ ] Quality variant mechanism works (Hettich Onsys/Sensys) and is generic (any category can use it)
- [ ] Conditional visibility works (Crank only for Hinges)
- [ ] Value dependencies work (Sub-Type filtered by Hardware Type)
- [ ] Auto-fill from manufacturer catalog works (code → name)
- [ ] SKU always equals uniqueness key (no collision possible)
- [ ] Name and SKU read-only, computed, never typed
- [ ] Duplicate detection blocks exact matches, suggests similar
- [ ] Normalization on typed fields (no whitespace/case duplicates)
- [ ] Image requirement configurable per category
- [ ] Pending-image flag works for deferred uploads
- [ ] Purchase + consumption UOM with conversion
- [ ] "Regular Brand" handles unbranded materials
- [ ] Manufacturer catalog Excel import works (sample download + filled upload)
- [ ] All four admin management screens functional
- [ ] Zero hardcoded values — everything admin-editable
- [ ] OutDo seed data loaded correctly

---

## VERSION HISTORY

| Version | Date | Notes |
|---|---|---|
| 1.0 LOCKED | This session | Foundation locked after OutDo blueprint analysis and 7 rounds of clarification. Manufacturer-based identity, dynamic everything, supersedes earlier material master design and gap analysis prompts. |

**This design is LOCKED. Build Phase 2 material master against it. If a genuine new requirement emerges during build, note it, discuss, update this document to v1.1 — never improvise in code.**

---

**End of Material Master Design Lock.**
