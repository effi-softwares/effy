# Quickstart: 033 — Customer Saved Items

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Contract**: [contracts/saved-items.contract.md](contracts/saved-items.contract.md)

How to run and validate this slice end to end. Operator-run steps are marked **OPERATOR** — Claude
authors them and does not execute them (deployments, migrations, anything touching live AWS).

---

## §0 — Before anything

**⚠ Read this first: the migration destroys data.**

`make db-up` will **drop `public.customer_favorite`**, deleting every saved item recorded under the
previous capability. FR-005 makes this an accepted consequence of the replacement — the old rows carry
no save-time price, so carrying them forward would fabricate a baseline that was never observed.

Confirm the blast radius before applying:

```bash
# how many rows are about to go
psql "$(bash infra/scripts/db-dsn.sh dev)" -c \
  'SELECT count(*) FROM public.customer_favorite;'

# ⚠ CONFIRM THIS IS A DIFFERENT TABLE AND IS NOT BEING TOUCHED
psql "$(bash infra/scripts/db-dsn.sh dev)" -c \
  'SELECT count(*) FROM public.cart_saved_item;'
```

`cart_saved_item` is the **cart's set-aside** (027), not this feature. If the migration touches it,
stop — that is a defect, not a plan.

---

## §1 — Machine verification (no cloud, no operator)

Everything here runs locally and must be green before any live walk.

```bash
# Go — hot path
make core-lint                       # gofmt -l empty + go vet
make core-test                       # go test -short ./...
FULL=1 make core-test                # + testcontainers: the five-way verdict SQL against real Postgres

# Contracts — ⚠ NOT in CI, must be run by hand
make cm-contract-check               # fails if committed Kotlin DTOs drift from the TS source
make cm-tokens-check                 # compose theme + mobile assets + banner template drift

# Mobile
cd apps/customer-mobile && ./gradlew :shared:testAndroidHostTest
cd apps/customer-mobile && ./gradlew :androidApp:assembleDebug
make cm-guard                        # ⚠ bans Text("♥ / Text("♡ and enforces nav reachability

# Web
pnpm -r typecheck                    # expect 12/12 "Done"  ⚠ count the packages, see §1a
pnpm -r test
pnpm --filter @effy/customer-web build
make cw-depcruise                    # Amplify quarantine + heavy-UI ban
make cw-size                         # ⚠ the gate this feature fights — see §2
pnpm --filter @effy/customer-web e2e

# Whole-repo sweeps
make brand-guards                    # no-jade + no-emerald
```

### §1a — ⚠ Count the reporting packages, do not just read "green"

029 recorded that `pnpm -r test` was green while `typecheck` **failed** — vitest does not run `tsc`.
It was caught only because the "Done" count fell 12 → 11. Counting reporting packages is part of the
sweep, not a nicety.

### §1b — Prove the contract types actually generated

A type missing from the `CustomerCommerceContract` aggregator generates **zero times** and
`cm-contract-check` passes **trivially** (both files are equally missing it). So check by name:

```bash
make cm-contract-gen
for t in SavedItemDTO SavedMembershipDTO SavedMergeResultDTO SavedAddToCartResultDTO; do
  printf '%-26s ' "$t"
  grep -c "class $t" packages/shared-types/contract/CommerceDto.kt
done
# every line must print 1. A 0 means the type does not exist on mobile.
```

---

## §2 — The bundle gate (the tightest constraint in the slice)

`/search` had **0.1 KB** of headroom against 174 KB before this feature. The plan reclaims first,
spends second. Measure at **every** step — 030 proved a `next/dynamic` split can make routes *worse*.

```bash
pnpm --filter @effy/customer-web build && make cw-size
```

Record the six routes at three points and put the table in the sign-off:

| Point | `/` | `/browse` | `/search` | `/product/[id]` | `/cart` | `/promotions/[id]` |
|---|---|---|---|---|---|---|
| **baseline (pre-feature)** | 172.7 | 169.9 | 173.9 | 172.3 | 173.7 | 170.8 |
| after removing the predecessor | 172.7 | 170.0 | 173.9 | **171.9** | 173.7 | 170.8 |
| after the save control landed | **173.7** | 169.9 | **173.9** | **172.7** | 173.8 | 171.0 |

⚠ **Reclaim attempts, all measured** — recovering 0.2 KB of the 0.7 the control costs:

| Attempt | Result |
|---|---|
| Dynamic telemetry import (027's pattern) | **0 KB** — already in the shared chunk |
| Inline SVG instead of lucide `Heart` | **0.1 KB WORSE** — lucide tree-shakes cheaper than the path data |
| lucide `<X/>` → text glyph on `/search` | **+0.1 KB** ✓ |
| `next/dynamic` on the price filter | **+0.1 KB**, plus a visible flash — reverted |
| Splitting `saved-merge.ts` out of `saved-actions.ts` | **+0.3 KB on `/`**, which had reached exactly 174.0 ✓ |

⚠ **FR-007 was amended, not the budget.** The control is omitted from the web search-results grid only.

To get a true baseline on a dirty tree: `git stash && pnpm build && make cw-size && git stash pop`.

**⚠ If it breaches: reduce the presentation. Do not raise `GUEST_LIMIT`.** The gate's own failure
message says so, and the framework floor is already 143.5 KB of the 174.

---

## §3 — Running it locally

```bash
# 1. Migration — ⚠ commit it first (the 003 commit guard blocks db-up otherwise)
git add db/migrations/ && git commit -m "..."
make db-up ENV=dev                                  # OPERATOR — see §0 first

# 2. Hot path
make core-run                                       # local Docker; core-api has no cloud deploy

# 3. Web
make cw-dev                                         # :3000

# 4. Mobile
cd apps/customer-mobile && ./gradlew :androidApp:installDebug
# physical device: make cm-ngrok-core (core-api is the backend this feature talks to)
```

⚠ `core-api` is **local-Docker-only by platform decision**. This feature cannot reach dev until the
hot path's own deploy slice lands. That is pre-existing and applies equally to the capability being
replaced.

---

## §4 — Walking the feature

### §4a — The heart tells the truth (US1, SC-001, SC-002)

The defect this slice exists to fix. Walk it on **both** surfaces.

1. Sign in. Save a product from its detail page.
2. **Fully close** the app / reload the page.
3. Reach that product by a **different route** than before (search for it, or open it from a rail).
4. ✅ The control shows **saved**, on first render, with no interaction.
5. Tap once → it un-saves. Tap again → saved. Confirm the list agrees each time.
6. Open a grid with a mix of saved and unsaved products. ✅ Each control reflects its own product.
7. On two devices signed into one account: save on A, refresh B. ✅ Present on B (SC-004, 60 s).

**⚠ Regression check against the predecessor**: the old behaviour was that an already-saved product
showed an *empty* heart, so the first tap was a no-op and the second silently un-saved it. If you can
still reproduce that, the membership read is not wired.

### §4b — Purchasability tells the truth (US2, SC-007)

Needs seeded data in each state. **This is where the feature earns its keep.**

```sql
-- one product per outcome, in the shopper's saved list
UPDATE public.product SET status='archived'    WHERE id='…';  -- no_longer_sold
UPDATE public.product SET status='unavailable' WHERE id='…';  -- temporarily_unavailable
-- not_delivered_to_your_area: save a product whose shop's zone has no active
-- delivery_offering to the destination zone (3350 / 3550 are in exactly this state today)
```

1. With delivery location set to a **served** postcode → ✅ purchasable items are addable.
2. Set location to **3350 (Ballarat)** → ✅ items report **"not delivered to your area"**, *not*
   "unavailable", and offer a route to change location.
3. Clear the delivery location entirely (guest, no location) → ✅ every item reports **not yet
   determined**. ⚠ Nothing may claim to be available.
4. Change location between two served areas → ✅ verdicts re-decide.
5. **Five observers, five outcomes.** Show each message and ask what they would do next. ✅ 5/5
   correctly say: wait · change address · give up · tell us where you live · buy now. A message that
   does not imply an action has not distinguished anything.

### §4c — ⚠ The serviceability change (R2)

This slice repoints `GET /v1/storefront/serviceability` at the full four-term predicate.

```bash
curl -s 'http://localhost:8080/v1/storefront/serviceability?postcode=3350'
# BEFORE this slice: {"serviced":true}   ← the live defect: checkout could quote nothing
# AFTER  this slice: {"serviced":false}  ← honest
curl -s 'http://localhost:8080/v1/storefront/serviceability?postcode=3121'
# expect {"serviced":true} — a postcode with a real offering must NOT regress
```

⚠ **Both halves matter.** Only the first proves the fix; only the second proves it did not
over-correct and shut off the platform.

Then confirm the header and the saved list now agree for 3350 — one question, one answer (FR-014b).

### §4d — Guest saving and the join (US3, SC-008)

1. Signed **out**, tap the heart. ✅ It saves. ✅ **No sign-in prompt, no navigation away.**
2. Reload / relaunch. ✅ Still saved. *(Mobile: this is the FR-025 restart requirement — see §5.)*
3. Open on a second device, still signed out. ✅ Empty, and the surface says guest saves are
   device-held.
4. Sign in to an account that **already** has saved items, including at least one **overlapping**
   product. ✅ Union. ✅ Each product exactly once. ✅ The overlapping item keeps its **original**
   `saved_at` and `saved_price_amount`.
5. ✅ The shopper is **told** how many items joined (FR-032).
6. Sign out, sign in again. ✅ Identical result — the join is idempotent (FR-029).
7. Sign out. ✅ No saved items readable on the device (FR-031).
8. **⚠ Federated sign-in**: repeat step 4 via Google. Both `SignInForm` and `CallbackHandler` must
   call the join, or the OAuth return silently drops the guest list.

### §4e — Caps and bulk actions (SC-010)

```bash
# cap refusal by curl, not only through the UI — a UI-only guard is not a guard
curl -si -X PUT localhost:8080/v1/saved/<id> -H "Authorization: Bearer $TOKEN"
# at 200 saved items: expect 422 with a NAMED reason, not a generic validation error
```

1. ✅ Refused with an explanation. ✅ **Nothing already saved was evicted** (count is still 200).
2. Guest list at 50 → ✅ refused locally with a message.
3. Merge a guest list that would exceed 200 → ✅ truncates newest-first and **names what did not fit**.
4. Bulk add on a mixed list → ✅ every purchasable item lands in the cart; ✅ every skipped item is
   listed **with its reason**. ⚠ Zero silent omissions.
5. Bulk add where nothing is purchasable → ✅ refuses with an explanation, cart unchanged.

### §4f — Undo and ordering (FR-018)

1. Remove an item from the middle of the list. ✅ Undo affordance appears.
2. Undo. ✅ It returns to **the position it held**, not the top.
3. Remove it again, let the undo lapse, then save the product afresh from its detail page. ✅ Now it
   is at the **top**. These two are different acts and the list must say so.

### §4g — Accessibility and the monochrome risk (SC-009)

⚠ The brand has **no hue**, so a filled heart has *no colour cue at all*. Fill, shape and the
announced state carry the entire burden. This is a real, testable risk — it is the same class as 029's
unanswered "does a hueless banner draw the eye?".

1. Screen reader: activate the control. ✅ The accessible **name does not change**; only the
   pressed state does. ⚠ The predecessor swapped `aria-label` *and* set `aria-pressed`, which
   double-announces.
2. Largest supported text size, light **and** dark. ✅ Saved vs unsaved is still distinguishable.
3. **Five observers**, shown a grid with a mix. ✅ 5/5 correctly identify which are saved, without
   being told to look at colour.

### §4h — Reaching it (SC-011)

1. ✅ Saved items is in the account area on **both** surfaces. ⚠ Web's `app/(account)/layout.tsx`
   currently lists only Browse / Orders / Account — `/addresses` and the saved list are both absent.
2. ✅ Discoverable from the storefront **without** scrolling to the footer.
3. ✅ Any previously reachable `/favorites` address resolves somewhere sensible (FR-004).
4. Empty states: ✅ "never saved anything" and ✅ "saved things, none deliverable here" are
   **different**, and the second offers a location change.

### §4i — ⚠ Prove the cart's save-for-later is untouched (SC-015, FR-003)

Non-negotiable. Two capabilities, adjacent names, one heart and one bookmark.

```bash
cd apis/core-api && go test ./internal/features/cart/...   # must pass UNMODIFIED
```

Then by hand: set an item aside from the cart, restore it, discard it. ✅ Unchanged behaviour.
✅ Still a **bookmark**, not a heart. ✅ It did not appear in Saved items, and a saved item did not
appear in the cart's set-aside.

### §4j — ⚠ The mobile list's shape and its refresh (Phase 11, FR-068)

The mobile saved list stopped being a two-column product grid on 2026-08-02. Walk it on **both**
platforms — Android included, which has never been looked at across 028/029/033.

1. **Shape.** Open Saved items with at least four items, one of them price-dropped and one not
   purchasable. ✅ Full-width rows, one per item, in the cart's composition: thumbnail · name · brand ·
   verdict sentence · price with the struck-through save-time price above the action line. ✅ The
   verdict sentence is **one line**, not wrapped into three. ✅ Nothing on the screen is a bordered box.
2. **Refresh, in all three states.** Pull down on the **list** → spinner, then current prices. Pull
   down on the **empty** state (remove everything first) → the gesture works and the composition stays
   **centred**, not top-aligned. Kill `core-api`, reopen the screen to force the error state, pull down
   → the gesture works. ✅ Restart `core-api`, pull again → the list returns.
3. **A failed refresh keeps the list.** With items on screen, kill `core-api`, pull to refresh. ✅ The
   spinner stops and **the items are still there**. "We could not check" must never read as "you have
   nothing".
4. **Add to cart (FR-049/FR-050/FR-050a).** Tap "Add to cart" on a purchasable row. ✅ It lands in the
   cart and ✅ **stays on the saved list** — this is a watchlist; consuming the entry would end the
   price watch it exists for. ✅ The row now reads **"In your cart · View"**, and tapping View opens the
   cart. ✅ Add the same product again from the product page — the row reads **"2 in your cart"**.
   ✅ Empty the cart and the row returns to "Add to cart". ✅ No "Add to cart" on a non-purchasable row.
5. **⚠ Add everything (FR-051/FR-052) — this NEVER worked before 2026-08-02.** The action is now a
   **fixed bar at the bottom**. With a mix of purchasable and not, tap it. ✅ A **toast** states the
   count — and the count is **not zero**, which is what every earlier run reported because the per-item
   change id was not a uuid and the cart refused all of them. ✅ Open the cart and confirm the items and
   quantities are really there. ✅ Each item that did not go in carries "Not added — …" **on its own
   row**, and that reason is distinct from the row's verdict (an item can be purchasable and still be
   refused by a full cart).
   - ⚠ **Tapping it twice DOES add twice**, and that is current behaviour, not a bug being hidden: each
     tap mints a new batch id, and the cart's `Add` increments (`quantity + EXCLUDED.quantity`). The
     deterministic id only makes a **retry of the same batch** idempotent. The saved list keeps the
     item after an add (FR-050), and nothing on the row yet says it is already in the cart — see the
     carry-forward in the parity register.
