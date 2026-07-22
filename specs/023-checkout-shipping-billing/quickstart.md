# Quickstart: Checkout Shipping & Billing Addresses (023)

Validation runbook. **Claude authors; the operator runs anything touching live state.** 🧑‍💻 =
operator-run. Checkout + order live on the hot path (`core-api`, local-only); the address book the picker
reads is on the cold path (022). One migration column; no Terraform.

**Prerequisites**: a signed-in dev customer with ≥2 saved addresses (one default) · `make core-run` ·
the cold-path customer service deployed (022, `make edge-deploy SERVICE=customer ENV=dev`) so the picker
can list/add addresses · the two customer surfaces runnable locally.

---

## 1. Build & unit verification (no cloud)

```bash
pnpm install
pnpm -r typecheck
pnpm --filter @effy/shared-types build        # regenerated OrderDTO/checkout DTOs (+ CommerceDto.kt)
pnpm --filter @effy/customer-web test          # checkout picker, add-new, billing toggle, receipt both-addresses
pnpm --filter @effy/edge-shop test             # incl. the NEW no-billing guard test (FR-018)
cd apis/core-api && go build ./... && go vet ./... && go test ./... && cd -   # billing snapshot: same-as (NULL) / divergent / invalid id
cd apps/customer-mobile && ./gradlew :shared:allTests && cd -
pnpm turbo build
```
Expected: all green. `commerce-contract:gen` must be re-run for the two new DTO fields (drift guard).

## 2. Apply the migration 🧑‍💻

```bash
# commit the migration first (003 commit-guard), then:
make db-up ENV=dev                             # ALTER order ADD billing_address jsonb (nullable)
```
No backfill — existing orders read `billing_address = NULL` = "billing same as shipping" (correct).

## 3. Run the stack (local)

```bash
make core-run                                  # hot path — checkout/intent + orders (billing snapshot)
pnpm --filter @effy/customer-web dev
# and/or the mobile app on a simulator/device
```

## 4. Walk the success criteria

| SC | Prove | Expected |
|---|---|---|
| **SC-001** ⭐ | Returning customer with a default opens checkout | default pre-selected; reach pay with **0 address fields typed**, both surfaces |
| **SC-002** | Open the picker, switch to a non-default address | shipping + delivery/amount reflect the new destination before pay (<30s) |
| **SC-003** | "Add a new address" at checkout | saved to the address book, selected; present in the account Address Book afterwards |
| **SC-004** ⭐ | Place an order with the billing toggle ON | `billing_address IS NULL`; receipt reads "Billing: same as shipping" |
| **SC-005** ⭐ | Toggle OFF, choose a different billing address, place | order records a distinct `billing_address`; receipt shows both in full |
| **SC-006** | Edit/delete a saved address used on a past order; re-open it | shipping AND billing on that order unchanged |
| **SC-007** ⭐ | For a divergent-billing order, inspect **every** shop surface + fulfilment API response | billing appears **zero** times; shipping present where the shop is entitled |
| **SC-008** | Repeat on both customer-web and customer-mobile | each satisfies its acceptance scenarios (parity) |
| **SC-009** | Inspect analytics events | no address fields; no billing anywhere shop-side |

### The shop no-leak proof (SC-007 / FR-018) 🧑‍💻

```bash
# after placing a divergent-billing order that fanned out to a shop, hit the shop fulfilment API and grep:
curl -s -H "Authorization: Bearer $SHOP" "$SHOP_API/shop/v1/fulfillments/$FID" | grep -i billing && echo "LEAK" || echo "clean (no billing)"
# expect: clean (no billing). Also confirm the shipping/delivery address IS present.
```
The unit guard (`pnpm --filter @effy/edge-shop test`) proves no shop SQL/DTO names billing; this is the
live confirmation.

### The billing default logic (SC-004 vs SC-005)

- Toggle ON (default), or a billing address equal to shipping → the intent sends **no** `billingAddressId`
  → order stores `billing_address = NULL` → receipt: "same as shipping".
- Toggle OFF + a different address → intent sends `billingAddressId` → order snapshots it → receipt shows
  both.
- Toggle OFF then back ON → the divergent selection is discarded (FR-013); order stores NULL.

---

## 5. Sign-off 🧑‍💻

- Update the parity register ([docs/audiences/customer-capabilities.md](../../docs/audiences/customer-capabilities.md)) §023.
- Record the **020 amendment** (shop sees shipping only; billing structurally excluded + guard test) in
  [specs/020-shop-order-fulfillment/](../020-shop-order-fulfillment/) and the shop parity register.
- Commit spec, plan, research, data-model, contracts, quickstart, tasks **alongside** the code + migration.

## Known limits at sign-off

- **`core-api` is local-only** — checkout + orders (and the billing snapshot) are verifiable locally, not
  live, until the hot path's own deploy slice. The address-book picker it reads IS on the deployable cold
  path (022).
- **Stripe `billing_details` not sent** — the billing address is recorded on the order (receipt/invoice);
  wiring it into the PaymentIntent is a recorded follow-up (R6), behaviour-neutral.
- **Depends on 021 + 022** being present (delivery re-pricing on shipping change; the address book the
  picker reads/writes). Both are uncommitted in the tree at the time of writing.
