# Delivery Model v2 — Epic & Requirements Backlog

**Written 2026-10-07** on branch `dev` (after 073). Source: the operator's direction in conversation
on the same date, checked against the code. It replaces the **same-day vs standard** model of
047 / 049 / 069 with **who delivers**: Effy (the default) or a courier (the exception).

> **How to use this file.** Each **epic** is one Spec Kit feature. Run its `/speckit-specify`
> prompt, then `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`. The tasks listed under an
> epic are the **backlog the plan and tasks.md must cover**. They are written down here so nothing
> is lost between specs; `/speckit-tasks` will re-order and refine them. A task found to be wrong
> during planning is fixed **here** too.
>
> ⚠ The specify prompts carry **zero technology**, as Spec Kit requires. Every file path, table and
> service name lives in the task lists, never in the prompts.
>
> ⚠ Mode of work is unchanged: Claude writes the code, migration SQL and Terraform. The operator
> runs every migration, deploy and `terraform apply`.

---

## 1. The model in one page

| | **Delivered by Effy** (default) | **Courier delivery** (exception) |
|---|---|---|
| **When** | The address's postcode is on Effy's delivery list | The postcode is **not** on the list, **or** back-office overrides the order. (A customer choosing courier is deferred — see E10.) |
| **Customer chooses** | A **time window**: today (before the cutoff, while there is room) or on any of the **next 3 days** | Nothing. "Arrives within the courier's timeframe" |
| **Who moves it** | Effy drivers: shops → hub → customer | A courier, either from the hub after Effy collects it, **or** straight from the shop (back-office setting: platform default, overridable per order) |
| **Fee** | Distance slab + weight slab + basket-value rule + optional window premium → rounded up → clamped | A courier fee table set in back-office |
| **If neither reaches the address** | — | Checkout refuses with a plain message |

**Override compensation** (back-office moves a paid Effy order to courier, an emergency):
the customer is **notified**; the admin chooses per order — **credit the fee difference as points
(default)**, **make delivery free**, or **refund the difference (last resort)**. If the courier
costs Effy more, **the customer is never charged again**.

**Decisions taken in conversation (2026-10-07)**