6. **Undo (FR-017/FR-018).** Remove a row that is **not** the newest. ✅ A snackbar offers Undo; tap it.
   ✅ The item returns to **the position it held**, not to the top. Then re-save it deliberately from
   product detail — ✅ *that* one goes to the top.

### §4k — ⚠ The save control on mobile tiles (Phase 11b, FR-007)

Until 2026-08-02 no mobile tile carried a heart, so this path has **never** been walked.

1. **Home rails.** Tap the heart on a rail tile. ✅ It fills, and the product page does **not** open —
   the control consumes the tap. ✅ The same product further along another rail shows filled too
   (FR-013). Leave Home, come back — ✅ still filled on **first** render (FR-019).
2. **Search / browse / category / "see all".** All four are one screen. Tap a heart in the grid, open
   the saved list, ✅ it is there. Un-save it from the list, return to the grid — ✅ the heart is empty.
3. **Touch target.** With "Show taps"/pointer location on, aim at the outer edge of the heart's corner.
   ✅ It toggles rather than opening the product. It was a 32 dp target until this change.
4. **⚠ Guest cap (FR-047).** Signed out, save 50 products, then try a 51st. ✅ A message says the device
   is full and offers signing in — the heart must not just flip back in silence.
5. **⚠ Guest list is not clobbered.** Signed out with items saved, open Home and Search several times.
   ✅ The hearts stay filled — the membership read is signed-in only, because its answer is *adopted*
   and an empty one would wipe the device list.

