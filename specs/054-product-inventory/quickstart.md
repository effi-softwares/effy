# Quickstart — 054 Product Inventory

The validation walk. Machine gates first, then the walks only a person can do. Every section names the
success criterion it proves.

---

## Prerequisites

```bash
make db-status ENV=dev          # migration applied?
make core-run                   # hot path, local Docker
docker info                     # ⚠ container-backed tests SKIP silently without it (052's lesson)
```

You need: a shop operator account, a back-office `admin`/`manager` account, a back-office `csa` account
(for the negative), and a customer account with a card that works in Stripe test mode.

---

## 1. Machine gates

```bash
# Hot path
cd apis/core-api && go build ./... && go vet ./... && gofmt -l . && go test ./...

# The whole workspace
pnpm -r typecheck && pnpm -r test

# Contract drift — must be silent
pnpm --filter @effy/shared-types shop-contract:check

# Shop mobile
cd apps/shop-mobile && ./gradlew :shared:testAndroidHostTest :shared:compileKotlinIosSimulatorArm64
make sm-guard && make sm-tokens-check

# Design guards — the Compose theme diffs MUST be unchanged (this slice adds no token).
# ⚠ There is no `make tokens:check` target; the real ones are per-app.
make brand-check && make cm-tokens-check && make sm-tokens-check

cd infra/envs/dev && terraform validate && terraform fmt -check
```

⚠ **Two pre-existing red gates, verified at clean HEAD and not caused by this slice**: Go
`platform/delivery` container tests (`z.sameday_eligible does not exist`) and `features/saveditems`
(`public.delivery_pricing_rule does not exist`, recorded under 033). `make check-no-phantm` also fails
on 042/045/050 prose. Confirm they are still exactly these before blaming this work.

---

## 2. The negative proofs — the ones worth more than the suite

Each is run by **breaking** something and confirming the failure lands where it should.

| # | Break this | Expect | Proves |
|---|---|---|---|
| 2a | Revert one hot-path query to a hand-written `p.status = 'active'` | The one-rule guard fails, naming the file | FR-012 is mechanical, not a comment |
| 2b | Change the availability fragment once | Storefront, cart, saved items and checkout all change together | SC-012 |
| 2c | Stash the whole slice | Every customer surface byte-identical for untracked products | SC-006 |
| 2d | Remove the `GREATEST(0, …)` floor | The concurrency test drives the count negative | FR-022 is in the statement, not in a service |
| 2e | Drop the `CHECK (NOT stock_tracked OR stock_on_hand IS NOT NULL)` | Tracking can be enabled with no count | FR-003 is enforced by the database |
| 2f | Leave the saved-items verdict unwidened | A zero-stock product reads `purchasable` in a saved list | R12.2 — the drift this slice would otherwise ship |

---

## 3. Shop management — US1 (SC-001, SC-005)

On **shop-web**, then repeat every step on **shop-mobile** (FR-030 parity):

1. Open a product → **Inventory** tab. It no longer says "coming soon".
2. Turn tracking on with 12 units → the count reads 12, one movement, your name against it.
3. Record receiving 24 → reads 36; both movements, newest first.
4. Correct to 1 with reason *damaged* → reads 1, reason recorded.
5. Try `-1`, and try `2.5` → both refused, naming the problem, **no movement written**.
6. Try to open another shop's product by id → refused, and the refusal says nothing about whether it
   exists. **(FR-004)**
7. Turn tracking off → unlimited again, history retained.

---

## 4. The buying gates — US2 (SC-002, SC-010, SC-011)

With one product tracked at **2 units**:

1. Storefront listing, search, product page → visible, buyable.
2. Add 5 to cart → refused, message says **"only 2 available"**. Cart unchanged. **(FR-016)**
3. Add 2 → succeeds.
4. In the shop console, set the count to **0**.
5. Reload the product page → shows **out of stock**, still listed, still saveable. **(FR-013, A10)**
6. Reload the cart → line flagged, payable total excludes it, the change is stated. **(FR-017)**
7. With every line out of stock, try to check out → refused with a reason, **no PaymentIntent created**
   (confirm in the Stripe dashboard). **(FR-019)**
