# Data Model: Order Lifecycle Completion (053)

**Date**: 2026-08-26 · **Migration**: one forward-only file, `<timestamp>_order_lifecycle_completion.sql`

House style (007/009/019/020/027/047/049): everything operational in `public`; raw SQL; text `CHECK`
enums (no native PG enums, no triggers); an index on every FK; `numeric` only for money; `COMMENT ON`
everything.

---

## 1. `public.carrier_handoff` — new

One row per package that left Effy's care for an outside carrier.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `shop_fulfillment_id` | `uuid` NOT NULL → `public.shop_fulfillment(id)` ON DELETE RESTRICT | **`UNIQUE`** — a package is handed over once. |
| `reference` | `text` NULL | The carrier's consignment/tracking reference **where known**. ⚠ NULL is an ordinary, complete state (FR-003), never a gap. Never shown to a customer (FR-022). |
| `carrier_name` | `text` NULL | Free text. There is no carrier table because there is no carrier contract (research R11); modelling one would invent the operator's decision. |
| `handed_over_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `recorded_by_sub` | `text` NOT NULL | The back-office subject who recorded it. No FK across to `admin.staff` — a snapshot, matching 046's `staff_sub`. |
| `note` | `text` NULL | |

- `UNIQUE (shop_fulfillment_id)` — makes a double handover unrepresentable rather than merely refused.
- Index on `shop_fulfillment_id` is the unique index.

**Why a table and not a status**: research R3.

---

## 2. `public.package_arrival` — new

One row per package that reached the customer, **whatever route it took**.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `shop_fulfillment_id` | `uuid` NOT NULL → `public.shop_fulfillment(id)` ON DELETE RESTRICT | **`UNIQUE`** — the database refuses a second arrival (FR-005), independently of the code. |
| `arrived_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `source` | `text` NOT NULL CHECK IN (`driver_proof`, `staff_recorded`, `carrier_signal`) | **FR-008.** `carrier_signal` is declared and unused — it is the seat FR-009 reserves so a future carrier integration is a new value, not a new design. |
| `recorded_by_sub` | `text` NULL | The staff subject for `staff_recorded`; NULL for `driver_proof` (the driver is attributable through `proof_of_delivery` / `delivery_task`). |
| `delivery_task_id` | `uuid` NULL → `public.delivery_task(id)` ON DELETE SET NULL | Set for `driver_proof`, so a same-day arrival still points at its proof. |

- `UNIQUE (shop_fulfillment_id)`; index on `delivery_task_id`.
- **CHECK**: `source = 'staff_recorded'` ⇒ `recorded_by_sub IS NOT NULL`. An unattributable staff
  assertion must be unrepresentable (SC-010).

**⚠ The existing driver path must write this row** (research R6). Without that, every same-day arrival —
the only kind the platform has ever recorded — is unattributable and SC-010 is false.

---

## 3. `public.notification_request` — altered

| Change | Notes |
|---|---|
| `+ channel text NOT NULL DEFAULT 'push' CHECK IN ('push','email')` | The default is what makes this additive: every existing row and every existing producer keeps its exact current meaning. |
| `+ recipient_email text NULL` | Snapshotted at enqueue (052's rule), used only when `channel='email'`. |
| `dedupe_key` | Unchanged and still `UNIQUE`. The channel becomes part of the key the producers build: `"<type>:<channel>:<recipient_sub>:<entityId>"`. ⚠ Existing keys have no channel segment and must not be rewritten — they are already unique and already drained. |
| **CHECK** | `channel = 'email'` ⇒ `recipient_email IS NOT NULL`. An email intent with nowhere to send is unrepresentable. |

**Scope boundary**: only `order_delivered` produces an `email` row in this feature (research R8).
`order_paid` MUST NOT — it already has the 052 receipt.

---

## 4. `public.shop_fulfillment` — **unchanged**

Stated explicitly because it is the table a reader will expect to change. No new status, no new column.
`collected → delivered` remains the transition; `carrier_handoff` existence is the new precondition on it
for standard packages. Research R3.

---

## 5. State transitions

```
                                     ┌─ same-day ─→ delivery_task ─→ [proof] ─┐
pending → received → picking → ready_for_pickup → collected                    ├→ delivered
                                     └─ standard ─→ [carrier_handoff] ────────┘
                                                          ↑
                                          staff records handover, then arrival
```

**Rules the writes must enforce:**

1. `collected → delivered` for a **standard** package REQUIRES a `carrier_handoff` row (FR-006). Refused
   otherwise, with a reason that names the missing handover.
2. Every `→ delivered` transition writes exactly one `package_arrival` row, whichever path it came from.
3. Both transitions are **status-guarded** (`WHERE ... AND status = 'collected'`) inside one transaction,
   the `FinalizeSucceeded` shape. A repeat affects 0 rows → no arrival, no notification, no changed
   timestamp (FR-005/FR-020).
4. An order is finished when **every** package has arrived — a rollup, never a max. Already how
   `orders/stage.go` computes the customer's stage; unchanged by this feature except for R4's rank edit.

---

## 6. Customer-facing progress — rule change only, no schema

`apis/core-api/internal/features/orders/stage.go`: `ready_for_pickup` moves rank **2 → 1**.

| Package status | Stage before | Stage after |
|---|---|---|
| `received`, `picking` | packing | packing |
| **`ready_for_pickup`** | **on the way** ❌ | **packing** ✅ |
| `collected` | on the way | on the way |
| `delivered` | delivered | delivered |

---

## 7. Account closure — predicate change only, no schema

`apis/edge-api/customer/src/closure/repo.ts`: `f.status <> 'collected'` → `f.status <> 'delivered'`.
Fixes the block in **both** directions — research R5.

---

## 8. Reads the console needs (no new tables)

The order detail is assembled from what already exists: `public."order"`, `order_item`, `payment`,
`shop_fulfillment`, `order_package_delivery`, `fulfillment_item`, plus the two new tables. Its history is
a union over `fulfillment_event` (020), `driver_task_event` (049), `carrier_handoff` and
`package_arrival`, ordered by time.

⚠ The union is a **read-side projection**, not a stored timeline. A stored one would be a fourth place a
state change has to be written and the first place it can be forgotten.
