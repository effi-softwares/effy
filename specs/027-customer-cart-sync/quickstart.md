# Quickstart: 027-customer-cart-sync

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Contracts**:
[cart-api](contracts/cart-api.contract.md) · [promotions-admin-api](contracts/promotions-admin-api.contract.md)

This is the validation guide — how to run the slice and prove each success criterion. Every step marked
**⚠ operator** must be run by the operator, per the project's mode of work (Claude authors, the operator
runs anything touching live AWS, the database, or a deployment).

---

## 0. Prerequisites

| Need | How |
|---|---|
| Dev database reachable | `make db-status ENV=dev` — ⚠ operator |
| Migration committed **before** applying | 003 commit-guard: commit `db/migrations/<ts>_cart_sync_promotions.sql`, then `make db-up ENV=dev` — ⚠ operator |
| Hot path running locally | `make core-run` (Docker; core-api has no cloud deploy by decision) — ⚠ operator |
| Admin service deployed | `make edge-deploy SERVICE=admin ENV=dev` — ⚠ operator |
| Stripe test webhook forwarding | `scripts/stripe-listen.sh` (syncs the CLI secret into Secrets Manager, records the forward URL in SSM) — ⚠ operator |
| Catalogue data | The 019 dev seed: two shops, 38 products, media in S3 |
| A customer account | Any customer-pool account; sign-in is EMAIL_OTP or password |
| Back-office access | An `admin` or `manager` staff account (006 bootstrap) |

## 1. Machine-verifiable gates (run these first)

```bash
# Contract SSOT → Kotlin, and the drift guard
pnpm --filter @effy/shared-types commerce-contract:gen
pnpm --filter @effy/shared-types commerce-contract:check

# Workspace
pnpm -r typecheck
pnpm -r test
pnpm build            # turbo

# Hot path
cd apis/core-api && go build ./... && go vet ./... && go test ./... && gofmt -l .

# Mobile
cd apps/customer-mobile && ./gradlew :shared:compileKotlinIosSimulatorArm64 :shared:iosSimulatorArm64Test \
                                    :shared:testDebugUnitTest :androidApp:assembleDebug
make mobile-guard     # no secrets in mobile source

# Design-token drift (must be UNCHANGED by this slice — no new token)
node scripts/check-tokens.mjs

# customer-web: the quarantine and the budget delta
pnpm --filter @effy/customer-web depcruise      # aws-amplify reachable only from app/(auth)/
pnpm --filter @effy/customer-web size           # see §6 — delta, not absolute
```

## 2. Seed the promotion fixtures (via the console, not SQL)

The point of User Story 10 is that an operator never needs database access. Create these from
**Back-office → Promotions** (⚠ operator), because doing it in SQL would not prove SC-020:

| Code | Definition | Proves |
|---|---|---|
| `SPRING20` | 20% off, no window, uncapped | the happy path, SC-013 |
| `TENOFF` | $10.00 fixed, min spend $50.00 | `promo_below_minimum`, and the fixed-amount cap |
| `TINY` | $999.00 fixed, no minimum | the discount is capped so the total never goes below zero |
| `EARLY` | 10% off, `startsAt` tomorrow | `promo_not_started` |
| `OVER` | 10% off, `endsAt` yesterday | `promo_expired` |
| `ONCE` | 10% off, `maxPerCustomer: 1` | `promo_already_used` |
| `CAPPED` | 10% off, `maxRedemptions: 1` | `promo_exhausted` |
| `OFF` | 10% off, then **disabled** | `promo_disabled` |

Then set **Order rules** → minimum spend `$25.00` for §5, and return it to `$0.00` afterwards.

## 3. Walk the cart (both surfaces)

Run mobile against the local hot path and web on `:3000`. Do each of these on **customer-mobile
(Android and iOS)** and on **customer-web** — parity is SC-018 and is only true if both were walked.

