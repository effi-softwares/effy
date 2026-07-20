# Quickstart: Shop Order Fulfillment (020)

Validation runbook. **Claude authors; the operator runs everything that mutates AWS, the database, or
live state.** Steps marked 🧑‍💻 are operator-run.

**Prerequisites**: 019 signed off · the two dev shops seeded (`shop one`, `Effy SHOP TWO`) · an
operator account in the shop pool assigned to a shop with `status = 'active'` · the dev DB running
(`stop-db.sh`/start counterpart) · `make` from repo root.

---

## 0. The blocking prerequisite ⚠

**020 cannot be fully validated until a real order exists**, and 019's carry-forward 2 stands: *no live
end-to-end purchase has ever run*. The fan-out was proven against the live schema inside a rolled-back
transaction, so **`shop_fulfillment` is empty in dev**.

Before SC-001/SC-002 can be signed off, run one real checkout (019's own outstanding step):

```bash
make core-run                       # hot path, local Docker
stripe listen --forward-to localhost:8080/v1/stripe/webhook
# then complete a test-card checkout on customer-web with items from BOTH shops
```

A two-shop cart is what makes SC-002 provable at all — a single-shop order cannot demonstrate isolation.

---

## 1. Build & unit verification (no cloud)

```bash
pnpm install
pnpm --filter @effy/shared-types shop-contract:gen     # regenerate Kotlin DTOs
pnpm --filter @effy/shared-types shop-contract:check   # MUST be clean — diff guard
pnpm -r typecheck
pnpm --filter @effy/edge-shop test                     # SQL-shape + handler + service
pnpm --filter @effy/shop-web test
pnpm --filter @effy/core-api... exec true               # (Go below)
cd apis/core-api && go build ./... && go vet ./... && go test ./... && cd -
cd apps/shop-mobile && ./gradlew :shared:allTests && cd -
turbo build
```

Expected: all green; `shop-contract:check` produces **no diff** (a diff means the generated Kotlin was
hand-edited — Principle II violation).

---

## 2. Migration 🧑‍💻

The migration must be **committed first** — `db-up` has a commit guard (003).

```bash
git add db/migrations/*_shop_order_fulfillment.sql && git commit
make db-status ENV=dev
make db-up ENV=dev
```

Verify the state machine widened and the tables exist:

```sql
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint WHERE conname = 'shop_fulfillment_status_check';
-- expect: CHECK (status IN ('pending','received','picking','ready_for_pickup','collected'))

\d public.fulfillment_item
\d public.fulfillment_event
```

---

## 3. Deploy the cold path 🧑‍💻

```bash
make edge-deploy SERVICE=shop ENV=dev
```

Smoke the new routes (expect `401` unauthenticated, `200` with a valid shop token):

```bash
API=$(aws ssm get-parameter --name /effy/dev/edge/api_endpoint --query Parameter.Value --output text)
curl -s -o /dev/null -w '%{http_code}\n' "$API/shop/v1/fulfillments"
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $SHOP_TOKEN" "$API/shop/v1/fulfillments"
```

**Confirm the pickup stub is ABSENT, not merely refusing** (SC-013 — this is the security check):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H "Authorization: Bearer $SHOP_TOKEN" -d '{"driverRef":"x"}' \
  "$API/shop/v1/fulfillments/any-id/pickup"
# expect 404 (no such route) — NOT 403, and NOT 200.
# A 403 would mean the route exists in a deployed environment. That is a FAILURE.
```

---

## 4. Success-criteria validation

Run each against the live dev environment with a real two-shop order.

| SC | How to prove it | Expected |
|---|---|---|
| **SC-001** | Place an order; watch the queue on both surfaces without touching anything | Appears **≤30s**, no manual refresh |
| **SC-002** ⭐ | Open the same order as **shop one** and as **SHOP TWO** | Each sees only its own lines; union = the order; nothing duplicated; **zero** cross-shop lines |
| **SC-003** | Time queue-open → ready for a 5-item order | **<60s**, ≤3 deliberate actions |
| **SC-004** | `SELECT status FROM shop_fulfillment WHERE …` after marking ready | Has **left** `pending` |
| **SC-005** ⭐ | Two browsers/devices, same order, tap advance simultaneously | Exactly **one** applied transition; other is a benign no-op; no contradictory state |
| **SC-006** | Gather 2 of 4, navigate away, return; then open as a second operator | Progress intact both times |
| **SC-007** ⭐ | Inspect every response body from §3 adversarially | **Zero** other-shop items/identity; **zero** payment fields |
| **SC-008** | Call with a disabled operator, an unassigned one, and one at an inactive shop | **403** every time, **identical body** — no term disclosed |
| **SC-009** | View the multi-shop order as the **customer** | Progress shown; **zero** shop-identifying data |
| **SC-010** | Repeat every user story on shop-web **and** shop-mobile | Both satisfy their acceptance scenarios |
| **SC-011** | Flag an item unavailable; re-read the order and payment rows | **No** refund/credit/adjustment; `subtotal_amount` unchanged; shortfall still discoverable after completion |
| **SC-012** | Flag **every** item unavailable, then mark ready | Completes; portion is **not** stuck |
| **SC-013** ⭐ | §3 stub-absence check, plus attempt to enable it via env/header/body | **404**; no runtime input enables it |
| **SC-014** | Use the stub locally, then inspect the row | Marked **placeholder**; distinguishable from a real dispatch |
| **SC-015** | Attempt each illegal transition (e.g. `received → ready_for_pickup`) | **409** every time |
| **SC-016** | Mark ready, reverse, re-complete; read `fulfillment_event` | Reversal recorded and **attributed to the operator** |
| **SC-017** | Flag an item mid-pick, check the customer view; then complete and re-check | Hidden while picking; disclosed once terminal |
| **SC-018** | Advance one order while watching the queue | Position **never** moves; at-risk escalates in place |
| **SC-019** | (After 021 only) later-arriving, sooner-promised order | Outranks the earlier/later-promised one |
| **SC-020** ⭐ | With today's uniform promise, compare queue order to `ORDER BY placed_at` | **Identical** — FIFO by construction |
| **SC-021** | Grep every response, DTO, and stored row | **Zero** references to own-driver vs third-party |

⭐ = the criteria that are the point of the slice. If only five are run, run these.

### The adversarial isolation proof (SC-002 + SC-007)

Do not merely read the UI — read the wire:

```bash
curl -s -H "Authorization: Bearer $SHOP_ONE_TOKEN"  "$API/shop/v1/fulfillments/$PORTION_ONE" | jq .
curl -s -H "Authorization: Bearer $SHOP_TWO_TOKEN"  "$API/shop/v1/fulfillments/$PORTION_TWO" | jq .

# Cross-shop attempt — shop one asking for shop two's portion:
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $SHOP_ONE_TOKEN" "$API/shop/v1/fulfillments/$PORTION_TWO"
# expect 403 — and NOT 404 (404 would let you enumerate other shops' portions)
```

Then grep both bodies for anything that must not be there:

```bash
grep -Ei 'payment|card|intent|stripe|shop_id|shopName|driver|third.?party' bodies.json
# expect: no matches
```

---

## 5. Parity & sign-off 🧑‍💻

- Update [docs/audiences/shop-capabilities.md](../../docs/audiences/shop-capabilities.md) with §020 rows
  for **both** shop columns (FR-022) — web and mobile, marked honestly.
- Confirm the mobile telemetry deferral is still recorded as a deviation (not silently dropped).
- Commit spec, plan, research, data-model, contracts, quickstart, tasks **alongside** the code (Quality
  Gates: no feature merges without all three artifacts).

---

## Known limits at sign-off

- **021 has not shipped**, so every order carries the same promise and the queue is FIFO. SC-019 is
  therefore **not provable yet** — that is by design (FR-001b), not a gap.
- **The pickup stub is scaffolding** with a removal trigger (FR-034). It must not accrete capability.
- **The shortfall debt is real and unresolved**: a customer who loses an item gets no refund in this
  slice. Confirm shortfalls are queryable before sign-off, or the refunds slice inherits a mess.
- **`core-api` remains local-only**, so the customer-side half (US5) is verifiable locally but not live
  until the hot path's own deployment slice lands.