---

## §5 — Known-risk checks

| Risk | Check | Why it matters |
|---|---|---|
| **Mobile restart persistence** | Force-quit the app with guest saves, relaunch | 030's carry-forward was that the delivery location does **not** survive restart. Its stated cause ("no key-value persistence") is stale — `DevicePreferences` has existed since 026 and the guest cart already survives. If saved items do **not** survive, the store was wired like `DeliveryContextStore`, with a no-op `persist`. |
| **iOS-only nav crash** | On iOS, background the app until the process is killed, relaunch with the saved-items screen on the stack | A route missing from `customerNavSavedState` throws on restore **on iOS only** and passes every Android test. |
| **Telemetry sink** | `getConsent()` in the browser console | ⚠ PostHog has **never been initialised** on customer-web — zero non-test call sites for `initAnalytics`/`setConsent`. Without US6, `capture()` is a no-op and **SC-012/SC-013 are unmeasurable**. Record it; do not claim it. |
| **Contract drift** | §1b | Not in CI. |
| **Cap under concurrency** | Fire 10 concurrent `PUT`s at a shopper sitting on 199 | The cap must be enforced inside the transaction; a service-layer count admits a race. |

---

## §6 — Sign-off checklist

- [ ] §1 machine sweep green, **package count verified** (§1a)
- [ ] §1b — every new DTO generated exactly once to Kotlin
- [ ] §2 — bundle table filled at all three points, under 174 KB, limit **not** raised
- [ ] §4a SC-001/SC-002 — the heart tells the truth on both surfaces
- [ ] §4b SC-007 — five outcomes, five observers
- [ ] §4c — 3350 flips to `false`, 3121 does **not** regress
- [ ] §4d SC-008 — 20 joins, zero lost/duplicated/evicted, federated path included
- [ ] §4e SC-010 — cap refused by `curl`, bulk add omits nothing silently
- [ ] §4f — undo restores position; re-save goes to top
- [ ] §4g SC-009 — 5/5 observers, screen reader, largest text, both appearances
- [ ] §4h SC-011 — 5/5 find it unaided on both surfaces
- [ ] §4i SC-015 — cart set-aside proven unchanged, its suite passing **unmodified**
- [ ] SC-014 — automated coverage exists for save · un-save · idempotency both ways · join · cap ·
      all five verdicts *(the predecessor had none)*
