# FORWARD REFERENCES — MASTER FEATURE INDEX

**Version:** 1.0.1
**Purpose:** Single source of truth for which prompt builds which feature across all 8 phases.

> **v1.0.1 patch note:** This is a minimal patch. Only two things changed from v1.0: (1) the material master references now point to MATERIAL_MASTER_DESIGN_LOCK.md as the authoritative design, and (2) the superseded gap-analysis files are marked. The Phase 2+ feature detail will be fully re-synced to v1.1 when PROMPTS_P2.md is regenerated. For Phase 0 and Phase 1 builds (your current work), everything in this file is accurate.

---

## DOCUMENT STATUS — WHICH SPEC FILES ARE CURRENT

| File | Status | Use it? |
|---|---|---|
| ERP_SPEC.md | Master plan | Yes — reference |
| FORWARD_REFERENCES.md | This file (v1.0.1) | Yes — scope radar |
| MATERIAL_MASTER_DESIGN_LOCK.md | **Authoritative for material master** | Yes — Phase 2 implements this |
| PROMPTS_P0.md | Current (v2.0) | Yes — built |
| PROMPTS_P1.md | Current (v2.0) | Yes — build next |
| PROMPTS_P2.md (old) | **Will be regenerated to v2.0 before Phase 2 build** | Wait — do not build from old version |
| PROMPTS_P3.md (old) | **Will be regenerated to v2.0 before Phase 3 build** | Wait |
| PROMPTS_P4.md (old) | **Will be regenerated to v2.0 before Phase 4 build** | Wait |
| PHASES_2345_ADDENDUM_MATERIAL_PLANNING.md | Will fold into regenerated P2/P3/P4 | Reference only |
| PROMPTS_P5.md | Current (recent) | Yes — when reached |
| PROMPTS_P6.md | Current (recent) | Yes — when reached |
| PROMPT_GAP_ANALYSIS.md | **SUPERSEDED by MATERIAL_MASTER_DESIGN_LOCK.md** | No — do not use |
| GAP_ANALYSIS_ADDENDUM.md | **SUPERSEDED by MATERIAL_MASTER_DESIGN_LOCK.md** | No — do not use |
| PHASE2_ADDENDUM.md | **SUPERSEDED — will fold into regenerated P2** | No — do not use |

---

## HOW TO USE THIS FILE

**For YOU (Rahul):**
Whenever you feel the urge to enhance something during a build session, search this file first. If the feature is listed under a future phase, **stop pushing**. The current build is correct as-is. Trust the plan.

**For Claude Code:**
At the start of every prompt session, Claude Code is instructed to consult this file before agreeing to any scope expansion. If a user-requested feature is listed for a future phase, Claude Code refuses politely and points to the planned location.

**Triggers to check this file:**
- "Why doesn't this also do X?"
- "Should we add Y here?"
- "Can we extend this to handle Z?"
- "It would be useful if this also..."
- Any feeling that something is "incomplete"

**Status legend:**
- ✅ Built or specified — phase + prompt assigned
- 🔄 Future phase — wait
- ❌ Out of scope entirely — not planned
- ⚠️ Discuss with Rahul before building (controversial or needs decision)

---

## DOMAIN 1 — FOUNDATION (Phase 0)

### Authentication & Identity
- ✅ Username/password login → P0-05
- ✅ JWT access tokens + refresh tokens → P0-05
- ✅ Session management (multi-device) → P0-05
- ✅ Password hashing (bcrypt) → P0-05
- ✅ Password breach checking → P0-05
- ✅ Account lockout after failed attempts → P0-05
- ✅ Multi-Factor Authentication (TOTP) → P0-19
- ✅ OAuth 2.0 / OpenID Connect foundation → P0-19
- ✅ Forgot password flow → P0-05
- ✅ Password reset via email → P0-05
- 🔄 Social login (Google/Microsoft) → Phase 7 (when customer portal launches public sign-up)
- 🔄 Single Sign-On (SSO) for enterprise customers → Phase 8 if needed
- ❌ Biometric authentication on mobile → Out of scope

