# NEWEIX multi-warehouse fulfillment

## Business and dispatch model

- Business headquarters: Mymensingh.
- Initial dispatch locations: Mymensingh and Dhaka.
- Additional cities can be added as separate warehouses.
- A warehouse represents a physical dispatch origin, not a customer's destination.
- Each warehouse has its own address, contact details and optional Pathao Store ID.

## Phase 1 delivered by this change

- Adds server-only warehouse configuration.
- Seeds Mymensingh as the primary headquarters and Dhaka as a second dispatch location.
- Adds per-product, per-warehouse stock records with on-hand, reserved and reorder quantities.
- Adds an auditable inventory movement ledger.
- Adds order fulfillment and fulfillment-line tables so one order can later be split across warehouses and shipments.
- Adds an Admin → Warehouses & Dispatch screen and an Admin/Supreme-only API.
- Adds a database behavior test for split-origin stock records and server-only privileges.

## Important stock safety rule

The existing `products.stock` field remains unchanged and authoritative for the current checkout flow. The migration intentionally does **not** copy or assign existing product stock to Mymensingh or Dhaka: the database does not know where those units are physically stored. An administrator must reconcile each product's real physical quantities by warehouse before warehouse-aware checkout can be enabled.

The two initial warehouse records have no invented street address or Pathao Store ID. Configure the actual dispatch address, contact details and merchant store ID in Admin → Warehouses & Dispatch before using either origin for courier booking.

## Remaining implementation phases

1. Reconcile legacy stock into warehouse inventory with audited opening-balance operations.
2. Implement atomic stock reservation across one or more warehouses, with automatic origin recommendation and Admin override.
3. Split mixed-origin order lines into separate fulfillment groups and calculate a Pathao quote using the selected origin's Pathao Store ID.
4. Book and track each fulfillment independently; preserve idempotency, payment checks and webhook reconciliation.
5. Add warehouse stock transfers, adjustments, returns/restocking and operational reporting.

Until phases 1–4 are complete and tested, the existing single-order checkout and Pathao booking behavior remains in place. Do not interpret the warehouse setup screen as proof that multi-origin shipping is already live.