| # | Scenario | Expected | Criterion |
|---|---|---|---|
| 1 | Add 3 items as a guest → force-quit → reopen | same 3 lines, same quantities, same order; prices are **current**, not add-time | SC-001, FR-004 |
| 2 | Same, but restart the device | unchanged | SC-001 |
| 3 | Signed in on mobile, add an item; open the cart on web | the item is there within 5 s, no manual refresh | SC-002 |
| 4 | Guest cart `A×1, B×2`; account cart `B×3, C×1`; sign in | `A, B×3, C` — nothing lost, B not 5 | SC-003 |
| 5 | Repeat the sign-in five times | quantities identical every time | SC-003 |
| 6 | Two devices, same account: set a line to 3 on one, view on the other | 3 on both — not 5, not 2 | SC-004 |
| 7 | Remove a line on device A, view on device B | gone, and it does not come back | SC-004 |
| 8 | Tap **+** ten times in two seconds | the line tracks every tap with no spinner; settles on 10; **≤2 requests** hit the platform | SC-005 |
| 9 | Airplane mode → add, change a quantity, remove → restore connectivity | changes marked unsaved, then applied **once**; reopen confirms | SC-006 |
| 10 | Airplane mode → change → force-quit → reopen → restore connectivity | the queued change survives process death and applies once | SC-006, FR-017 |
| 11 | Mark a cart product `unavailable` in the back-office; open the cart | flagged, excluded from the total, removable; checkout refused if it is the only item | SC-007 |
| 12 | Change a cart product's price up, then down | current price charged, previous amount shown both ways | SC-008 |
| 13 | Set an item aside → restart → sign in elsewhere | still aside, in no total, present on the other device | SC-009 |
| 14 | Clear the cart | confirmation required; cart empty; **set-aside list untouched** | SC-010 |
| 15 | Reorder a 5-item past order with 2 unavailable | 3 added, "2 items could not be added", **no shop named** | SC-011 |
| 16 | Reorder the same order twice | quantities do not double | SC-011 |
| 17 | Apply each of the 8 fixture codes | each refused with its exact reason; `SPRING20` applies | SC-012 |
| 18 | With `SPRING20` applied, pay with a Stripe test card | charged amount == displayed discounted total, to the cent | SC-013 |
| 19 | Re-deliver the same Stripe webhook (`stripe events resend`) | `promo_redemption` count still 1 | SC-013, FR-048 |
| 20 | Minimum `$25`, cart at `$18` | shortfall stated, checkout unavailable; add to cross it → unlocks with no reload | SC-014 |
| 21 | Cart at `$18`, call `POST /v1/checkout/intent` directly with `curl` | `422 order_below_minimum` | SC-014, FR-056 |
| 22 | Raise a quantity to 200; add a 101st distinct item; then do both with `curl` | clamped to 99 with a notice; add refused as `cart_full`; **same outcome via `curl`** | SC-015 |
| 23 | Enter checkout, get an intent, abandon, return to the cart | cart exactly as left — not emptied, no previous attempt's items | SC-016 |
| 24 | Complete a payment | only purchased items leave; set-aside items remain | SC-016 |
| 25 | Open a saved cart and place the order without re-adding anything | completes end to end on a real device | SC-019 |

## 4. Walk the console (operator promotions)

| # | Scenario | Expected | Criterion |
|---|---|---|---|
| 26 | Create a code → shopper redeems → usage count rises → disable → next shopper refused | the whole loop with **no database access** | SC-020 |
| 27 | Submit: duplicate code · `endsAt` before `startsAt` · value `0` · `percentOff: 150` · `maxRedemptions: -1` | each refused with its specific reason; nothing created | SC-021 |
| 28 | Edit a **used** code's value | refused `promo_immutable_once_used`; window/caps/status still editable | SC-021, FR-068 |
| 29 | Delete a **used** code | refused; disabling offered instead | FR-070 |
| 30 | Sign in as a `csa`; open Promotions; attempt a create | list visible, create refused | FR-052 |

## 5. The no-leak review (adversarial)

SC-017 is not satisfied by "we were careful". Grep every string this slice can put in front of a
customer — line notices, refusal reasons, reorder reports, promo labels, minimum messages — on **both**
surfaces, and confirm none carries a shop name, a shop count, or a location:

```bash
grep -rn "shop" apps/customer-web/app apps/customer-web/lib \
  apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/cart \
  | grep -iv "packageKey\|shop_id\|// " 
```

Then read the rendered cart with two shops' items in it and a below-minimum total, on a device. The
grep finds accidental identifiers; only reading the screen finds accidental *phrasing* ("from 2 stores").

## 6. The bundle budget — measure the delta, do not chase the absolute

`apps/customer-web`'s guest budget is **160 KB**; the measured figure is **≈167 KB and was already over
before this slice** (recorded under 020, re-confirmed byte-identical under 024). `pnpm size` is a
standalone script, not part of `build` or `test`, so this does not fail `turbo build`.

The obligation here is **no regression**:

```bash
git stash && pnpm --filter @effy/customer-web build && pnpm --filter @effy/customer-web size  # baseline
git stash pop && pnpm --filter @effy/customer-web build && pnpm --filter @effy/customer-web size  # with the slice
```

Record both numbers in the sign-off. Fixing the inherited overage is **not** this slice's job and must
not be attempted inside it.

## 6a. "The cart isn't syncing" — check this first

The one failure this feature has actually hit, and the order to check it in:

```bash
docker logs core-api-core-api-1 --tail 200 | grep '"route":"/v1/cart'
```

| What the logs show | What it means |
|---|---|
| **`401`, duration < 1 ms** | The token is rejected before any work happens. Two causes, and R12 hit BOTH at once: (a) the **wrong token** — the hot path requires an **ACCESS** token, and an ID token fails on `token_use` and on the missing `client_id`; check `authHeadersFor` sends `BearerToken.Core` for the core client. (b) an **unknown app client** — a pool has more than one (customer web + customer **mobile**) and core-api must be given all of them; `make core-run` passes both from SSM, so if you started it another way check `AUTH_CUSTOMER_CLIENT_ID` contains **both, comma-separated**. core-api logs the real reason at `warn` — `grep 'token rejected'` and read `reason`. |
| **`422` on a write, `200` on a read** | The request BODY is not binding. Check the wire types: an integer field must arrive as `2`, not `2.0` — Go refuses a float into an `int`. The contract's `WireInt` (`@asType integer`) exists for exactly this; see research R13. |
| **`403`** | The customer is barred. `customeridentity` refuses before the handler runs. |
| **401, and the reason is `token_use is not access`** | A build that still puts the ID token in `Authorization`. The current code cannot produce this reason, so the device sending it is running a **stale binary** — rebuild it (`./gradlew :androidApp:installDebug`; for iOS clean the build folder so the Kotlin framework relinks). |
| **No `/v1/cart` lines at all** | The client is not calling. Check the device can reach `CORE_API_BASE_URL` (`make cm-ngrok-core` if it is not on the same network), and that the shopper is actually **signed in** — a guest deliberately sends nothing. |
| **`200`s but the other device shows nothing** | The other device has not reconciled yet. Open its cart tab; there is no app-foreground refresh until US4. |

⚠ The client **swallows** these failures by design — a shopper must not see a stack trace, and a change is
kept rather than lost. That means the logs, not the app, are where a sync problem is visible. This table
exists because that trade-off cost a live debugging round the first time.

## 7. Limits of this verification (state these at sign-off)

- **`core-api` has no cloud deployment** by decision; its go-live is its own slice. Everything hot-path
  here is verified against a **local** `core-api` and the dev database. Two clients against one local
  hot path *is* the two-device test — the authority they converge on is the thing under test — but
  SC-002's "within 5 seconds" is measured on a LAN and must be re-measured once the hot path is
  internet-facing.
- **Mobile telemetry remains deferred** platform-wide (013/014/015 pattern); this slice does not resolve
  it, so cart funnel analytics exists on web only.
- **Promotional codes are signed-in only** by design (research R10) — a per-shopper cap cannot be
  enforced without an identity. A guest sees a sign-in affordance where the code field would be.
- **Availability is catalogue status only.** There is no stock anywhere in the schema, so nothing here
  promises reservation, "only N left", or holding inventory.