| # | Decision |
|---|---|
| D1 | Coverage is a **flat list of postcodes**, optionally grouped under names for convenience. Groups never affect price. Independent of shops; only Effy defines it. |
| D2 | **Distance rings are removed.** Distance = **straight-line** hub → the postcode's centre point. A listed postcode with no coordinates must have a distance entered by hand. |
| D3 | Effy fee = `round_up( base + distance_slab(km) + weight_slab(kg) + window_premium ) ± basket rule`, then clamped to the plan's floor/cap. |
| D4 | Basket-value rules: **free delivery above $X**, **small-order fee below $Y**. |
| D5 | **Window premium** per slot is allowed (reverses 069's "the fee does not vary by slot"). |
| D6 | **No demand ("surge") pricing.** |
| D7 | Courier fee = back-office **fee table** (weight slabs + flat per-order amount). Live quotes later. |
| D8 | Same daily slots apply to today and days +1..+3; **capacity per slot per day**. |
| D9 | Per-shop same-day exceptions and the same-day-eligible zone flag are **removed**. |
| D10 | A customer choosing courier is **deferred** (hidden feature, later). |
| D11 | **Points** (store credit) are a **separate epic, built first** (E1). |
| D12 | Orders placed before cutover **keep their old method**; new rules apply to new orders only. |
| D13 | A two-shop basket collected straight from the shops by a courier = **2 consignments**. The shop's address appearing as the sender on a courier label is **accepted**. |
| D14 | Which couriers serve Melbourne/Sydney with shop pickup is **researched during the plan** of E6. |

**Questions answered 2026-10-08 — the operator accepted every recommended answer.** They are now decisions; the "Recommended answer" column is the answer.

| # | Question | Epic | Answer (decided 2026-10-08) |
|---|---|---|---|
| Q1 | Is the Effy fee **per order** or **per package** (per shop)? Today it is per package (`shared/src/delivery/quote.ts` prices each `PackageInput`). | E3 | **Per order.** One van, one drop, one fee; per-shop pricing exposes the hidden-shop model in the total. |
| Q2 | Points: what is 1 point worth, do they expire, can they pay for the whole order, are they refundable as cash? | E1 | 1 point = $0.01, expiry 12 months from issue, may cover goods and delivery, never cashed out. Legal check on expiry (ACL). |
| Q3 | Does the free-delivery threshold also apply to **courier** orders? | E3 | No — courier has its own optional threshold, default off. |
| Q4 | Do "the next 3 days" count **calendar** days or **delivery** days (skipping non-delivery dates)? | E4 | Delivery days — reuse 069's non-delivery weekdays and dates. |
| Q5 | Does a courier order get a delivery **estimate** shown ("usually 2–4 business days")? | E5 | Yes, a back-office text range per courier service; never a promise. |
| Q6 | Can an admin move a courier order **back** to Effy? | E7 | Yes, but only before it is handed to the courier, and the customer is never charged more. |
| Q7 | What about orders with no shop pickup possible (shop closed, courier unavailable)? | E6 | Fall back to hub collection automatically; staff see it. |
| Q8 | Where does the customer see courier tracking? 053 forbids showing references because they reveal the number of shops. | E6 | Show one tracking link per **order** only when the order has a single consignment; otherwise "tracking sent by email per parcel" — needs a product call. |

---

## 2. Epic map and build order

```
E0 Cleanup & decision record  (no spec — housekeeping, can start now)
E1 Points / store credit       ──┐  (prerequisite of E7)
E2 Effy delivery coverage      ──┼─► E3 Fee engine v2 ──► E5 Checkout & order: Effy vs courier ──► E9 Cutover & retirement
                                  │        ▲                    ▲
E4 Effy windows (today + 3) ─────┼────────┘                    │
                                  │                             │
E6 Courier fulfilment ────────────┴──────────► E7 Override to courier + compensation
E8 Driver operations realignment  (after E4/E5)
E10 Deferred: customer picks courier, live courier quotes, courier API booking
```

| Epic | Proposed spec | Title | Depends on |
|---|---|---|---|
| E0 | — | Cleanup & decision record | — |
| E1 | 074 | Customer Points (store credit) | — |
| E2 | 075 | Effy Delivery Coverage (postcode list) | — |
| E3 | 076 | Delivery Fee Engine v2 | E2 |
| E4 | 077 | Effy Delivery Windows: today + 3 days | E2 |
| E5 | 078 | Checkout & Orders: Delivered by Effy vs Courier | E2, E3, E4 |
| E6 | 079 | Courier Fulfilment (hub handover or shop pickup) | E5 |
| E7 | 080 | Back-Office Courier Override & Compensation | E1, E5, E6 |
| E8 | 081 | Driver Operations Realignment | E4, E5 |
| E9 | 082 | Cutover & Retirement of Same-Day/Standard | E5–E8 |
| E10 | later | Deferred items | — |

Numbering assumes nothing else takes 074–082 first; renumber freely.

> ⚠ **2026-10-08 — renumbered by one from E2 on.** Spec **075 is now the back-office front door**
> (`specs/075-staff-gateway/`): the shared gateway reached its 300-route / 300-integration ceiling when
> 074 deployed, and nothing below can ship until it is split. E2 becomes 076, E3 077, … E9 083.

---

> **2026-10-08 — 075 is done: back-office moved to the staff gateway in dev**
> (`specs/075-staff-gateway/SIGNOFF.md`). The shared gateway is at 53%. ⚠ From 076 on, every **back-office** route attaches to the
> **staff** gateway (`/effy/<env>/staff/…` parameters) and every customer, shop or driver route to
> the shared one; each plan says which.

> **2026-10-08 — E2 (spec 076, Effy Delivery Coverage) is code-complete**
> (`specs/076-effy-delivery-coverage/SIGNOFF.md`). It evolved `delivery_zone` / `delivery_zone_postcode`
> in place rather than creating the `effy_coverage_*` tables sketched under E2 below. What it leaves
> for later epics to remove:
> - **E3** — the fee-tier bridge (`coverage_ring_for_km`, `delivery_zone.ring_id`, `delivery_ring*`,
>   the read-only `GET /admin/v1/delivery/rings`). Price from `delivery_zone_postcode.distance_km`.
> - **E5** — the same-day bridge (`delivery_zone.sameday_eligible`, `shop_sameday_exception`), and flip
>   `COURIER_ORDERING_AVAILABLE` when a courier order can be placed; teach the quote `coverage: "courier"`.
> - **E8** — driver clearances keyed on a group (`driver_zone_capability.zone_id`): an ungrouped
>   postcode is deliverable only by an every-zone driver until then.
> - **E9** — rename the two tables; drop the frozen columns.

## E0 — Cleanup & decision record (no spec)

Housekeeping that makes the later specs honest. Nothing here changes behaviour.

**Tasks**

- [x] E0-T01 Record this decision in `CLAUDE.md` → "Driver logistics model": a short ⚠ note that the same-day/standard split is **being replaced** by Effy-vs-courier (link this file). Do not rewrite the section until E9 lands.
- [x] E0-T02 Add an entry to `docs/next-implementation-candidates.md` pointing here, and mark which existing candidates this backlog absorbs or blocks.
- [ ] E0-T03 Inventory every reader of `METHOD_SAME_DAY` / `METHOD_STANDARD` (`apis/edge-api/shared/src/delivery/plan.ts`) and write the list into E9's task list. Current footprint: ~150 files across `apis/edge-api/{shared,commerce,orders,fleet,driver,shop,admin,notifications}`, `packages/shared-types/src`, `apps/{customer-web,customer-mobile,driver-mobile,back-office,shop-web}`.
- [ ] E0-T04 Inventory every reader of `delivery_ring`, `delivery_zone.ring_id`, `delivery_zone.sameday_eligible`, `shop_sameday_*` and `driver_zone_capability.method`; attach to E2 / E8 / E9.
- [ ] E0-T05 Inventory every place the customer sees the words "same-day" or "standard" (web, mobile, email templates in `packages/email-kit`, receipts in `apis/edge-api/notifications/src/receipts`). Attach to E5.
- [ ] E0-T06 Check `ORDER-FLOW-GAPS.md` for items that this model changes (carrier handoff, delivery promise) and annotate them.
- [x] E0-T07 Confirm with the operator the open questions Q1–Q8 above; write answers into §1. (2026-10-08: all recommendations accepted.)
- [ ] E0-T08 Legal pre-check list for the specs: store-credit terms and expiry (ACL / state fair-trading), displaying delivery fees and surcharges up front (ACL component pricing), terms-of-service text for courier delivery. Hand to 045's legal system owner.
- [ ] E0-T09 Product copy glossary: "Delivered by Effy", "Courier delivery", "Delivery window", "Effy points", "Free delivery over $X", "Small order fee". Store it in `docs/conventions/` so all six apps use the same words.

---

## E1 — Customer Points (store credit) · spec 074

> ✅ **Built 2026-10-08** — code-complete and machine-verified, not yet deployed. See
> [specs/074-customer-points/SIGNOFF.md](../../specs/074-customer-points/SIGNOFF.md). Courier-override
> compensation (E7) credits through `credit()` in `@effy/edge-shared/points` with reason
> `courier_override_compensation` and a `dedupeKey`.

**Goal.** Customers hold a points balance that Effy can credit (first use: compensation for a
courier override in E7) and that the customer can spend at checkout.

**In scope:** balance, ledger of credits/debits with reasons, spending at checkout, expiry,
back-office manual credit/debit with reason and audit, customer sees balance and history, refund
of a points-paid order returns points.
**Out of scope:** earning points on purchases (loyalty programme), tiers, transfers, cash-out.

**Acceptance (headline)**
- A credit always has a reason and an author; the balance always equals the sum of the ledger.
- A customer can pay part or all of an order with points; a refund returns points to points and
  money to the card in the same proportion they were paid.
- Expired points never reduce an order total.
- No path lets a customer's balance go negative.

**`/speckit-specify` prompt**

```
/speckit-specify Customer Points (store credit). Effy customers have a points balance that Effy can
add to and the customer can spend. This feature introduces the balance; earning points by buying is
NOT part of it. Back-office staff can credit or debit a customer's points for a stated reason, and
every change is recorded with who did it, when, why, and which order it relates to (if any). A
customer sees their balance and a plain history of every change on web and mobile. At checkout a
customer can choose to use points toward an order — part of it or all of it, goods and delivery
alike — and sees exactly how much was paid by points and how much by card before paying. Points
have a fixed money value and an expiry set by the business; expired points are never usable and
the customer is told before points expire. If an order paid partly with points is cancelled or
refunded, points go back as points and card money goes back to the card, in the same proportion.
A balance can never go negative. Points can never be withdrawn as cash. Later features will credit
points automatically (for example as compensation when Effy changes how an order is delivered), so
crediting must be something other parts of the platform can do with a reason, not only a manual
staff action. Back-office roles: admins and managers can credit and debit; customer-service agents
can view and credit up to a limit set by the business. The value of a point, the expiry period and
the agent credit limit are business settings.
```

**Tasks**

*Data*
- [x] E1-T01 Migration: `public.points_ledger` (customer sub, delta in points, reason code, free-text note, order id nullable, actor sub + audience, expires_at, created_at). Append-only; no UPDATE/DELETE grants.
- [x] E1-T02 Migration: balance view or function `public.points_balance(sub, at)` that ignores expired credits (FIFO consumption) — one place decides what counts.
- [x] E1-T03 Migration: `public.points_settings` singleton (point value cents, expiry days, CSA credit limit, expiry-warning days).
- [x] E1-T04 Migration: order columns for points paid (`points_redeemed`, `points_value_cents`) and refund proportion bookkeeping.
- [x] E1-T05 Grants for `effy_shopper` (read own balance, insert redemption only via the checkout function) — check against 070's role rules.
- [x] E1-T06 Seed for dev: settings row + a few ledger rows (`db/seeds/`).
*Shared library*
- [x] E1-T07 `@effy/edge-shared/points`: `credit()`, `debit()`, `balance()`, `redeem()` — the only writers. Other services call it (mirrors the money-logic-lives-once rule for `payments`).
- [x] E1-T08 Integrate points into `@effy/edge-shared/payments` refunds (`shared/src/payments/refunds/service.ts`): split a refund into card part and points part.
- [x] E1-T09 Guard test: no SQL writes `points_ledger` outside `shared/src/points` (pattern of existing `*.guard.test.ts`).
- [x] E1-T10 Live announce kind `points` from `@effy/edge-shared/live`; extend `change-map.guard.test.ts`.
*Commerce (checkout)*
- [x] E1-T11 Quote/intent: accept "use N points"; validate against live balance; reduce the payment-intent amount; zero-card-amount orders skip the payment provider and confirm directly.
- [x] E1-T12 Hold points at the payment-intent call (same moment slots are held, 069), confirm at payment, release on failure/abandon.
- [x] E1-T13 Contract types in `packages/shared-types/src/checkout.ts` (+ Kotlin `contract/CommerceDto.kt`).
*Customer service*
- [x] E1-T14 `GET /customer/v1/points` (balance, next expiry) and `GET /customer/v1/points/history` (paged).
*Admin service*
- [x] E1-T15 `GET /admin/v1/customers/{sub}/points`, `POST …/points/credit`, `POST …/points/debit` with role rules and CSA limit; audit rows in `admin` schema.
*Notifications*
- [x] E1-T16 Email + push "You've received N points" and "N points expire on DATE" (email-kit template; notifications worker copy).
- [x] E1-T17 Scheduled expiry-warning job (Lambda schedule in the `notifications` or `customer` service; no always-on compute).
*Back-office*
- [x] E1-T18 Customer detail: points balance, history table, credit/debit dialog with reason.
- [x] E1-T19 Settings screen: point value, expiry, CSA limit.
*Customer web*
- [x] E1-T20 Account → Points page (balance, history, expiry).
- [x] E1-T21 Checkout: "Use points" control, live total split, error states (balance changed, expired).
- [x] E1-T22 Receipt and order detail show the points line.
*Customer mobile*
- [x] E1-T23 Points screen (ViewModel → UseCase → Repository).
- [x] E1-T24 Checkout points control in `features/checkout/presentation/CheckoutScreen.kt` / `CheckoutViewModel.kt`.
- [x] E1-T25 Receipt/order detail points line.
*Telemetry, legal, docs*
- [x] E1-T26 PostHog events `points_viewed`, `points_applied_at_checkout` in the shared taxonomy (no amounts beyond what the taxonomy allows).
- [x] E1-T27 CloudWatch metric + alarm: ledger/balance mismatch check (scheduled reconciliation).
- [x] E1-T28 Legal: points terms in `packages/legal-content`; receipt wording.
- [x] E1-T29 Tests: ledger invariants (container), refund split, zero-card-amount checkout, expiry FIFO, concurrency (two checkouts spending the same points).
- [x] E1-T30 FEATURE-HISTORY entry + operator steps (migration, deploy order: shared → customer/admin/commerce → web → mobile).

---

## E2 — Effy Delivery Coverage (postcode list) · spec 076 — ✅ built 2026-10-08

**Goal.** Back-office maintains the list of postcodes Effy delivers to. Being on the list means
"Delivered by Effy"; not being on it means "Courier delivery" (or refused, if the courier does
not reach it either). Rings and per-shop same-day rules go.

**In scope:** list management, optional named groups, distance per postcode (computed from the
hub, or entered by hand), courier reach list/rule, the coverage check used by checkout and
address entry, removing rings/same-day eligibility/shop exceptions from configuration.
**Out of scope:** pricing (E3), windows (E4).

**Acceptance (headline)**
- An admin adds "Richmond" and sees the postcode(s) it covers; the customer at a Richmond address
  is told Effy delivers there.
- A postcode can belong to at most one group; every listed postcode has a distance.
- An address outside the list but inside courier reach is told "Courier delivery".
- An address outside both is told plainly Effy cannot deliver there.
- No shop setting can change coverage.

**`/speckit-specify` prompt**

```
/speckit-specify Effy Delivery Coverage. Effy decides, alone and independently of any shop, which
places it delivers to with its own drivers. Back-office staff maintain a list of postcodes Effy
delivers to, found by searching real place names (suburbs and towns) so nobody types raw postcodes.
Postcodes can optionally be grouped under a name (for example "Inner Melbourne") purely to make the
list easier to manage; a group never changes price or service. A postcode belongs to at most one
group. Every listed postcode has a distance from Effy's hub: the platform works it out from the
place's location, and when a place has no known location staff must enter the distance by hand
before it can be listed. An address whose postcode is on the list is "Delivered by Effy". An address
not on the list is "Courier delivery", as long as courier delivery reaches it; the business keeps a
simple rule for where courier delivery is offered (by default everywhere in the country except
places the business excludes). An address that neither reaches is refused with a plain sentence
that says Effy cannot deliver there, and the refusal is the same sentence wherever the customer
meets it (adding an address, at checkout). The old arrangement — distance tiers, zones that offer
"same-day", and per-shop exceptions to same-day — is removed from configuration; what each shop
fulfils never decides whether Effy delivers. Removing a postcode from the list never changes an order
already placed. Staff can see, for any postcode, whether it is Effy, courier or refused and why.
Customers never see group names, distances or the hub's location.
```

**Tasks**

*Data*
- [ ] E2-T01 Migration: `public.effy_coverage_postcode` (postcode PK, group id nullable, distance_km NOT NULL, distance_source `computed|manual`, added_by, timestamps) — UNIQUE(postcode) is the guarantee.
- [ ] E2-T02 Migration: `public.effy_coverage_group` (code, name, status). Display-only.
- [ ] E2-T03 Migration: courier reach — `public.courier_excluded_postcode` (postcode, reason) + settings flag `courier_default_reach = 'national'`.
- [ ] E2-T04 Data migration: copy every postcode in `public.delivery_zone_postcode` into `effy_coverage_postcode` (group = old zone, distance = old `delivery_zone.hub_distance_km` or recomputed from `public.locality` lat/long), so dev keeps its coverage.
- [ ] E2-T05 SQL function `public.coverage_for_postcode(text)` → `effy | courier | none` + reason. One place decides; mirrors `round_opens_at` discipline.
- [ ] E2-T06 SQL/TS: straight-line (haversine) distance hub (`delivery_settings.hub_latitude/longitude`) → `locality` lat/long; pick the primary locality per postcode by `address_count`.
- [ ] E2-T07 Recompute rule: when hub coordinates change, recompute every `computed` distance; never touch `manual` ones. Admin sees how many changed.
- [ ] E2-T08 Mark old tables deprecated in comments (`delivery_ring`, `delivery_zone.ring_id`, `delivery_zone.sameday_eligible`, `shop_sameday_*`); actual drops in E9.
*Shared library*
- [ ] E2-T09 Replace `shared/src/delivery/zone.ts` `zoneForPostcode` / `sameDayForShops` with `coverageForPostcode()` returning `{kind, distanceKm, groupId}`. Keep the old exports until E9.
- [ ] E2-T10 `shared/src/delivery/locality.ts`: expose place search for coverage (reuse 047's search).
- [ ] E2-T11 Unit + container tests for coverage decisions, including PO-box postcodes with no locality.
*Admin service* (`apis/edge-api/admin/src/delivery/`)
- [ ] E2-T12 Routes: list coverage (filter by group, search), add postcodes (by place search), remove postcode, set manual distance, create/rename/disable group, move postcode between groups.
- [ ] E2-T13 Routes: courier exclusions list/add/remove.
- [ ] E2-T14 Route: coverage check for a postcode (replaces `delivery-postcode-check-v1-get.ts`) with the reason.
- [ ] E2-T15 Retire routes (stop registering, keep code until E9): `delivery-rings-*`, `delivery-zone-suggest-ring-*`, `delivery-exception-*` (per-shop same-day), the ring parts of `delivery-zones-*`.
- [ ] E2-T16 Audit rows for every coverage change (admin schema).
- [ ] E2-T17 Live announce `coverage` kind; update `change-map.guard.test.ts`.
*Storefront / customer services*
- [ ] E2-T18 Address add/edit returns coverage (`effy | courier | none`) — same sentence source as checkout.
- [ ] E2-T19 Public "Do we deliver to you?" check (storefront) if the home page uses one.
*Shared types*
- [ ] E2-T20 `packages/shared-types/src/delivery-admin.ts`: coverage DTOs; remove ring DTOs from the console surface. Kotlin contract mirror if mobile uses it.
- [ ] E2-T21 `packages/shared-types/src/delivery.ts`: `CoverageKind` and the refusal code + sentence.
*Back-office* (`apps/back-office/src/features/delivery/`)
- [ ] E2-T22 New Coverage screen: postcode table (place, postcode, group, distance, source), place-search add dialog (replaces `AddPostcodeDialog.tsx`), manual-distance edit, bulk move to group.
- [ ] E2-T23 Groups panel (replaces `NewZoneDialog.tsx`).
- [ ] E2-T24 Courier exclusions panel.
- [ ] E2-T25 Postcode checker widget (Effy / courier / none + why).
- [ ] E2-T26 Remove `NewRingDialog.tsx`, `SameDayExceptionsDialog.tsx` from the screen (delete files in E9).
- [ ] E2-T27 Access rules in `features/delivery/access.ts` (admin/manager edit, csa read).
*Customer surfaces*
- [ ] E2-T28 customer-web address picker (`app/checkout/AddressPicker.tsx`) shows Effy/courier/none.
- [ ] E2-T29 customer-mobile address flow shows the same.
*Tests, docs*
- [ ] E2-T30 Container tests: migration of old zones preserves coverage; distance recompute; refusal sentence identical across routes.
- [ ] E2-T31 Update `docs/delivery-console-guide.md`.
- [ ] E2-T32 FEATURE-HISTORY entry + operator steps.

---

## E3 — Delivery Fee Engine v2 · spec 076

**Goal.** One fee engine prices both kinds of delivery: Effy by distance + weight + basket value
+ window premium; courier by its own table.

**In scope:** fee plans (versioned, one active), distance slabs, weight slabs (kept), free-delivery
threshold, small-order fee, per-slot window premium, rounding and floor/cap (kept), courier fee
table, a plan preview/simulator, the quote used everywhere.
**Out of scope:** surge pricing (D6), live courier quotes (E10).

**Acceptance (headline)**
- Two identical baskets, one 5 km and one 25 km from the hub, are priced by their distance slabs.
- A heavier basket never costs less than a lighter one at the same distance.
- A basket over the free threshold pays $0 Effy delivery; below the small-order line pays the fee.
- A plan cannot be activated unless every listed postcode and every weight can be priced.
- The fee shown before payment is the fee charged.

**`/speckit-specify` prompt**

```
/speckit-specify Delivery Fee Engine v2. Effy prices delivery two ways. "Delivered by Effy" is priced
from four things: how far the delivery postcode is from Effy's hub, in distance bands the business
sets (for example 0–10 km, 10–20 km, 20 km and beyond); how heavy the basket is, in weight bands;
the basket's value (free delivery above an amount the business sets, and an extra small-order fee
below another amount); and, optionally, a surcharge on particular delivery windows (for example
windows today, or busy evening windows). The result is always rounded UP to a step the business sets,
and kept between a minimum and maximum fee. "Courier delivery" is priced from its own table: weight
bands plus a flat amount per order, with an optional free-delivery threshold that is off by default.
There is no pricing that changes with demand. All of these values live in named fee plans owned by
the business; many plans can exist but exactly one is active, and a plan cannot be made active
unless it can price every postcode Effy delivers to and every basket weight — an address Effy
delivers to must never come back "no price", and must never be free by accident. Staff can try a
plan before activating it: enter a postcode, a weight, a basket value and a window, and see the fee
and how it was built. The customer sees the delivery fee, and any small-order fee or window
surcharge, as separate lines before paying, and the amount charged is exactly the amount shown.
Activating a new plan never changes the fee of an order already placed. Shops never see or affect
delivery fees. Fees include GST.
```

**Tasks**

*Data*
- [ ] E3-T01 Migration: `delivery_fee_plan` v2 columns — `base_cents`, distance bands table `delivery_fee_distance_band(plan_id, upper_km, add_cents)` with one open top band.
- [ ] E3-T02 Keep weight bands table; confirm open-top rule.
- [ ] E3-T03 Columns: `free_over_cents` (nullable), `small_order_under_cents` + `small_order_fee_cents`.
- [ ] E3-T04 Migration: `delivery_slot_premium(plan_id, slot_id, add_cents)` — premium belongs to the plan, not the slot, so a plan change never edits slots.
- [ ] E3-T05 Migration: `courier_fee_plan` (or a `kind` on the same plan) — weight bands, flat per order, optional free threshold, step/floor/cap.
- [ ] E3-T06 Drop the method factor (`same_day_factor`, `factorMilli`) from the active-plan contract (column drop in E9).
- [ ] E3-T07 Activation check as SQL function `delivery_plan_is_complete(plan_id)` — every listed postcode's distance falls in a band, weight bands cover 0..∞, premiums reference active slots.
- [ ] E3-T08 Snapshot fee breakdown onto the order (`order_delivery_fee` columns or JSON: base, distance add, weight add, premium, small-order, discount from threshold, rounding) so a receipt can always explain itself.
*Shared library* (`apis/edge-api/shared/src/delivery/`)
- [ ] E3-T09 Rewrite `engine.ts` `fee()` → `effyFee({distanceKm, grams, basketCents, premiumCents, plan})` and `courierFee({grams, basketCents, plan})`; integer cents, round-up rule kept; returns the breakdown.
- [ ] E3-T10 Table tests for every band edge, threshold edge, floor/cap, rounding (port `engine.test.ts`).
- [ ] E3-T11 `plan.ts`: load v2 plan; remove ring pricing.
- [ ] E3-T12 `quote.ts`: price per **order** (if Q1 = per order) — replace `PackageQuote` per-shop options with one order-level quote; remove `ServedZoneUnpricedError` ring wording, keep the fail-loud invariant.
- [ ] E3-T13 Basket value definition: goods after promo discount, before delivery, GST-inclusive — write it once and test it.
- [ ] E3-T14 Alarm metric when a listed postcode cannot be priced (port the existing invariant metric).
*Admin service*
- [ ] E3-T15 Routes: create plan (v2 shape), edit draft plan, activate (with completeness check), list plans, preview/simulate fee.
- [ ] E3-T16 Routes: courier fee plan create/activate/simulate.
- [ ] E3-T17 Retire ring-priced plan creation in `delivery-plans-create-v1-post.ts`.
*Shared types*
- [ ] E3-T18 `delivery-admin.ts`: plan v2 DTOs, simulator request/response with breakdown.
- [ ] E3-T19 `checkout.ts`: fee breakdown lines for the customer (delivery, small-order fee, window surcharge, free-delivery saving).
*Back-office*
- [ ] E3-T20 Fee plan editor v2 (replaces `NewPlanDialog.tsx`): base, distance bands table, weight bands table, thresholds, step/floor/cap, window premiums per slot.
- [ ] E3-T21 Fee simulator panel.
- [ ] E3-T22 Courier fee plan editor + simulator.
- [ ] E3-T23 Activation error messages that name the exact gap (lesson from 047's "nobody could say which term refused").
*Customer surfaces* (display only; the flow is E5)
- [ ] E3-T24 customer-web: fee breakdown lines component (cart + checkout) and "Spend $N more for free delivery" hint.
- [ ] E3-T25 customer-mobile: same.
- [ ] E3-T26 Receipt (web, mobile, email) shows breakdown lines (`apis/edge-api/notifications/src/receipts`, `packages/email-kit`).
*Tests, legal, docs*
- [ ] E3-T27 Legal check: surcharge display rules (ACL), round-up already cleared by 047 — confirm still valid with new components.
- [ ] E3-T28 Container tests: activation refuses incomplete plans; placed orders keep their snapshotted fee after plan change.
- [ ] E3-T29 Update `docs/delivery-console-guide.md`.
- [ ] E3-T30 FEATURE-HISTORY entry + operator steps.

---

## E4 — Effy Delivery Windows: today + 3 days · spec 077

**Goal.** For "Delivered by Effy", the customer picks a window today or on any of the next 3
delivery days. Same daily slots, capacity per slot per day.

**In scope:** offering windows across 4 days, per-day capacity, today's cutoff and
collection-run reachability (kept from 069), holds at payment intent (kept), non-delivery days
(kept, now Effy days), window premium display (priced by E3).
**Out of scope:** the courier flow; driver planning changes (E8).

**Acceptance (headline)**
- At 10:00 with a 14:00 cutoff, the customer sees today's open windows and all windows on the next
  3 delivery days.
- After the last cutoff today, today shows "No windows left today" and the next 3 days remain.
- A full window on Thursday does not affect the same window on Friday.
- A non-delivery date is skipped and the lookahead still offers 3 delivery days.

**`/speckit-specify` prompt**

```
/speckit-specify Effy Delivery Windows: today and the next three days. When an order is "Delivered
by Effy", the customer chooses a delivery time window. The business defines the daily windows (start
time, end time, the last moment it can be chosen, and how many deliveries it takes). The same windows
repeat each delivery day. The customer can choose a window today — only while its cutoff has not
passed, it still has room, and Effy can still collect the goods from its suppliers and get them ready
before the window starts — or a window on any of the next three delivery days. Days the business marks
as non-delivery days (certain weekdays, public holidays) are skipped and do not count toward the three.
Each window has its own room on each day: a full Thursday evening says nothing about Friday evening.
A customer's place in a window is held for a short time while they pay, and confirmed when payment
succeeds; a customer is never charged for a window they did not get, and if payment arrives after the
hold lapsed and the window has since filled, the customer keeps the window they paid for and staff are
told. A window with a surcharge shows it next to the window. If no window is available on any of the
four days, the customer is told plainly and offered courier delivery instead only if the business
allows it. Changing or disabling a window changes what new customers are offered, never what a placed
order was sold. Back-office sees, for each day and window, how full it is.
```

**Tasks**

*Data*
- [ ] E4-T01 `delivery_slot_booking` already has `delivery_date` — confirm capacity counting (`delivery_slot_load`) is per `(slot_id, delivery_date)`; fix if it counts today only.
- [ ] E4-T02 Settings: `effy_lookahead_days` (default 3), reuse `standard_no_delivery_weekdays` and `delivery_non_delivery_date` renamed to Effy semantics (rename in E9; alias now).
- [ ] E4-T03 Retire `carrier_lead_days` from the Effy path (still used by courier in E6 if needed).
*Shared library*
- [ ] E4-T04 `shared/src/delivery/slots.ts`: `openWindows(now, lookahead)` returns windows across today + N delivery days; today keeps the cutoff + collection-run reachability gate (`sameday.ts` logic moves here); future days gate on cutoff only (decide: cutoff the day before? — clarify).
- [ ] E4-T05 Merge `standard-days.ts` day-list logic into the window calendar; delete standard-day picking for Effy.
- [ ] E4-T06 Holds: unchanged moment (payment-intent), keyed by date; tests for cross-day holds.
- [ ] E4-T07 Timezone tests (Melbourne) around midnight and DST change days.
*Fleet service* (`apis/edge-api/fleet/src/slots`, `deliverydays`)
- [ ] E4-T08 Slot admin routes unchanged in shape; add per-day fullness read (`delivery-slots-v1-get.ts` gains a date range).
- [ ] E4-T09 Delivery-days routes: rename semantics to Effy delivery days.
*Commerce*
- [ ] E4-T10 `commerce/src/checkout/delivery-choice.ts`: replace `preferredMethod` same_day/standard with "Effy window chosen (slot + date)"; remove `standardDate` path for Effy.
- [ ] E4-T11 Refusal codes `slot_required`, `slot_unavailable` kept; add `no_windows_available`.
*Shared types*
- [ ] E4-T12 `delivery-window.ts`: window = `{slotId, date, start, end, premiumCents, full}`; grouped by day.
*Back-office*
- [ ] E4-T13 `SlotsPanel.tsx`: show fullness per day for the next 4 days.
- [ ] E4-T14 `DeliveryDaysPanel.tsx`: wording → Effy delivery days; lookahead setting.
*Customer surfaces*
- [ ] E4-T15 customer-web `DeliveryOptions.tsx`: day tabs (Today, Tue, Wed, Thu) + window list with surcharge; empty states.
- [ ] E4-T16 customer-mobile checkout window picker (`CheckoutScreen.kt`, `DeliveryWindowText.kt`).
- [ ] E4-T17 Order detail / receipt: "Thursday 9 Oct, 4–6 pm".
*Tests, docs*
- [ ] E4-T18 Port `CheckoutFlow.slots.test.tsx`, `slots.test.ts`, `sameday.test.ts`, `standard-days.test.ts`.
- [ ] E4-T19 FEATURE-HISTORY entry + operator steps.

---

## E5 — Checkout & Orders: Delivered by Effy vs Courier · spec 078

**Goal.** Every order is either "Delivered by Effy" (with a window) or "Courier delivery" (no
window). Checkout, the order record, status, receipts and every app speak this one language.

**In scope:** deciding the delivery type at checkout from coverage, the order's delivery type and
its history of changes, customer-facing copy everywhere, status words, receipts/emails, shop and
back-office display, telemetry.
**Out of scope:** how courier parcels physically move (E6), override + compensation (E7).

**Acceptance (headline)**
- A customer at a listed postcode checks out with a window and sees "Delivered by Effy".
- A customer outside the list sees "Courier delivery — arrives within the courier's timeframe",
  the courier fee, and no window picker.
- Every app, email and receipt shows the same delivery-type words.
- The order keeps a history of every delivery-type change, with who and why.

**`/speckit-specify` prompt**

```
/speckit-specify Checkout and Orders: Delivered by Effy vs Courier delivery. Every Effy order is
delivered one of two ways, decided at checkout from the delivery address: "Delivered by Effy" when the
address is in Effy's delivery area, and "Courier delivery" when it is not but a courier reaches it.
The customer does not choose between them in this feature. For "Delivered by Effy" the customer picks
a delivery window and pays Effy's delivery fee. For "Courier delivery" there is no window and no date
to pick; the customer is told the order arrives within the courier's usual timeframe (an estimate the
business sets, never a promise) and pays the courier fee. If the customer changes the address during
checkout, the delivery type, fee and window choice update immediately and nothing chosen for the old
address is silently carried over. The order records its delivery type and every later change to it,
with who changed it, when and why. One order has one delivery type, whatever number of suppliers fill
it, and the customer never learns how many suppliers were involved. Every place the customer sees the
order — order list, order detail, tracking, receipt, confirmation email, notifications — uses the same
two names and shows the window (Effy) or the courier estimate (courier). Order status keeps the
platform's single set of status words; courier orders use "With carrier" once the courier has them.
Shop staff see whether a package is going with an Effy driver or a courier, never the customer's
window or fee. Back-office sees and can filter orders by delivery type. The old "same-day" and
"standard" names disappear from everything a customer or shop sees.
```

**Tasks**

*Data*
- [ ] E5-T01 Migration: `order.delivery_type` (`effy | courier`, NOT NULL for new orders; NULL = legacy), `order.delivery_type_reason` (`in_coverage | out_of_coverage | admin_override | customer_choice`).
- [ ] E5-T02 Migration: `order_delivery_type_change` history (order id, from, to, reason, actor, note, created_at).
- [ ] E5-T03 Order-level window snapshot: today it is on `order_package_delivery` (`slot_id`, `window_start`, `window_end`) — decide (with Q1) whether it moves to the order; package rows keep a copy for dispatch.
- [ ] E5-T04 `shop_fulfillment.delivery_method` → read-compatible `delivery_type`; legacy values preserved.
- [ ] E5-T05 Courier estimate text setting (`delivery_settings.courier_estimate_text`).
*Shared library*
- [ ] E5-T06 `shared/src/delivery/quote.ts`: `QuoteResult` becomes `{kind:'effy', windows, fee} | {kind:'courier', fee, estimate} | {kind:'none'}`.
- [ ] E5-T07 `shared/src/status/status.ts` (`packageStatus`): courier path Preparing → Ready → (With driver → At hub, if hub collection) → With carrier → Delivered; Effy path unchanged. Keep the nine words (073).
- [ ] E5-T08 `shared/src/lib/order-completion.ts`: completion rules per delivery type.
- [ ] E5-T09 `shared/src/live/order-moves.ts`: announce on delivery-type change.
*Commerce*
- [ ] E5-T10 `commerce/src/checkout/service.ts` / `quote.ts`: compute type from coverage; courier path requires no slot; intent stores type + fee breakdown.
- [ ] E5-T11 Refuse `kind:'none'` with the shared sentence.
- [ ] E5-T12 Customer orders list/detail DTOs carry `deliveryType`, window or estimate.
*Orders / shop / admin services*
- [ ] E5-T13 `orders/src/orders/service.ts` + `promise.ts`: delivery promise per type (window vs estimate).
- [ ] E5-T14 `shop/src/fulfillments/promise.ts`, `shop/src/orders/*`, `shop/src/today/*`, `shop/src/pick-lists/*`: replace same-day/standard grouping with "Effy driver" vs "Courier"; keep `no-delivery-window.guard.test.ts` intent (shops never see the window).
- [ ] E5-T15 `shop/src/insights/window.ts`: insights split by type.
- [ ] E5-T16 Admin order list filter + detail (`packages/shared-types/src/order-admin.ts`).
*Shared types*
- [ ] E5-T17 `order.ts`, `checkout.ts`, `shop-order-console.ts`, `order-admin.ts`, `delivery.ts`: `DeliveryType`; deprecate method fields.
- [ ] E5-T18 Kotlin contracts in `packages/shared-types/contract*/`.
*Notifications*
- [ ] E5-T19 `notifications/src/receipts/sender.ts` + `repository.ts`: receipt shows type + window/estimate.
- [ ] E5-T20 Email templates in `packages/email-kit` (confirmation, delivered) — new wording; fixtures in `packages/email-kit/src/fixtures`.
- [ ] E5-T21 Push copy (`notifications/src/worker/copy.ts`) per type.
*Customer web*
- [ ] E5-T22 `app/checkout/CheckoutFlow.tsx` + `DeliveryOptions.tsx`: Effy → window picker; courier → estimate block, no picker.
- [ ] E5-T23 `components/receipt/*`, `StatusPill.tsx`, `_components/status-palette.ts`: wording.
- [ ] E5-T24 Order list/detail pages.
- [ ] E5-T25 e2e (`apps/customer-web/e2e`): Effy checkout, courier checkout, address switch Effy→courier.
*Customer mobile*
- [ ] E5-T26 `features/checkout/domain/Checkout.kt`, `data/CheckoutMappers.kt`, `presentation/*`: delivery type.
- [ ] E5-T27 Orders/Receipt screens; decide on `TrackOrderScreen.kt` (dead code per candidates register #7) — delete or wire with the new language.
- [ ] E5-T28 `core/error`, `core/observability` references to same-day.
*Shop web / shop mobile*
- [ ] E5-T29 shop-web `features/fulfillment/components/ItemsAndFulfilment.tsx`, `features/today/*`: "Effy driver" / "Courier" chips.
- [ ] E5-T30 shop-mobile `features/orders/domain/OrderModels.kt`.
*Back-office*
- [ ] E5-T31 `features/orders/*`: type column, filter, history panel.
*Telemetry*
- [ ] E5-T32 PostHog: `checkout_delivery_type_shown {type}`, `checkout_window_selected` (no PII). Update the taxonomy package.
- [ ] E5-T33 CloudWatch metrics: orders by type; `coverage_none_refusals`.
*Tests, docs*
- [ ] E5-T34 Container tests across commerce/orders/shop; port tests referencing `same_day`.
- [ ] E5-T35 `docs/order-console-guide.md`, glossary from E0-T09.
- [ ] E5-T36 FEATURE-HISTORY entry + operator steps (deploy order: shared → commerce/orders/shop/admin → web → mobile).

---

## E6 — Courier Fulfilment (hub handover or shop pickup) · spec 079

**Goal.** Courier orders physically reach the courier, either via Effy's hub (as today) or
picked up straight from the shop, chosen by a back-office setting.

**In scope:** collection mode setting (platform default + per-order override), courier
consignments per package, handover at hub (exists, 053 `carrier_handoff`), shop pickup flow
(shop hands parcel to courier), labels/references, tracking capture, courier status into
"With carrier" / "Delivered", exceptions. Manual first (staff record bookings); API booking is E10.
**Out of scope:** automatic booking through a courier API (E10), live courier quotes (E10).

**Acceptance (headline)**
- With mode "hub", a courier package is collected by an Effy driver, checked in at the hub, and
  handed to the courier; status goes At hub → With carrier.
- With mode "shop pickup", the shop sees "Courier pickup" with the reference, marks it handed over;
  status goes Ready → With carrier, never "At hub".
- A two-shop order with shop pickup has two consignments; the customer still sees one order.
- Staff can override the mode per order until the first parcel has been handed over.

**`/speckit-specify` prompt**

```
/speckit-specify Courier Fulfilment. Orders delivered by courier reach the courier in one of two ways,
chosen by the business: "via the hub" — Effy's drivers collect the parcels from Effy's suppliers,
bring them to Effy's hub, and hub staff hand them to the courier (how it works today); or "pickup from
supplier" — the courier collects each parcel straight from the supplier that packed it. The business
sets a default for the whole platform and staff can change it for a single order until the first
parcel of that order has left Effy's or the supplier's hands. Each parcel handed to a courier gets its
own consignment (courier name, service and reference, when known), so an order filled by two suppliers
with pickup from supplier has two consignments; the customer still sees one order and never learns how
many suppliers were involved. For "pickup from supplier", supplier staff see which parcels a courier
will collect and when, the label or reference to attach, and mark each parcel handed over; they never
see the customer's fee. For "via the hub", hub staff see which parcels are due to go to which courier
and record the handover. Staff can record courier progress (in transit, delivered, failed) by hand,
and a delivered courier parcel completes like any other. When a courier cannot pick up from a supplier,
staff can switch that order to "via the hub". Problems (lost, damaged, returned to sender) are raised
to back-office with the order. In this feature bookings are made and recorded by staff; automatic
booking with a courier company comes later.
```

**Tasks**

*Research (plan phase)*
- [ ] E6-T01 Research couriers in Melbourne/Sydney with business-address pickup and an API: Sendle, CouriersPlease, Australia Post / StarTrack (MyPost Business / AP Shipping API), Aramex, Uber Direct, Zoom2u, DoorDash Drive. Compare: pickup from many addresses, same-day vs next-day, label API, tracking webhooks, pricing model, contract need. Write `specs/079-*/research.md`.
- [ ] E6-T02 Decide what 053's "no carrier table because no contract" rule becomes once a courier is chosen (constitution: identifiers are asked for, never inferred — courier account details come from the operator).
*Data*
- [ ] E6-T03 Migration: `courier_service` (name, service code, estimate text, status) — operator-entered.
- [ ] E6-T04 Migration: `courier_consignment` (shop_fulfillment id, courier_service id, collection mode `hub|shop_pickup`, reference nullable, label URL nullable, booked_at, handed_over_at, state `booked|handed_over|in_transit|delivered|failed|returned`, actor). Relationship with `carrier_handoff` (053): migrate it into consignment or keep both — decide in plan; one source of truth.
- [ ] E6-T05 Settings: `courier_collection_mode_default` (`hub`); order column `courier_collection_mode` (nullable override).
- [ ] E6-T06 `public.package_status` derivation (`shared/src/status/sql.ts`) reads consignments.
*Orders service* (`apis/edge-api/orders/src/handoff`, `arrival`)
- [ ] E6-T07 Extend `handovers-v1-get.ts` / `fulfillment-handoff-v1-post.ts` for consignment create/handover at hub.
- [ ] E6-T08 Routes: record courier progress (in transit/delivered/failed/returned) — staff-entered.
- [ ] E6-T09 Route: change collection mode per order (guarded: before first handover).
- [ ] E6-T10 Remove `carrier_lead_days` day−lead handover scheduling for Effy (069) — courier hub handover becomes "next courier pickup", not "chosen day minus lead".
*Shop service*
- [ ] E6-T11 Shop view: "Courier pickup" parcels for today (reference, courier, pickup time), mark handed over.
- [ ] E6-T12 Delivery-isolation contract (`shop/src/delivery-isolation.contract.test.ts`): shop never sees fee/window/customer address beyond what a label requires — decide label content with D13.
*Fleet / planner*
- [ ] E6-T13 `fleet/src/planner/*`: courier packages in hub mode still go on collection runs; shop-pickup packages are **excluded** from collection runs.
- [ ] E6-T14 Driver app: hub check-in shows "Courier" (not "Standard") for parcels to hand over.
*Back-office*
- [ ] E6-T15 Courier services settings screen.
- [ ] E6-T16 Handover console (hub): due parcels by courier, record reference + handover.
- [ ] E6-T17 Order detail: consignments, mode, override control, progress entry.
- [ ] E6-T18 Problems queue for failed/returned consignments (reuse 073's exceptions area if possible).
*Shop web / shop mobile*
- [ ] E6-T19 shop-web: Courier pickup list + handed-over action + label print/reference.
- [ ] E6-T20 shop-mobile: same.
*Customer surfaces*
- [ ] E6-T21 Tracking display per Q8 (single-consignment link, or email per parcel).
- [ ] E6-T22 "With carrier" notification (email + push).
*Live updates, telemetry*
- [ ] E6-T23 Announce on consignment changes (`orders`, `rounds` kinds) — `change-map.guard.test.ts`.
- [ ] E6-T24 Metrics: consignments by state; alarm on parcels booked but not handed over after N hours.
*Tests, docs*
- [ ] E6-T25 Container tests: hub path, shop-pickup path, two-shop order, mode switch, status derivation.
- [ ] E6-T26 Runbook `docs/runbooks/courier-handover.md`.
- [ ] E6-T27 FEATURE-HISTORY entry + operator steps.

---

## E7 — Back-Office Courier Override & Compensation · spec 080

**Goal.** In an emergency, back-office moves an Effy order to courier, the customer is told, and
the admin picks compensation per order: points (default), free delivery, or refund (last resort).
Effy absorbs any extra courier cost.

**In scope:** override action and its guards, compensation choices and their money effects,
customer notification, audit, reverse override (Q6), releasing the window booking, driver work
cleanup.
**Out of scope:** customer-initiated courier (E10).

**Acceptance (headline)**
- Overriding a paid Effy order releases its window, removes it from driver work, and notifies the
  customer in the same minute.
- Default compensation = points worth `max(0, effyFee − courierFee)`; "free delivery" = the whole
  Effy fee back (as points or refund, admin's pick); "refund" = the difference to the card.
- If the courier fee is higher, the customer is charged nothing more.
- Every override and compensation is audited with the reason.

**`/speckit-specify` prompt**

```
/speckit-specify Back-Office Courier Override and Compensation. Rarely, and only in an emergency,
back-office staff need an order that was sold as "Delivered by Effy" to go by courier instead. Staff
can move any such order to courier delivery, giving a reason, as long as it has not already been
handed to a customer or a courier. The customer's delivery window is given up, the order leaves any
Effy driver's work, and the customer is told straight away — by email and notification — that their
order will now arrive by courier, with the new estimate. Staff then choose, for that order, how to make
it right; nothing is decided automatically. The default is to credit the customer points worth the
difference between what they paid for Effy delivery and the courier fee. Staff may instead make the
delivery free (giving back the whole delivery fee, as points or to the card), or, as a last resort,
refund the difference to the customer's card. If courier delivery costs more than what the customer
paid, the customer is never asked to pay more; Effy bears the difference. The customer's message says
what they received. Staff can move a courier order back to Effy delivery only before it has been handed
to a courier, choosing a new window; the customer is never charged more for that either. Every move
and every compensation is recorded with who, when, why and how much, and is visible on the order.
Only admins and managers can move orders; customer-service agents can view.
```

**Tasks**

*Data*
- [ ] E7-T01 Migration: `delivery_override` (order id, from, to, reason, actor, compensation kind `points|free_delivery_points|free_delivery_refund|refund_difference|none`, amount, created_at). Links to `order_delivery_type_change` (E5) and `points_ledger` (E1) / refund (055).
*Shared library*
- [ ] E7-T02 `@effy/edge-shared/delivery/override`: one function that, in one transaction, changes type, releases the `delivery_slot_booking`, removes the package from rounds (`round_package`), creates consignments per collection mode (E6), and records the change. Announce after commit.
- [ ] E7-T03 Compensation via `@effy/edge-shared/points` (E1) or `@effy/edge-shared/payments` refunds (055) — never re-implemented.
- [ ] E7-T04 Compute `effyFeePaid` from the snapshotted breakdown (E3-T08) and `courierFee` from the active courier plan at override time; clamp difference at ≥ 0.
*Admin / orders service*
- [ ] E7-T05 Route `POST /admin/v1/orders/{id}/delivery-type` (to courier / back to Effy) with role guard and state guards.
- [ ] E7-T06 Route `POST /admin/v1/orders/{id}/delivery-compensation` (or same call) with choice + amount preview.
- [ ] E7-T07 Preview route: shows courier fee, difference, each option's effect.
*Fleet / driver*
- [ ] E7-T08 Removing a package from an open round — reuse 073's Unassign; driver app reflects via live update.
*Notifications*
- [ ] E7-T09 Email + push "Your order will now arrive by courier" with compensation sentence (email-kit template).
*Back-office*
- [ ] E7-T10 Order detail action "Send by courier…" → dialog: reason, compensation choice (points preselected), preview, confirm.
- [ ] E7-T11 Reverse action "Deliver by Effy…" with window picker.
- [ ] E7-T12 Override history panel on the order.
*Customer surfaces*
- [ ] E7-T13 Order detail shows type change and compensation line; receipt updated (web, mobile).
*Tests, docs*
- [ ] E7-T14 Container tests: each compensation kind; courier dearer → no charge; override after handover refused; window released frees capacity; driver round updated.
- [ ] E7-T15 Metrics: overrides per day (alarm if above threshold — emergencies should be rare).
- [ ] E7-T16 FEATURE-HISTORY entry + operator steps.

---

## E8 — Driver Operations Realignment · spec 081

**Goal.** Driver work follows the new model: collection runs take Effy packages and hub-mode
courier packages; delivery rounds are Effy windows, now on any of 4 days; "standard" disappears
from driver language and capabilities.

**In scope:** planner/wave planning across days, collection runs feeding future-day windows,
driver capabilities without the method dimension, driver app wording, hub check-in split (Effy
delivery vs courier), back-office dispatch wording.
**Out of scope:** routing/ETA (still schematic).

**Acceptance (headline)**
- A package for Thursday's 4–6 pm window is collected on an appropriate run and held at the hub
  until Thursday's round; it never appears in Tuesday's round.
- Hub check-in shows two piles: "Effy delivery (by day/window)" and "Courier".
- No driver screen says "standard" or "same-day".

**`/speckit-specify` prompt**

```
/speckit-specify Driver Operations Realignment. Effy drivers' work changes to match the new delivery
model. Collection runs still visit Effy's suppliers and bring parcels to the hub; they carry every
"Delivered by Effy" parcel and every courier parcel that goes via the hub, but never parcels a courier
collects directly from a supplier. Because customers can now choose a window up to three days ahead,
a parcel may wait at the hub: it is collected in time for its window and delivered only on the round
for its own day and window, never earlier. At hub check-in the driver sees two groups — parcels for
Effy delivery (by day and window) and parcels for the courier — without classifying anything. Delivery
rounds are planned per window on the window's day, as today. Driver permissions say whether a driver
collects, delivers, or both, and where; the old split by "same-day" or "standard" goes away. Drivers
and dispatch staff never see the words "same-day" or "standard". Work still opens at its planned time
and is assigned as soon as a qualifying driver can take it.
```

**Tasks**

- [ ] E8-T01 `fleet/src/planner/windows.ts` / `service.ts` / `sql.ts`: plan delivery waves for windows on future dates; only release a round on its date (`round_opens_at` unchanged, single source).
- [ ] E8-T02 Collection eligibility: package due for collection by `window_start − hub_turnaround`; future-day packages collected on the latest run that makes it (or earliest — decide; earliest frees shop space, latest keeps chilled goods in shops).
- [ ] E8-T03 Hub storage: package "At hub" across days; status derivation already handles it — test multi-day dwell.
- [ ] E8-T04 Temperature classes (065): chilled/frozen dwell at hub overnight — product call; add an exception if storage is not allowed.
- [ ] E8-T05 Migration: `driver_zone_capability.method` dropped; `zone_id` → coverage group id (or NULL = everywhere). Data migration from current grants.
- [ ] E8-T06 `fleet/src/capabilities`, `fleet/src/drivers`: routes and validation without method.
- [ ] E8-T07 `driver/src/work/*` (`repository.ts`, `sql.ts`, `service.ts`, `complete.ts`, `delivery.ts`): task type `same_day_delivery` → `effy_delivery` (enum change with legacy alias); hub check-in split Effy/courier.
- [ ] E8-T08 `driver/src/proof/*`: completion rules unchanged; courier handover proof via hub staff (E6).
- [ ] E8-T09 `fleet/src/dispatch/*`: day selector across 4 days.
- [ ] E8-T10 Shared types `dispatch.ts`, `driver.ts`: rename types; Kotlin `contract-driver`.
- [ ] E8-T11 driver-mobile: `features/collection/*`, `features/today/*` (`UpcomingRounds.kt`, `UpNextList.kt`, `TodayScreen.kt`), `features/delivery/*`, `features/map/*`, `features/history/*`, `core/nav/DriverRoutes.kt`: wording + hub check-in two groups.
- [ ] E8-T12 back-office `features/dispatch/*`, `features/drivers/*` (capability editor without method).
- [ ] E8-T13 Port driver container tests (`hub-stop`, `checkin`, `drop-window`, `manifest`, `open`, `drop-progress`).
- [ ] E8-T14 Port `CollectionViewModelTest.kt` and add Today tests for future-day rounds.
- [ ] E8-T15 Update `docs/logistics-engine-architecture.md`, `docs/driver-app-design-brief.md`.
- [ ] E8-T16 FEATURE-HISTORY entry + operator steps (driver app release needed).

---

## E9 — Cutover & Retirement of Same-Day/Standard · spec 082

**Goal.** Switch new orders to the new model on a chosen date, keep old orders readable, then
delete the old model's code, columns and docs.

**`/speckit-specify` prompt**

```
/speckit-specify Cutover to the new delivery model. From a moment the business chooses, every new
order uses "Delivered by Effy" or "Courier delivery"; orders placed before that moment keep exactly
what they were sold ("same-day" with its window, or "standard" with its day) and finish their journey
unchanged — customers, suppliers, drivers and staff can still see and complete them. Once no order of
the old kind remains open, the old arrangement is removed entirely: nothing anyone sees mentions
"same-day" or "standard" except the history of old orders, which still reads correctly. Before the
switch, staff can check that the new setup is complete — delivery area listed, fee plans active,
windows defined, courier services and settings in place — and the switch refuses to happen if
anything is missing.
```

**Tasks**

*Cutover*
- [ ] E9-T01 Setting `delivery_model_v2_from` (timestamptz, NULL = off). Checkout reads it; one place decides (SQL function `delivery_model_for(now)`).
- [ ] E9-T02 Readiness check route + back-office "Go-live checklist" panel (coverage non-empty, Effy plan active and complete, courier plan active, ≥1 active slot, courier service defined, collection mode set).
- [ ] E9-T03 Legacy rendering: `delivery_type IS NULL` orders render from `delivery_method` everywhere (status, receipts, apps) until closed.
- [ ] E9-T04 Report: open legacy orders count (back-office + metric) — the trigger for the retirement step.
- [ ] E9-T05 Runbook `docs/runbooks/delivery-model-v2-cutover.md` (order: migrations → deploy shared → services → web → mobile releases → set the date).
*Retirement (after legacy count = 0)*
- [ ] E9-T06 Migration: drop `delivery_ring`, `delivery_zone.ring_id`, `ring_is_overridden`, `hub_distance_km`, `sameday_eligible`; drop `delivery_zone` + `delivery_zone_postcode` if E2 replaced them.
- [ ] E9-T07 Migration: drop `shop_sameday_declaration`, `shop_sameday_area`, `shop_sameday_exception` (if still present in the live schema — verify).
- [ ] E9-T08 Migration: drop method factor columns from fee plans; drop `carrier_lead_days`, `standard_lookahead_days` (renamed ones stay).
- [ ] E9-T09 Migration: `shop_fulfillment.delivery_method`, `order_package_delivery.method` → constrain to legacy-only or drop after archival (keep history readable: decide archive view).
- [ ] E9-T10 Delete `shared/src/delivery/sameday.ts`, `standard-days.ts`, ring code in `plan.ts`/`zone.ts`, `METHOD_SAME_DAY`/`METHOD_STANDARD` exports.
- [ ] E9-T11 Delete admin routes `delivery-rings-*`, `delivery-zone-suggest-ring-*`, `delivery-exception*`, `admin/src/delivery/suggest.ts` (+ tests) and `serverless.yml` entries.
- [ ] E9-T12 Delete back-office `NewRingDialog.tsx`, `SameDayExceptionsDialog.tsx`, old `NewZoneDialog.tsx`, `NewPlanDialog.tsx`.
- [ ] E9-T13 Remove same-day/standard from `packages/shared-types/src/*` and Kotlin contracts.
- [ ] E9-T14 Remove same-day/standard from all three mobile apps and three web apps (sweep from E0-T03).
- [ ] E9-T15 Add a guard script `scripts/check-no-same-day.sh` (pattern of `check-no-emerald.sh`) that fails the build on `same_day|sameday|standard_date` outside migrations and archived docs.
- [ ] E9-T16 Dev seeds (`db/seeds/047_delivery_dev.sql`) rewritten for the new model.
*Docs*
- [ ] E9-T17 Rewrite `CLAUDE.md` → "Driver logistics model" for the new model (remove the 047/069 same-day/standard bullets; keep 072/073 bullets that still hold).
- [ ] E9-T18 Constitution amendment if any principle names same-day/standard (check `.specify/memory/constitution.md`).
- [ ] E9-T19 Mark 047/069 specs as superseded in their headers; FEATURE-HISTORY entry.
- [ ] E9-T20 `docs/archive/delivery-model-v1.md`: what the old model was and how to read legacy orders.

---

## E10 — Deferred (not now)

Each becomes its own spec when the operator asks.

- **E10-a Customer chooses courier** (D10) — hidden checkout option for in-area customers.
  ```
  /speckit-specify Customer-chosen courier delivery. A customer whose address Effy delivers to may,
  only at checkout and only when the business turns this option on, choose courier delivery instead of
  an Effy delivery window, and pays the courier fee. The option is discreet, never the default, and
  never offered after the order is placed.
  ```
- **E10-b Live courier quotes** — courier fee from the courier's own quote instead of the table.
  ```
  /speckit-specify Live courier quotes. For courier delivery, the fee the customer pays comes from the
  courier company's own price for that parcel at that moment, plus a margin the business sets, instead
  of the business's fixed courier table. If the courier cannot give a price, the fixed table is used.
  The customer always sees the final fee before paying and is charged exactly that.
  ```
- **E10-c Courier booking through an API** — book, print labels and receive tracking events
  automatically (follows E6's research).
  ```
  /speckit-specify Automatic courier booking. When a parcel is going by courier, Effy books it with the
  courier company automatically, gets the label and tracking reference without staff typing them, and
  receives the courier's progress updates (picked up, in transit, delivered, failed) so the order moves
  on its own. Staff can still book and record by hand when the automatic booking fails.
  ```
- **E10-d Earning points on purchases** (loyalty) — builds on E1.
  ```
  /speckit-specify Earning points. Customers earn Effy points when they buy, at a rate the business
  sets, credited once the order is delivered and taken back if the order is refunded. Customers see
  how many points an order will earn before paying.
  ```
- **E10-e Multi-hub** — still deferred from 049.
  ```
  /speckit-specify Multiple hubs. Effy can run more than one hub. Each postcode Effy delivers to is
  served from one hub, its distance and fee are measured from that hub, and collection runs and
  delivery rounds belong to a hub.
  ```

---

## 3. Cross-cutting checklist (every epic)

- [ ] Every new route lives in an existing `apis/edge-api/<service>` that owns its audience (see `docs/api/path-assignment.md`); no new backend, no always-on compute.
- [ ] Every route that changes an order, round, slot, stock, points or coverage **announces** after commit (`@effy/edge-shared/live`) — `change-map.guard.test.ts` passes.
- [ ] Money moves only through `@effy/edge-shared/payments`; points only through `@effy/edge-shared/points`.
- [ ] Shopper-facing reads use the `effy_shopper` role; check connection-limit implications.
- [ ] Customers never learn the number of suppliers or their identities from any delivery screen, email or tracking link (except D13's accepted label sender).
- [ ] Status shown only via `packageStatus` / `STATUS_WORD` / `PackageStatusPill` (073).
- [ ] No `refetchInterval` / polling (`scripts/check-no-refresh-timers.sh`).
- [ ] Design tokens only (`check-token-usage.mjs`); no card layouts unless justified in the plan.
- [ ] Mobile and web customer surfaces at parity (web + mobile in the same epic).
- [ ] PostHog events added to the shared taxonomy; no PII.
- [ ] CloudWatch metrics + Terraform alarms for every new invariant.
- [ ] No real-world identifier (courier account, email, phone) inferred — always asked of the operator; fail loudly when missing.
- [ ] FEATURE-HISTORY entry with operator steps; migrations and deploys handed to the operator.