8. With one available and one out, check out → payment covers only the available line, and you were told
   before paying. **(FR-020)**
9. Saved items → the zero-stock product reads *out of stock right now*, **not** "no longer sold".
   **(FR-014, SC-010 — show the wording to five people)**
10. An untracked product → behaves exactly as before at any quantity up to the policy cap. **(FR-002)**
11. Sweep every customer response for a numeric count outside the FR-016 refusal, and for any shop
    identity. **(SC-009)**

---

## 5. Order flow — US3 (SC-003, SC-004)

1. Tracked product at 10. Buy 3 with a real test card. → count reads **7**, movement cites the order.
2. **Replay the Stripe webhook** for that order. → count still 7. **(FR-021 exactly-once)**
3. ⚠ **The oversell walk.** Set a product to **1**. Get two orders for it to pay at the same moment
   (two browsers, or replay two intents). → count never below zero; both orders exist; the losing
   order's line is **already flagged short** when the shop opens it, before picking. **(FR-022, FR-022a,
   SC-003)**
4. Open that portion → it still reads **`pending`**, not "picking", despite having pick rows.
   **(R4's caveat)**
5. Gather the pre-flagged line anyway → the flag clears; the count was simply understated.
   **(FR-022a correctability)**
6. Record a genuine shortfall on a pick → the count is corrected and the movement cites the pick.
   **(FR-023)**
7. Buy an untracked product → **no movement at all**. **(FR-024)**

---

## 6. Back-office — US4 (SC-007)

1. As `admin`/`manager`: find the shop, find the product, set a count with a reason. Time it — **under
   2 minutes** from opening the console.
2. From the **shop's own** console, read the history → the change is there, marked as back-office, with
   the individual's name. **(FR-027)**
3. Turn tracking off on the shop's behalf → works. **(FR-026, full parity)**
4. As `csa`: reading stock and history **works**; every write is **refused**, and the refusal is the same
   regardless of which shop or product. **(FR-025, FR-028)**

---

## 7. Low stock — US5 (SC-008)

1. Set the shop default threshold to 5. A product at 4 with no threshold of its own → appears.
2. Give a product its own threshold of 20; at 12 → appears (product wins).
3. Clear both; a product at 0 → still appears, as **out**, distinguished from **low**.
4. An untracked product → never appears.
5. Identify everything needing restock **in under 30 seconds** without opening each product.

---

## 8. Telemetry (R9)

- `/metrics` on `core-api` exposes `effy_stock_deducted_total`, `effy_stock_blocked_total`,
  `effy_products_out_of_stock`.
- Force an oversell (§5.3) → `effy_stock_deducted_total{outcome="partial"}` increments and the alarm
  fires.
- Confirm no label carries a product id or shop id. **(Principle VII, low cardinality)**

---

## 9. ⚠ Look at it

039 shipped four live defects with a fully green suite, because layout, contrast and hierarchy are not
properties a DOM assertion can see. Before this is called done:

- The Inventory tab on **shop-web** and **shop-mobile**, side by side — same information, same order.
- Light, **dark**, and large-text. "Out of stock" and "low" must be legible with **no colour at all**
  (they are carried by weight and label — 041 removed the amber warning from these exact screens).
- shop-mobile on a **tablet in landscape**, which is its primary device (014 FR-003a).
- The refusal wording a shopper actually sees, on web and on mobile, compared against each other.

---

## Operator steps (not run by the assistant)

⚠ **Capture the SC-004 baseline BEFORE the first deploy.** Record the current proportion of picks
ending in a shortfall from the existing pick records. After deployment the pre-slice figure is
unrecoverable, and SC-004 becomes unprovable rather than merely unmet.

```bash
# 1. commit the migration first (003 commit-guard), then:
make db-up ENV=dev

# 2. the new service + the one that changed
make edge-deploy SERVICE=inventory ENV=dev
make edge-deploy SERVICE=shop ENV=dev

# 3. ⚠ core-api BEFORE pushing to dev — Amplify auto-deploys the consoles on push,
#    and 047 recorded that the reverse order briefly broke dev checkout
make core-image-push ENV=dev && make core-deploy ENV=dev

# 4. the oversell alarm + the new service's gateway attachment
make apply ENV=dev
```
