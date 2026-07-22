# 020 Amendment — Shipping vs Billing addresses (023)

**Date**: 2026-07-22 · **Driven by**: [023-checkout-shipping-billing](../023-checkout-shipping-billing/)
· **Type**: exposure boundary only — no shop data, endpoint, DTO, or UI change.

## What 023 changed upstream

From 023 every order carries **two** address snapshots:

- `delivery_address` (jsonb, NOT NULL) — the **shipping** address (where the order is delivered). This is
  the field 020's fulfilment already reads and maps to `delivery`. Unchanged.
- `billing_address` (jsonb, **nullable**, NEW) — the **billing** address for payment/invoice. `NULL` means
  "same as shipping".

## The rule for 020 (FR-018 / SC-007)

The shop/operator fulfilment surface exposes the **shipping address only**. The **billing address MUST
NEVER** reach the shop — not in a query, a DTO, a payload, a log, or a UI.

## Why nothing in 020 had to change

The boundary is enforced **by construction**, not by a new filter:

- Billing is a **separate column**. The shop fulfilment repository
  (`apis/edge-api/shop/src/fulfillments/repository.ts`) selects **only** `o.delivery_address` from the
  order and maps it to `delivery` — it never names `billing_address`. So billing is structurally
  unreachable from every shop query and payload.
- No shop endpoint, DTO, mapper, or screen was touched.

## What was added

A **guard test** — `apis/edge-api/shop/src/fulfillments/no-billing.guard.test.ts` — asserts that no
non-test source in the shop fulfilment slice (`repository.ts`, `service.ts`, `handler-support.ts`,
`promise.ts`, `types.ts`) contains the string `billing` (case-insensitive), and that `delivery_address`
(shipping) IS still exposed. If a future edit ever joins billing into a shop query or DTO, this test
fails loudly. This is the durable enforcement of FR-018 for the shop audience.

## Sign-off note

The live no-leak proof (023 quickstart §4, SC-007): place a divergent-billing order, hit the shop
fulfilment API for its portion, and confirm the shipping address is present and `billing` appears zero
times.
