# Quickstart: Delivery Zones & Pricing (021)

Validation runbook. **Claude authors; the operator runs everything that mutates AWS, the DB, or live
state.** 🧑‍💻 = operator-run.

**Prerequisites**: 019 + 020 signed off and **committed** (020 is currently uncommitted — commit it
first) · the dev DB running · a back-office admin account · the two dev shops · Stripe test mode wired
(`scripts/stripe-listen.sh` running).

---

## 1. Build & unit verification (no cloud)

```bash
pnpm install
pnpm --filter @effy/shared-types commerce-contract:gen         # regenerate customer Kotlin DTOs
pnpm --filter @effy/shared-types commerce-contract:check        # MUST be clean
pnpm -r typecheck
pnpm --filter @effy/edge-admin test        # delivery zones/offerings/location management
pnpm --filter @effy/customer-web test
pnpm --filter @effy/back-office test
cd apis/core-api && go build ./... && go vet ./... && go test ./... && cd -   # quote + extended intent + finalize
cd apps/customer-mobile && ./gradlew :shared:allTests && cd -
pnpm turbo build
```
Expected: all green; `commerce-contract:check` produces **no diff**.

> ⚠ **Inherited, pre-existing**: `customer-web`'s 160 KB guest-bundle gate is already at 167.3 KB (from
> before 020, byte-identical with 020/021 reverted). Keep 021's delivery-options + package-aware-cart
> code in the **checkout/cart route trees only** — never reachable from `/` or `/browse` — so it does not
> worsen the measured guest pages. Do not raise the limit.

## 2. Migration 🧑‍💻

```bash
git add db/migrations/*_delivery_zones_pricing.sql && git commit
make db-up ENV=dev
```
Verify:
```sql
\d public.delivery_zone
\d public.delivery_offering
\d public.order_package_delivery
SELECT column_name FROM information_schema.columns
 WHERE table_name='shop_fulfillment' AND column_name LIKE 'delivery%' OR column_name='promised_ready_at';
SELECT column_name FROM information_schema.columns WHERE table_name='shop' AND column_name='postcode';
```

## 3. Deploy the cold path + seed a first configuration 🧑‍💻

```bash
make edge-deploy SERVICE=admin ENV=dev
```
Then, in the back-office **Delivery** console (or by seeding): create a `MEL-METRO` zone with a few
Melbourne postcodes and a `REGIONAL` zone; set `shop one`'s postcode to a metro one and `Effy SHOP TWO`'s
to a regional one; define offerings — `metro→metro`: same_day $7 + standard $5; `regional→metro`:
standard $8 only. Set the customer's dev address to a metro postcode.

## 4. Run the stack + the money-path proof 🧑‍💻 (the point of the slice)

```bash
./scripts/stripe-listen.sh          # syncs webhook secret + forwards
make core-run                        # hot path (reads the zone/offering tables at quote time)
pnpm --filter @effy/customer-web dev
```

Place a **two-shop** order (one metro shop, one regional shop) to a metro address and watch the flow:

| SC | Prove | Expected |
|---|---|---|
| **SC-001** ⭐ | The delivery step shows two packages | metro package offers **same-day + standard**; regional package offers **standard only** |
| **SC-002** ⭐ | Fee shown == charged == receipt | each package fee to the cent; order total == Σ; **zero** drift |
| **SC-005** | Order to an address one shop can't reach | the unreachable package's items are **auto-set-aside**; explicit confirm required; excluded items **not charged** |
| **SC-009** | Same-day vs standard package to different shops | each shop's queue shows its **own** ready-by; the same-day shop's portion ranks more urgent (020, no code change) |
| **SC-006/007** ⭐ | Inspect every customer response body | **no** shopId, shop name, postcode, or carrier anywhere |
| **SC-010** | Falls back to flat fee? | **never** — every fee derived from zone × method |
| **SC-011c** | Kill core-api mid-finalize, restart | order is either fully finalized (all packages) or not at all — webhook retries; **no** partial order |
| **SC-013** | Change an offering price in back-office | a **new** checkout reflects it; the **historical** order's fee is unchanged |

### The adversarial money proofs (SC-004) 🧑‍💻

```bash
API=…   # core-api base
# 1. client submits a fee → ignored (server recomputes)
curl -s -X POST -H "Authorization: Bearer $CUST" -d '{"addressId":"…","selections":[{"packageKey":"pkg_a","method":"standard","feeAmount":"0.01"}]}' \
  "$API/v1/checkout/intent" | jq '.grandTotalAmount'   # must reflect the TRUE fee, not 0.01
# 2. stale quote → 409 re-quote (wait past expiresAt, then intent with the old quoteId)
# 3. exclude a deliverable package → 409 (can't drop items unconfirmed)
```

## 5. Parity, shop-side, sign-off 🧑‍💻

- Repeat SC-001…SC-002 on **customer-mobile** (SC-010, parity).
- Confirm the **shop** surface shows service level + ready-by but **never** the delivery fee (FR-021a).
- Update [docs/audiences/customer-capabilities.md](../../docs/audiences/customer-capabilities.md) §021 and
  the shop register for the enriched promise.
- Commit spec, plan, research, data-model, contracts, quickstart, tasks **alongside** the code.

---

## Known limits at sign-off

- **The shortfall debt (020) now compounds with delivery**: a customer pays per-package delivery; refunds
  (including delivery-fee refunds on shortfalls) remain out of scope for the refunds slice.
- **`core-api` remains local-only** — the customer half is locally verifiable, not live until the hot
  path's deploy slice.
- **Same-day cutoff + quote validity** are real values (per-offering / a `pricing` constant) — verify the
  cutoff withdraws same-day, and an expired quote forces re-quote, before sign-off.
