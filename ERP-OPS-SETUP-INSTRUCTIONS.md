# ERP → OPS Proforma Integration — Setup Instructions

## What this does

When an order is confirmed in the ERP, it automatically sends the proforma invoice line items (description, qty, price, HSN, tax) to OPS. OPS stores them against the project and shows them in the Selection module.

## Steps

### Step 1: Pull latest ERP code

```bash
cd <path-to-erp-repo>
git checkout phase3-supply-chain
git pull origin phase3-supply-chain
```

### Step 2: Add environment variables

Open the `.env` file in the ERP root directory and add these two lines at the bottom:

```
OPS_WEBHOOK_URL=https://outdostudio.in/ops
OPS_WEBHOOK_SECRET=<secret>
```

For the secret value — use the same value that is configured in OPS settings as `sales_app_webhook_secret`. Ask Rahul for this value if you don't have it.

### Step 3: Restart the ERP server

```bash
# If running with npm/node directly:
npm run dev
# Or restart whatever process manager is running the ERP backend
```

### Step 4: Test

1. Open the ERP in browser
2. Go to any order that has line items
3. Click "Confirm" on a draft order (this triggers the webhook automatically)
4. OR use the manual trigger — send this API call:
   ```
   POST /api/orders/<order-id>/send-to-ops
   ```
5. Check OPS — open the corresponding project → Selection tab
6. The order items should appear under "Order Items (from ERP)"

## What was changed (for reference)

| File | Change |
|------|--------|
| `backend/src/services/ops-integration.ts` | NEW — sends order lines to OPS via HMAC-signed webhook |
| `backend/src/services/orders.ts` | Calls `sendProformaToOps()` after `confirmOrder()` |
| `backend/src/routes/orders.ts` | Added `POST /:id/send-to-ops` manual trigger |
| `backend/src/config/env.ts` | Added `OPS_WEBHOOK_URL` + `OPS_WEBHOOK_SECRET` optional env vars |
| `.env.example` | Documented the new env vars |

## Troubleshooting

- **Webhook not firing**: Check that both `OPS_WEBHOOK_URL` and `OPS_WEBHOOK_SECRET` are set in `.env`. If either is missing, the webhook silently skips.
- **OPS returns 401**: The secret doesn't match. OPS checks `erp_webhook_secret` first, then falls back to `sales_app_webhook_secret`.
- **OPS returns "no_matching_project"**: The order doesn't have a corresponding project in OPS yet. The CRM/Sales Module needs to have sent the `order_converted` webhook first to create the project.
- **Items not showing in Selection tab**: Check that the migration ran on OPS (`project_order_items` table must exist). Coolify auto-deploy should handle this.
