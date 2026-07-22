# Fulfilment dev tools — mark an order picked up / delivered

Two dev helper scripts to drive an order through the **post-shop** half of the fulfilment lifecycle —
**picked up** and **delivered** — before the driver app exists. They are a stand-in for the real
driver dispatch slice.

- [`scripts/fulfillment-pickup.sh`](../../scripts/fulfillment-pickup.sh) — `ready_for_pickup → collected`
- [`scripts/fulfillment-deliver.sh`](../../scripts/fulfillment-deliver.sh) — `collected → delivered`

They update the env's database directly (via the same `infra/scripts/db-dsn.sh` contract the migrations
use) and write the same append-only `fulfillment_event` audit rows the in-repo driver stubs record.
**Dev only.** Do not point them at production.

## The lifecycle they fit into

```
pending → received → picking → ready_for_pickup │ collected → delivered
└──────────── the shop does these ─────────────┘ └── these scripts (driver) ──┘
```

- The **shop** advances its portion `received → picking → ready_for_pickup` in the shop app
  (shop-web / shop-mobile). That part is a real product surface — do it there.
- These scripts do the **driver** part the platform doesn't have a UI for yet. Each is **guarded**:
  pickup only moves portions at `ready_for_pickup`; deliver only moves portions at `collected`. A
  portion in any other state is left untouched (and shown in the output), so the scripts are safe to
  re-run and can't skip steps.

An order fans out to **one portion per shop** (hidden multi-shop split). The scripts operate on **every
portion of the order** at once, so a two-shop order is picked up / delivered in a single command.

## Prerequisites

- The **`ef` AWS profile** active (or `AWS_PROFILE=…` overridden) — used to read the DB contract from
  SSM + the master password from Secrets Manager.
- `psql` installed, and your machine on the dev DB allowlist (same access `make db-*` needs).
- The **`delivered` state migration applied** for the deliver script:
  `make db-up ENV=dev` (migration `…_fulfillment_delivered_state.sql`). Pickup needs no extra migration.

## Usage

```bash
scripts/fulfillment-pickup.sh  <ORDER_NUMBER> [ENV] [DRIVER_REF]
scripts/fulfillment-deliver.sh <ORDER_NUMBER> [ENV] [DRIVER_REF]
```

- `ORDER_NUMBER` — the human order ref, e.g. `EFY-HVX2AE` (from the receipt, or the query below).
- `ENV` — defaults to `dev`.
- `DRIVER_REF` — the placeholder driver id recorded in the audit event; defaults to `test-driver-1`.

**Complete an order end-to-end** (its portions must already be at `ready_for_pickup`):

```bash
scripts/fulfillment-pickup.sh  EFY-HVX2AE      # → collected  (picked up)
scripts/fulfillment-deliver.sh EFY-HVX2AE      # → delivered  (completed)
```

Each prints every portion of the order and its resulting status.

### Finding order numbers / current statuses

```bash
DSN="$(AWS_PROFILE=ef bash infra/scripts/db-dsn.sh dev)"
psql "$DSN" -P pager=off -c "
SELECT o.order_number, s.name AS shop, sf.status
FROM public.shop_fulfillment sf
JOIN public.\"order\" o ON o.id = sf.order_id
JOIN public.shop s ON s.id = sf.shop_id
ORDER BY sf.created_at DESC LIMIT 20;"
```

## What the customer / shop see afterwards

- **Customer app** — the order progress reads **"Delivered — your order has arrived"** once *every*
  portion is delivered (a partially-delivered multi-shop order still reads "on its way", so the split
  stays hidden).
- **Shop app** — `collected` and `delivered` are **completed** states, so the order leaves the active
  queue for the completed one.

## Notes & limits

- **Guarded, not forced.** If a portion isn't at the required source state, the script skips it — it
  won't jump `pending → delivered`. Advance the shop side first.
- **`actor_staff_id` is `NULL`** on the audit rows these write (the scripts act as an anonymous
  placeholder driver). The in-repo node stubs
  (`apis/edge-api/shop/scripts/invoke-{pickup,deliver}-stub.mjs`) stamp the invoking operator's staff
  id instead, but need the shop service's full DB env exported. These SQL scripts trade that
  attribution for a one-command, no-setup run.
- **Removal trigger.** Delete these when the real **driver slice** ships its dispatch path (FR-034),
  along with the node stubs and `service/repository.{collect,deliver}ViaStub`.