### Authorization (RBAC)
- ✅ Module-level access → P0-06
- ✅ Feature-level access within modules → P0-06
- ✅ Action-level permissions (view/create/edit/delete/approve) → P0-06
- ✅ Field-level visibility per role → P0-13
- ✅ Data-level (row) access control → P0-06
- ✅ User-specific permission overrides → P0-06
- ✅ Permission resolver (6-level hierarchy) → P0-06
- 🔄 Time-based access (e.g., access only during work hours) → Phase 8 if needed
- ❌ IP-based access restrictions → Out of scope

### Organization Structure
- ✅ Single organization (your company) → P0-11
- ✅ Multiple branches/factories → P0-11
- ✅ Departments → P0-11
- ✅ Designations → P0-11
- ✅ Branch-level data isolation rules → P0-11
- ❌ Multi-tenancy (multiple companies on one system) → Out of scope (you're not a SaaS provider)

### Module Management
- ✅ Module registry → P0-07
- ✅ Module enable/disable → P0-07
- ✅ Core vs Bypassable flag → P0-07
- ✅ Module dependency tracking → P0-07
- ✅ Module activation history → P0-07
- ✅ Company growth path (recommended activation order) → P0-07

### Workflow Engine
- ✅ Generic workflow definitions → P0-08
- ✅ Workflow steps with assignees → P0-08
- ✅ Conditional routing → P0-08
- ✅ Module bypass logic (auto-skip when target module disabled) → P0-08
- ✅ Workflow instance tracking → P0-08
- ✅ Action audit trail → P0-08
- ✅ Workflow visualization (admin UI) → P0-14

### Audit & Compliance
- ✅ Audit log table → P0-09
- ✅ Auto-logging on all CRUD → P0-09
- ✅ Login/logout audit → P0-09
- ✅ Failed access attempt audit → P0-09
- ✅ Permission change audit → P0-09
- ✅ DPDP Act 2023 — consent capture → P0-19
- ✅ DPDP Act 2023 — privacy policy management → P0-19
- ✅ DPDP Act 2023 — data export on user request → P0-19
- ✅ DPDP Act 2023 — right to erasure → P0-19
- 🔄 GDPR compliance (if European customers) → Phase 7 if needed
- ❌ SOC 2 / ISO 27001 → Out of scope (not building for that compliance level)

### Communication Module
- ✅ Email provider abstraction (SMTP/SendGrid/SES/Mailgun) → P0-15
- ✅ SMS provider abstraction (MSG91/Twilio/Gupshup) → P0-16
- ✅ WhatsApp BSP abstraction (Interakt/Wati/Gupshup/360Dialog) → P0-17
- ✅ Template management (per channel) → P0-15, P0-16, P0-17
- ✅ Multi-channel send (one template, multiple channels) → P0-15
- ✅ Delivery tracking → P0-15, P0-16, P0-17
- ✅ Notification log → P0-15
- 🔄 Email open tracking → Phase 6, P6-24 (CRM module)
- 🔄 WhatsApp inbound message handling → Phase 6, P6-24
- 🔄 Email campaigns / mass mailing → Phase 8 if marketing module needed
- ❌ Voice call integration → Out of scope

### Payment Foundation
- ✅ Payment transactions table → P0-20
- ✅ Razorpay integration foundation → P0-20
- ✅ Offline payment recording (UTR/cheque/cash) → P0-20
- ✅ Payment status tracking → P0-20
- 🔄 Payment milestone enforcement on dispatch → Phase 5, P5-06
- 🔄 Auto-billing post-installation → Phase 5, P5-17
- 🔄 Online payment via customer portal → Phase 7
- 🔄 Refunds and reverse payments → Phase 5, P5-16 (returns) and Phase 8 (finance)

### Customer Portal Foundation (NOT functional screens)
- ✅ customer_accounts table → P0-21
- ✅ customer_users table → P0-21
- ✅ External user authentication → P0-21
- ✅ Self-signup with admin approval → P0-21
- ✅ Portal user RBAC → P0-21
- 🔄 Product catalog browsing → Phase 7
- 🔄 Order placement screens → Phase 7
- 🔄 Order tracking screens → Phase 7
- 🔄 Quote viewing & acceptance → Phase 6, P6-22

### Document Management Foundation
- ✅ core.documents table → P0-04
- ✅ File upload/download API → P0-12
- ✅ Document versioning foundation → P0-12
- ✅ Document type classification → P0-12
- 🔄 Full document management (expiry alerts, renewal workflows) → Phase 8

### Numbering Series
- ✅ Configurable numbering series engine → P0-04
- ✅ Per-document type numbering (ORD, INV, etc.) → P0-04
- ✅ Year-based reset → P0-04
- ✅ Branch-prefix support → P0-04

### Master Data
- ✅ Country, state, city → P0-04
- ✅ HSN code master → P0-04
- ✅ Tax rate master (GST slabs) → P0-04
- ✅ UOM master → P0-04
- ✅ Currency master → P0-04
- ✅ Bank master → P0-04

### System Settings
- ✅ Settings registry → P0-04
- ✅ Settings UI for admin → P0-14
- 🔄 User-level preferences → Phase 7

### Custom Fields Framework
- ✅ Custom field definitions → P0-04
- ✅ Custom field values storage → P0-04
- ⚠️ Custom field UI rendering — Limited to Phase 0 admin only initially. Module-specific custom field rendering happens in respective phases.

---

## DOMAIN 2 — ORDER ENTRY & MASTERS (Phase 1)

### Customer Master
- ✅ Customer CRUD → P1-02
- ✅ Multiple addresses per customer → P1-02
- ✅ Multiple contacts per customer → P1-02
- ✅ Customer tier classification → P1-02
- ✅ GST/PAN capture → P1-02
- ✅ Bank details for refunds → P1-02
- ✅ CSV import → P1-09
- 🔄 Customer 360-degree view → Phase 6, P6-02 (CRM)
- 🔄 Customer activity timeline → Phase 6, P6-05
- 🔄 Customer segmentation → Phase 6, P6-16
- 🔄 Customer hierarchy (architect → end customer) → Phase 6, P6-02

### Product Master
- ✅ Product CRUD → P1-03
- ✅ Product categories → P1-03
- ✅ Standard size variants → P1-03
- ✅ Tier-based pricing → P1-03
- ✅ HSN code linkage → P1-03
- ✅ Product images → P1-03
- ✅ Installation required flag → P1-03
- ✅ Warranty period → P1-03
- ✅ CSV import → P1-09
- 🔄 BOM linkage → Phase 2, P2-06
- 🔄 Product configurator (parametric pricing) → Future enhancement (deferred indefinitely)
- 🔄 Product cost tracking → Phase 2, P2-09

### Order Management (Core)
- ✅ Order CRUD → P1-04
- ✅ Multi-product orders → P1-04
- ✅ Size variants on order lines → P1-05
- ✅ Custom items on order lines → P1-05
- ✅ Charge lines (transport, installation) → P1-05
- ✅ Multiple delivery addresses per order → P1-04
- ✅ Tax calculation (CGST+SGST or IGST) → P1-05
- ✅ Order status workflow → P1-06
- ✅ CSV import for orders → P1-09
- 🔄 Order from quote auto-conversion → Phase 6, P6-15
- 🔄 Order from customer portal → Phase 7
- 🔄 Order amendment/revision workflow → Phase 6 (handles via quote revision)
- 🔄 Production planning trigger from order → Phase 4, P4-04A
- 🔄 Material requirement calculation → Phase 2, P2-08 (theoretical) + Phase 4, P4-04B (planned)

### Payment Terms
- ✅ Payment term templates → P1-07
- ✅ Milestone definition (% advance, % before dispatch, % after install) → P1-07
- ✅ Per-order payment schedule generation → P1-07
- ✅ Payment recording → P1-07
- 🔄 Payment milestone enforcement on dispatch → Phase 5, P5-06
- 🔄 Auto-bill generation post-install → Phase 5, P5-17
- 🔄 Customer payment via portal → Phase 7

### Document Generation
- ✅ Proforma Invoice → P1-08
- ✅ Sales Order Confirmation → P1-08
- ✅ Tax Invoice (GST compliant) → P1-08
- ✅ Payment Receipt → P1-08
- 🔄 Delivery Challan → Phase 5, P5-07
- 🔄 Packing List → Phase 5, P5-07
- 🔄 Installation Certificate → Phase 5, P5-13
- 🔄 Warranty Card → Phase 5, P5-13
- 🔄 E-Way Bill → Phase 5, P5-08
- 🔄 Credit Note / Debit Note → Phase 8 (finance module) or as gap-fix between Phase 5 and 7
- 🔄 Advance Receipt Voucher → Phase 8 (finance module)
- 🔄 E-Invoice (IRN/QR via NIC portal) → Phase 8 (finance module — only when turnover > ₹5 cr)

---

## DOMAIN 3 — PRODUCT ENGINEERING (Phase 2)

### Material Master (Attribute-Based)
> **NOTE: The authoritative design for the entire material master is MATERIAL_MASTER_DESIGN_LOCK.md.** The pointers below are indicative; exact prompt numbers will be finalized when PROMPTS_P2.md is regenerated to v2.0. Manufacturer-based identity, brand-scoped values, manufacturer catalog, and 7 material types are all defined in the design lock. The old "P2-02A post gap analysis" references are obsolete — the gap analysis is superseded by the design lock.
- ✅ Material categories (admin-managed) → Phase 2 (per design lock)
- ✅ Material types: Raw/Semi-Finished/Finished/Packaging/Consumables/Spare Parts/MRO → Phase 2
- ✅ Attribute templates per category+type profile (Raw board ≠ Semi-finished board) → Phase 2
- ✅ 12 attribute field types (incl. image-as-value) → Phase 2
- ✅ Manufacturer-based identity (brand = manufacturer, NOT dealer) → Phase 2
- ✅ Manufacturer-scoped values (color codes, quality variants like Hettich Onsys/Sensys) → Phase 2
- ✅ Manufacturer Catalog Master with Excel import (code→name auto-fill) → Phase 2
- ✅ Auto-generated material code (SKU) from identity attributes → Phase 2
- ✅ Auto-generated material name from attributes → Phase 2
- ✅ Duplicate detection by attribute hash (SKU always = uniqueness key) → Phase 2
- ✅ Conditional attribute visibility & value dependencies → Phase 2
- ✅ Category-configurable image requirement (required/optional/deferrable) → Phase 2
- ✅ Visual selection (swatch images) → Phase 2
- ✅ Purchase UOM + consumption UOM with conversion → Phase 2
- ✅ "Regular Brand" for unbranded materials → Phase 2
- ✅ CSV import with attribute validation → Phase 2
- 🔄 Material price history → Phase 3 (vendor rate contracts)
- 🔄 FIFO costing layer → Phase 3
- 🔄 Material substitution (primary + alternates) → Phase 2 BOM, not material master
- 🔄 Manufacturer↔dealer↔product many-to-many mapping → Phase 3 (noted in design lock Part 11)
- ❌ Material approval workflow before activation → Out of scope (admin-driven)
- ❌ Parametric/configurator BOM → Deferred indefinitely

### Process Master
- ✅ Process types (cutting, edge banding, drilling, etc.) → P2-05
- ✅ Process cost rates → P2-05
- ✅ Default process times (estimated) → P2-05
- 🔄 Actual process time tracking → Phase 4 (when machines record)
- 🔄 Job work outsource processes → P2-05 (definition); Phase 4 (execution)

### BOM Management
- ✅ BOM creation per product → P2-06
- ✅ BOM with material lines → P2-06
- ✅ Primary + alternate materials per line → P2-06
- ✅ Wastage % per line → P2-06
- ✅ BOM with process lines → P2-06
- ✅ BOM versioning → P2-06
- ✅ Lock BOM version at production start (not "always latest") → P2-06
- ✅ Multi-level BOM (sub-assemblies) → P2-06
- ✅ BOM purpose flag (estimation_and_po) → P2-06 (per addendum)
- 🔄 Selection List workflow (resolve generic BOM to specific SKUs) → P2-07
- 🔄 BOM resolution engine (template → resolved per order) → P2-08
- 🔄 BOM-derived theoretical material requirement → P2-08
- 🔄 Nesting-derived planned requirement → Phase 4, P4-04B
- 🔄 BOM cost calculation → P2-09
- ❌ Parametric BOM with formulas (configurator) → Deferred indefinitely

### Costing & Pricing
- ✅ Material cost rollup from BOM → P2-09
- ✅ Labor/process cost addition → P2-09
- ✅ Overhead allocation → P2-09
- ✅ Margin calculation → P2-09
- ✅ Selling price computation → P2-09
- 🔄 Customer-tier pricing override → Phase 6, P6-09 (margin rules engine)
- 🔄 Volume-based discount slabs → Phase 6, P6-09
- 🔄 Project-specific negotiated pricing → Phase 6, P6-09

---

## DOMAIN 4 — SUPPLY CHAIN (Phase 3)

### Vendor Master
- ✅ Vendor CRUD → P3-02
- ✅ Multiple contacts per vendor → P3-02
- ✅ Multiple addresses per vendor → P3-02
- ✅ Bank details → P3-02
- ✅ Payment terms with vendor → P3-02
- ✅ Vendor rating → P3-02
- ✅ Vendor-material rate contracts → P3-02
- ✅ Foreign currency support (for China imports) → P3-02
- ✅ Import-specific fields (IEC, port, incoterms) → P3-02
- 🔄 Vendor performance scoring (auto-calculated) → Phase 8
- 🔄 Vendor portal (their own login) → Out of scope unless requested

### Storage & Locations
- ✅ Factory store + warehouse → P3-03
- ✅ Rack/shelf/bin numbering → P3-03
- ✅ General storage areas → P3-03
- ✅ Location-wise stock view → P3-09

### Purchase Requisitions
- ✅ PR auto-generation from BOM → P3-04
- ✅ PR consolidation across orders → P3-04
- ✅ Manual PR creation → P3-04
- 🔄 PR from production job (planned, not theoretical) → Phase 4, P4-04C (per addendum)

### Purchase Orders
- ✅ PO CRUD → P3-05
- ✅ Multi-level approval based on value → P3-05
- ✅ PO sent via email/WhatsApp → P3-05
- ✅ PO acknowledgement tracking → P3-05
- ✅ PO status workflow → P3-05
- 🔄 Vendor portal acknowledgement → Out of scope unless requested

### Import Tracking
- ✅ Container number tracking → P3-06
- ✅ Vessel/Bill of Lading → P3-06
- ✅ Bill of Entry capture → P3-06
- ✅ Customs duty + IGST capture → P3-06
- ✅ CHA charges → P3-06
- ✅ Landed cost allocation → P3-06
- 🔄 Real-time vessel tracking integration → Out of scope (manual updates fine)

### Goods Receipt (GRN)
- ✅ GRN against PO → P3-07
- ✅ Quantity tolerance check → P3-07
- ✅ Rate matching → P3-07
- ✅ Multi-vehicle receipt → P3-07

### Quality Check (Bypassable)
- ✅ QC parameters per material → P3-08
- ✅ Pass/fail with photos → P3-08
- ✅ Reject and return flow → P3-08
- ✅ Conditional acceptance → P3-08
- ✅ Module bypass support → P3-08

### Inventory Management
- ✅ FIFO costing → P3-09
- ✅ Stock movements (inward/outward/transfer/adjustment) → P3-09
- ✅ Multi-location stock → P3-09
- ✅ Reorder alerts → P3-09
- ✅ Soft + hard reservations → P3-09 (per addendum)
- 🔄 Stock count / physical verification → P3-11
- 🔄 Reverse logistics inventory updates → Phase 5, P5-16

### Material Issue
- ✅ Material requisition → P3-10
- ✅ Approval workflow → P3-10
- ✅ Issue with bin picking → P3-10
- ✅ Material return from production → P3-10
- ✅ MIN driven by Production Job + Nesting Run → P3-10 (per addendum)

---

## DOMAIN 5 — PRODUCTION (Phase 4)

### Production Job (per addendum)
- ✅ Job creation grouping orders → P4-04A
- ✅ Job lifecycle (draft → nesting → planned → in_progress → completed) → P4-04A
- ✅ Order line locking on plan approval → P4-04A
- ✅ New order = new job (late additions) → P4-04A

### Nesting Run (per addendum)
- ✅ Spazio cut list import → P4-04B
- ✅ B-Opti optimization output import → P4-04B
- ✅ Per-material theoretical vs planned summary → P4-04B
- ✅ Multiple versions per job → P4-04B
- ✅ Approval workflow → P4-04B
- ✅ Cost snapshot at planning → P4-04B
- 🔄 Direct Spazio API integration → Out of scope (file-based is fine)

### Cost Allocation (per addendum)
- ✅ Pro-rata by panel area → P4-04D
- ✅ Per-order cost rollup at job completion → P4-04D
- ❌ Variance reporting → Out of scope (per your decision)
- ❌ Actual consumption tracking → Out of scope (per your decision)

### Three Production Tracks
- ✅ Wooden track (Spazio → Pressing/Beam Saw → Edge Banding → CNC → Sorting → Cleaning → Assembly) → P4-05 to P4-12
- ✅ Aluminium track (drawings → cutlist → Panel Saw → Beam Saw for wooden parts) → P4-13
- ✅ MS metal track (drawings → cutlist → outsource laser → Pipe Cutting → Punching → Welding → Nut Insert → Powder Coating outsource) → P4-14
- ✅ Track convergence at assembly → P4-15

### Panel Master & QR Tracking
- ✅ Panel master with unique QR → P4-07
- ✅ QR sticker printing at cutting → P4-07
- ✅ Panel-to-sheet linkage (cost traceability) → P4-07
- ✅ Smartphone scanning at every station → P4-08
- ✅ Offline scan queue → P4-08
- ✅ Per-station progress tracking → P4-08

### Process Stations & Machines
- ✅ Station definition per track → P4-06
- ✅ Machine master (basic, no detailed utilization) → P4-06
- ✅ Operator assignment → P4-08
- 🔄 Machine utilization tracking → Phase 8
- 🔄 Preventive maintenance scheduling → Phase 8 (asset management module)

### Job Work Outsourcing
- ✅ Outsource process types → P4-09
- ✅ Material sent to vendor → P4-09
- ✅ Material received from vendor → P4-09
- ✅ Three job work types (powder coating, glass, MS sheet laser) → P4-09
- ✅ Vendor performance per job → P4-09

### In-Process QC (Bypassable)
- ✅ Optional QC per station → P4-10
- ✅ Pass/fail/rework decision → P4-10
- ✅ Rework with reason tracking → P4-10
- ✅ Scrap tracking → P4-10
- ✅ Auto-create replacement panel → P4-10

### Production Dashboard
- ✅ Live floor view → P4-11
- ✅ Per-station counts → P4-11
- ✅ Bottleneck identification → P4-11
- ✅ Alert system → P4-11

---

## DOMAIN 6 — DISPATCH & POST-PRODUCTION (Phase 5)

### Finished Goods
- ✅ FG staging area → P5-02
- ✅ Auto-create FG from completed production → P5-02
- ✅ Status tracking → P5-02

### Packaging
- ✅ Packing job creation → P5-03
- ✅ Flexible packer-driven boxing → P5-03
- ✅ Box QR generation → P5-03
- ✅ Panel-to-box scanning → P5-03
- ✅ Box dimensions/weight capture → P5-03
- ✅ Packing verification (completeness) → P5-04
- ✅ Supervisor override → P5-04

### Transporter & Vehicle Master
- ✅ Transporter CRUD → P5-05
- ✅ Vehicle (own fleet) CRUD → P5-05
- ✅ Driver master → P5-05

### Dispatch
- ✅ Dispatch creation → P5-06
- ✅ Pre-dispatch payment check (soft warning) → P5-06
- ✅ Manager override flow → P5-06
- ✅ Multi-shipment per order → P5-06
- ✅ Delivery challan PDF → P5-07
- ✅ Packing list PDF → P5-07
- ✅ E-Way Bill (manual entry, > ₹50,000) → P5-08
- 🔄 E-Way Bill API integration → Future (when monthly volume justifies)

### Delivery Tracking
- ✅ Manual status milestones → P5-09
- ✅ LR tracking → P5-09
- ✅ POD photo capture → P5-10
- 🔄 GPS tracking integration → Out of scope unless requested
- 🔄 Real-time customer notifications via portal → Phase 7

### Installation
- ✅ Auto-schedule on delivery → P5-11
- ✅ Per-product installation readiness (partial delivery support) → P5-11
- ✅ Team assignment (own + contractor) → P5-11
- ✅ Mobile site verification (box + panel scanning) → P5-12
- ✅ Photo documentation → P5-13
- ✅ Customer sign-off (digital signature/OTP/photo) → P5-13
- ✅ Installation certificate auto-gen → P5-13
- ✅ Warranty card auto-gen → P5-13

### Snag List (Bypassable)
- ✅ Snag creation by customer/installer/internal → P5-14
- ✅ 7-day SLA tracking → P5-14
- ✅ Resolution actions (site visit / replacement / rework) → P5-15
- ✅ Customer acceptance flow → P5-15
- ✅ Final order sign-off → P5-15

### Returns / Reverse Logistics
- ✅ RMA workflow → P5-16
- ✅ Pickup scheduling → P5-16
- ✅ Inspection at receipt → P5-16
- ✅ Disposition routing (refurbish/scrap/replace/credit) → P5-16

---

## DOMAIN 7 — CRM, RFQ, QUOTATION (Phase 6)

### Contact Hierarchy
- ✅ Unified contact master → P6-02
- ✅ Architect/dealer parent + end-customer children → P6-02
- ✅ Duplicate detection respecting hierarchy → P6-02
- ✅ Multiple addresses, team members → P6-02

### Lead Management
- ✅ Lead capture (web/WhatsApp/manual/CSV) → P6-03
- ✅ Custom pipeline stages (with BOQ Received, Floor Plan Shared) → P6-03
- ✅ Lead scoring → P6-16
- ✅ Auto-assignment rules → P6-04

### CRM Activities
- ✅ Activity logging (call/email/WhatsApp/meeting/site visit) → P6-05
- ✅ Merged timeline view → P6-05
- ✅ Drawings/BOQ artifact tracking with versions → P6-06
- ✅ Followups with auto-aging → P6-07

### RFQ (Bypassable)
- ✅ Two tracks: regular vs project → P6-08
- ✅ Engineering review → P6-08
- ✅ Costing estimation → P6-08
- ✅ RFQ to quote conversion → P6-08

### Quotation
- ✅ Four-tier margin engine → P6-09
- ✅ Quote builder (catalog/BOM/custom/charge lines) → P6-10
- ✅ Multi-version with diff view → P6-11
- ✅ Approval matrix (value + margin) → P6-12
- ✅ PDF generation → P6-13
- ✅ Multi-channel send with tracking → P6-13
- ✅ Negotiation/acceptance/rejection → P6-14
- ✅ Auto-conversion to order → P6-15
- ✅ Email/WhatsApp tracking → P6-24

### Migration
- ✅ CSV import for contacts/activities → P6-17
- ✅ Old CRM as read-only history → P6-17

---

## DOMAIN 8 — CUSTOMER PORTAL (Phase 7) — NOT YET SPECIFIED IN DETAIL

Foundation built in Phase 0; functional screens deferred.

- 🔄 Product catalog browsing → Phase 7
- 🔄 Catalog search & filters → Phase 7
- 🔄 Customer-specific pricing display → Phase 7
- 🔄 Online order placement → Phase 7
- 🔄 Quote request submission → Phase 7 (lighter than P6's full RFQ)
- 🔄 Order tracking (production progress) → Phase 7
- 🔄 Dispatch & delivery tracking → Phase 7
- 🔄 Installation scheduling/reschedule → Phase 7
- 🔄 Document downloads → Phase 7
- 🔄 Online payment center → Phase 7
- 🔄 Communication center → Phase 7
- 🔄 Snag submission → Phase 7

---

## DOMAIN 9 — HR, FINANCE, ANALYTICS (Phase 8) — NOT YET SPECIFIED IN DETAIL

Specs to be produced just-in-time when you reach 80% of Phase 6.

### Human Resources
- 🔄 Employee master (full HR, beyond just system users) → Phase 8
- 🔄 Attendance tracking → Phase 8
- 🔄 Leave management → Phase 8
- 🔄 Basic payroll (salary structure, PF/ESI/TDS, payslips) → Phase 8
- 🔄 Employee documents → Phase 8
- ❌ Recruitment management → Out of scope
- ❌ Performance appraisal system → Out of scope (initially)

### Finance & Accounting
- 🔄 Chart of accounts → Phase 8
- 🔄 Journal entries auto-posted from operations → Phase 8
- 🔄 Bank reconciliation → Phase 8
- 🔄 GST returns data prep (GSTR-1, GSTR-3B) → Phase 8
- 🔄 P&L statement → Phase 8
- 🔄 Balance sheet → Phase 8
- 🔄 Receivables aging → Phase 8
- 🔄 Payables aging → Phase 8
- 🔄 Credit notes / debit notes → Phase 8
- 🔄 E-Invoice integration → Phase 8
- 🔄 Advance receipt vouchers → Phase 8
- 🔄 TDS handling → Phase 8

### Document Management
- 🔄 Central repository beyond order-level → Phase 8
- 🔄 Version control → Phase 8
- 🔄 Expiry alerts → Phase 8
- 🔄 Compliance document tracking → Phase 8

### Asset Management
- 🔄 Fixed asset register → Phase 8
- 🔄 Depreciation calculation → Phase 8
- 🔄 Maintenance tracking → Phase 8
- 🔄 Asset disposal → Phase 8

### After-Sales / AMC
- 🔄 AMC contracts → Phase 8
- 🔄 Service requests → Phase 8
- 🔄 Technician scheduling → Phase 8
- 🔄 AMC renewal reminders → Phase 8

### Analytics & Reporting
- 🔄 Executive dashboard with cross-module KPIs → Phase 8
- 🔄 Custom report builder → Phase 8
- 🔄 Scheduled report email delivery → Phase 8
- 🔄 Predictive analytics → Out of scope (start with descriptive)

---

## SCOPE PROTECTION RULES

**Rule 1 — Always check this file before scope expansion.**
Search for the feature name. If found under a future phase, do not expand scope.

**Rule 2 — Claude Code must refuse out-of-scope work.**
Every prompt has a SCOPE BOUNDARIES section at the end. Claude Code must read it. When user requests something out of scope, response template:
> "That feature is planned for [Phase X, Prompt PX-NN]. Adding it here will create incomplete functionality dependent on tables/services not yet built. Recommend deferring. Continue with current Phase Y scope?"

**Rule 3 — New features (not in this list) need discussion before building.**
If you (Rahul) think of a feature not listed here, do NOT add it during a build session. Note it in `FUTURE_CHANGES.md` (a notepad file you maintain). Discuss with me here at the next planning checkpoint. I'll either:
- Slot it into an existing phase (with prompt update)
- Add a new prompt at end of a phase
- Add it to "Out of Scope" with justification

**Rule 4 — Only ONE override path: explicit + logged.**
If you absolutely must add an out-of-scope feature mid-build, the rule is:
- You explicitly say to Claude Code: "Override scope protection. Add this feature as an exception. I accept that this may break future phases."
- Claude Code logs the override in the commit message: `[P0-XX-OVERRIDE] Feature added outside scope, may need future cleanup`
- Use this only for genuine emergencies (e.g., regulatory compliance requirement discovered mid-build)

**Rule 5 — Forward References update with each phase delivery.**
When Phase 7 specs are delivered, this file gets updated with all Phase 7 details. When Phase 8 is delivered, same. Always pull the latest version of this file before starting a build session.

---

## VERSION HISTORY

| Version | Date | Changes |
|---|---|---|
| 1.0 | Initial | Complete feature index for Phases 0-6 with placeholder for Phases 7-8 |
| 1.0.1 | This patch | Added Document Status table; repointed material master section to MATERIAL_MASTER_DESIGN_LOCK.md; marked gap-analysis files and PHASE2_ADDENDUM as superseded; flagged P2/P3/P4 old prompts as pending regeneration. No change to Phase 0 or Phase 1 entries. |

**Next update (v1.1):** When PROMPTS_P2.md is regenerated to v2.0 (before Phase 2 build). At that point, finalize exact Phase 2 prompt numbers, fully re-sync material/BOM/production sections, and fold in the material planning addendum. Phase 7 detail added after Phase 5 build; Phase 8 detail after Phase 6 build.

---

**End of Forward References.**
