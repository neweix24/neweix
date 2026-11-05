# NEWEIX multi-warehouse fulfillment

## Business and dispatch model

- Business headquarters: Mymensingh.
- Initial dispatch locations: Mymensingh and Dhaka.
- Additional cities can be added as separate warehouses.
- A warehouse represents a physical dispatch origin, not a customer's destination.
- Each warehouse has its own address, contact details and optional Pathao Store ID.

## Foundation and physical stock reconciliation

- Adds server-only warehouse configuration.
- Seeds Mymensingh as the primary headquarters and Dhaka as a second dispatch location.
- Adds per-product, per-warehouse stock records with on-hand, reserved and reorder quantities.
- Adds an auditable inventory movement ledger.
- Adds order fulfillment and fulfillment-line tables so one order can be split across warehouses.
- Adds Admin → Warehouses & Dispatch and an Admin/Supreme-only API.
- Adds a one-time physical opening-balance workflow. It records the counted quantity and evidence note, rejects duplicate opening balances, and never copies legacy `products.stock` into a warehouse.
- Supreme stock operations require MFA.

## Atomic warehouse allocation delivered in this phase

- Adds a service-role-only SQL RPC that can allocate confirmed, processing or packed orders.
- Reserves stock using row locks inside one database transaction.
- Prefers the primary Mymensingh warehouse, then the warehouse with the largest available quantity, then warehouse code for deterministic tie-breaking.
- Splits an order line across warehouses when one location cannot satisfy the full quantity.
- Creates one fulfillment group per warehouse and matching fulfillment-line records.
- Writes one inventory movement ledger entry for every reservation slice.
- If any item is short, the entire transaction rolls back: no partial reservation or fulfillment is left behind.
- Adds an Admin/Supreme-only endpoint at `POST /api/admin/orders/allocate-warehouse` with Supreme MFA enforcement and an allocation control on eligible orders in Admin → Orders.
- Prevents allocation after an existing courier booking.
- Cancelling an allocated order releases all warehouse reservations and marks its unbooked fulfillment groups cancelled in the same order-status transaction; booked/dispatched/delivered fulfillment groups block this release path.
- The endpoint is an explicit admin action; checkout does not call it automatically yet.

## Important stock safety rule

The existing `products.stock` field remains unchanged and authoritative for the current checkout flow. The migration intentionally does **not** copy or assign existing product stock to Mymensingh or Dhaka: the database does not know where those units are physically stored. An administrator must reconcile each product's real physical quantities by warehouse before warehouse-aware checkout can be enabled.

The two initial warehouse records have no invented street address or Pathao Store ID. Configure the actual dispatch address, contact details and merchant store ID in Admin → Warehouses & Dispatch before using either origin for courier booking.

## Remaining implementation phases

1. Add stock adjustment and transfer operations, plus a reconciliation view showing products not yet counted by warehouse.
2. Add admin allocation controls and an override to choose dispatch origin; validate and test allocation edge cases.
3. Integrate warehouse allocation into checkout atomically, without breaking the legacy checkout until every relevant SKU is reconciled.
4. Split mixed-origin orders into separate Pathao quotes and bookings using each warehouse's own Pathao Store ID and address.
5. Track each fulfillment independently, preserving idempotency, payment checks, webhook reconciliation, returns/restocking and operational reporting.

Until checkout and Pathao phases are complete and production configuration is verified, the existing single-order checkout and Pathao booking behavior remains in place. Warehouse setup and the manual allocation endpoint do not mean multi-origin shipping is live.