- [ ] `docs/audiences/customer-capabilities.md` gains a `## §033` section (Format B)
- [ ] `CLAUDE.md` gains its matching slice block
- [ ] Carry-forwards recorded honestly, including anything in §5 that did not hold

---

## §7 — SC-014 coverage map

The predecessor had **zero** automated tests on any surface, despite 019's task list claiming "+ tests"
for them. This is the evidence that replaced them.

| Requirement | Where it is proven |
|---|---|
| Save is idempotent | `saveditems/repository_test.go` `TestSave_IsIdempotent` (real Postgres) |
| Un-save is idempotent | `TestRemove_OfAnAbsentMembershipIsANoOp` |
| The control tells the truth | `TestMembershipIDs_ReturnsExactlyWhatIsSaved` · `SavedStoreTest` · `saved-store.test.ts` |
| Rapid taps settle on last intent | `SavedStoreTest.rapid taps settle on the last intent` |
| Refusal reverts only that product | `SavedStoreTest.a refusal reverts only the product that failed` |
| All five verdicts | `repository_test.go` `TestList_AllFiveVerdicts` (real Postgres) |
| CASE-arm ordering | `TestList_ArchivedBeatsNotYetDeterminedInTheCaseOrder` |
| Zone with no inbound offering | `TestList_ZoneWithNoInboundOfferingIsNotDeliverable` · `purchasable_test.go` |
| Unpriced method withdraws | `TestPurchasable_UnpricedMethodIsNotOffered` |
| Price drop / rise / currency change | `TestList_PriceDropIsDetected` · `_PriceRiseIsNotFlagged` · `_ACurrencyChangeReportsNoDrop` |
| Cap refuses, evicts nothing | `TestSave_RefusesAtTheCapAndEvictsNothing` |
| Merge is a union | `TestMerge_IsAUnion` |
| Merge is idempotent | `TestMerge_IsIdempotent` · `SavedStoreTest.the join is idempotent` |
| Merge keeps the account's baseline | `TestMerge_KeepsTheAccountsOriginalSavedAtAndPrice` |
| Merge without a device price | `TestMerge_WithoutADevicePriceUsesTheProductsCurrentPrice` |
| Merge truncates and names skips | `TestMerge_TruncatesAtTheCapAndNamesWhatDidNotFit` |
| Device list cleared only after ack | `SavedStoreTest.the device list is cleared only after the platform acknowledges` |
| Guest list survives restart | `SavedStoreTest.a guest list survives a restart` |
| Guest cap refuses | `SavedStoreTest.the guest cap refuses rather than evicting` |
| Bulk add omits nothing silently | `TestAddAllToCart_NamesEverySkipWithAReason` |
| Bulk add per-item changeId | `TestAddAllToCart_GivesEachItemItsOwnChangeID` |
| One statement at the cap | `TestList_AtTheCapIsStillOneStatement` |
| Wire contract, both languages | `wire_contract_test.go` ↔ `SavedWireContractTest.kt` |
| `available` is absent | `TestSavedItemDoesNotCarryAvailable` + the Kotlin twin |
| Verdict copy is distinct per outcome | `saved-display.test.ts` |
| Store survives corrupt storage | `saved-store.test.ts` |

**Not covered by machine tests, and stated rather than implied**: SC-009 (colour-free
distinguishability), SC-011 (5/5 find it), SC-007's observer half, and everything in Phase 10.
