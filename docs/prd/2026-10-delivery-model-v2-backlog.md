# Delivery Model v2 — Epic & Requirements Backlog

> ## ✅ PROGRAMME COMPLETE IN DEV — 2026-10-10
> **E1–E9 (specs 074–083) are built, migrated and deployed to dev** (operator-reported), including 083 stage 2:
> the old same-day/standard arrangement is removed and there is ONE delivery model — Delivered by Effy in a
> window, or Courier delivery — priced by the one fee engine. **E10 is deferred.**
>
> **Not done, and still open:**
> - On-screen walks were not recorded for any of 076–083.
> - E0-T06 (annotate `ORDER-FLOW-GAPS.md`), E0-T08 (legal pre-check: store-credit terms, fee display),
>   E0-T09 (product copy glossary).
> - E5-T25 — no end-to-end browser test of the Effy and courier checkouts.
> - Four operator guides carry an "out of date" notice instead of a rewrite (083 SIGNOFF).
> - Known gaps recorded in their specs: 082 "needs a driver" lists a supplier-ready parcel early; the shop
>   service's `recipientsForShop` test failure (outside this programme).
> - Nothing here has been released to a production environment — there is none yet.

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
| E0 | — | Cleanup & decision record — decision recorded; T06/T08/T09 still open | — |
| E1 | 074 | Customer Points (store credit) — ✅ deployed to dev | — |
| E2 | 076 | Effy Delivery Coverage (postcode list) — ✅ deployed to dev | — |
| E3 | 077 | Delivery Fee Engine v2 — ✅ deployed to dev | E2 |
| E4 | 078 | Effy Delivery Windows: today + 3 days — ✅ signed off 2026-10-09; live since the 083 removal | E2 |
| E5 | 079 | Checkout & Orders: Delivered by Effy vs Courier — ✅ deployed to dev (not walked) | E2, E3, E4 |
| E6 | 080 | Courier Fulfilment (hub handover or shop pickup) — ✅ signed off 2026-10-09 | E5 |
| E7 | 081 | Back-Office Courier Override & Compensation — ✅ signed off 2026-10-09 (deployed to dev) | E1, E5, E6 |
| E8 | 082 | Driver Operations Realignment — ✅ signed off 2026-10-09 (deployed to dev) | E4, E5 |
| E9 | 083 | Cutover & Retirement of Same-Day/Standard — ✅ both stages migrated and deployed to dev 2026-10-10 (operator-reported; not walked) | E5–E8 |
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

> **2026-10-08 — E2 (spec 076, Effy Delivery Coverage) is built and live in dev** (walks V1–V12 open)
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

> **2026-10-08 — E3 (spec 077, Delivery Fee Engine v2) is built and deployed to dev** (walks V1–V17 open)
> (`specs/077-delivery-fee-engine-v2/SIGNOFF.md`). One fee per ORDER from the postcode's own distance,
> the basket's weight and value, and the window; the fee-tier bridge and the tier tables are gone; a
> courier fee table exists and is charged to nobody yet.

> **2026-10-09 — E4 (spec 078, Effy Delivery Windows) is signed off: built and deployed to dev, switched off**
> (`specs/078-effy-delivery-windows/SIGNOFF.md`) — details under E4. **Next: E5 (spec 079).**

> **2026-10-09 — E6 (spec 080, Courier Fulfilment) is signed off: built, migrated and deployed to dev**
> (`specs/080-courier-fulfilment/SIGNOFF.md`) — details under E6. Rides 078's switch. **Next: E7 (spec 081).**

> **2026-10-09 — E7 (spec 081, Courier Override & Compensation) is signed off: built, migrated and deployed to dev**
> (`specs/081-courier-override-compensation/SIGNOFF.md`) — details under E7. Rides 078's switch. **Next: E8 (spec 082).**

> **2026-10-09 — E8 (spec 082, Driver Operations Realignment) is signed off: built and deployed to dev, no migration**
> (`specs/082-driver-operations-realignment/SIGNOFF.md`) — details under E8. The driver side no longer blocks 078's switch.
> **Next: E9 (spec 083, cutover).**

> **2026-10-09 — E9 (spec 083) STAGE 1 is built and checked by machine: not yet migrated, deployed or walked**
> (`specs/083-delivery-model-cutover/SIGNOFF.md`). The switch has its one writer (back-office → Delivery →
> Go-live, admins only, refused while not ready), a 5-minute sweep that stops a scheduled switch the platform
> is no longer ready for, the old-order count and its list. **Nothing was switched on.** Stage 2 (the removal,
> 083 T022–T038) does not start until the operator confirms stage 1 is live and no old order is open.

## E0 — Cleanup & decision record (no spec)

Housekeeping that makes the later specs honest. Nothing here changes behaviour.

**Tasks**

- [x] E0-T01 Record this decision in `CLAUDE.md` → "Driver logistics model": a short ⚠ note that the same-day/standard split is **being replaced** by Effy-vs-courier (link this file). Do not rewrite the section until E9 lands.
- [x] E0-T02 Add an entry to `docs/next-implementation-candidates.md` pointing here, and mark which existing candidates this backlog absorbs or blocks.
- [x] E0-T03 Inventory every reader of `METHOD_SAME_DAY` / `METHOD_STANDARD` (`apis/edge-api/shared/src/delivery/plan.ts`) and write the list into E9's task list. Current footprint: ~150 files across `apis/edge-api/{shared,commerce,orders,fleet,driver,shop,admin,notifications}`, `packages/shared-types/src`, `apps/{customer-web,customer-mobile,driver-mobile,back-office,shop-web}`. — *Overtaken (083): the old arrangement was removed outright; `scripts/check-no-legacy-delivery.sh` and the schema-drift guard hold what an inventory would have listed.*
- [x] E0-T04 Inventory every reader of `delivery_ring`, `delivery_zone.ring_id`, `delivery_zone.sameday_eligible`, `shop_sameday_*` and `driver_zone_capability.method`; attach to E2 / E8 / E9. — *Overtaken (083): the old arrangement was removed outright; `scripts/check-no-legacy-delivery.sh` and the schema-drift guard hold what an inventory would have listed.*
- [x] E0-T05 Inventory every place the customer sees the words "same-day" or "standard" (web, mobile, email templates in `packages/email-kit`, receipts in `apis/edge-api/notifications/src/receipts`). Attach to E5. — *Overtaken (083): the old arrangement was removed outright; `scripts/check-no-legacy-delivery.sh` and the schema-drift guard hold what an inventory would have listed.*
- [ ] E0-T06 Check `ORDER-FLOW-GAPS.md` for items that this model changes (carrier handoff, delivery promise) and annotate them.
- [x] E0-T07 Confirm with the operator the open questions Q1–Q8 above; write answers into §1. (2026-10-08: all recommendations accepted.)
- [ ] E0-T08 Legal pre-check list for the specs: store-credit terms and expiry (ACL / state fair-trading), displaying delivery fees and surcharges up front (ACL component pricing), terms-of-service text for courier delivery. Hand to 045's legal system owner.
- [ ] E0-T09 Product copy glossary: "Delivered by Effy", "Courier delivery", "Delivery window", "Effy points", "Free delivery over $X", "Small order fee". Store it in `docs/conventions/` so all six apps use the same words.

---

## E1 — Customer Points (store credit) · spec 074 — ✅ built 2026-10-08

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
- [x] E2-T01 Migration: `public.effy_coverage_postcode` (postcode PK, group id nullable, distance_km NOT NULL, distance_source `computed|manual`, added_by, timestamps) — UNIQUE(postcode) is the guarantee. — **Done differently:** no new table. `delivery_zone_postcode` was evolved in place and **is** the list (+ `distance_km`, `distance_source`, `distance_review`, `added_by`, `updated_at`); it keeps its name until E9.
- [x] E2-T02 Migration: `public.effy_coverage_group` (code, name, status). Display-only. — **Done differently:** `delivery_zone` **is** the group (`ring_id` nullable; `status='disabled'` = a removed group).
- [x] E2-T03 Migration: courier reach — `public.courier_excluded_postcode` (postcode, reason) + settings flag `courier_default_reach = 'national'`. — *The flag is `delivery_settings.courier_offered` (false, and locked off until E5) rather than `courier_default_reach`.*
- [x] E2-T04 Data migration: copy every postcode in `public.delivery_zone_postcode` into `effy_coverage_postcode` (group = old zone, distance = old `delivery_zone.hub_distance_km` or recomputed from `public.locality` lat/long), so dev keeps its coverage. — **Done differently:** nothing copied — backfilled in place (computed distance → the zone's `hub_distance_km` as manual + review → stop and name the postcodes). Disabled zones' postcodes were removed.
- [x] E2-T05 SQL function `public.coverage_for_postcode(text)` → `effy | courier | none` + reason. One place decides; mirrors `round_opens_at` discipline.
- [x] E2-T06 SQL/TS: straight-line (haversine) distance hub (`delivery_settings.hub_latitude/longitude`) → `locality` lat/long; pick the primary locality per postcode by `address_count`.
- [x] E2-T07 Recompute rule: when hub coordinates change, recompute every `computed` distance; never touch `manual` ones. Admin sees how many changed.
- [x] E2-T08 Mark old tables deprecated in comments (`delivery_ring`, `delivery_zone.ring_id`, `delivery_zone.sameday_eligible`, `shop_sameday_*`); actual drops in E9.
*Shared library*
- [x] E2-T09 Replace `shared/src/delivery/zone.ts` `zoneForPostcode` / `sameDayForShops` with `coverageForPostcode()` returning `{kind, distanceKm, groupId}`. Keep the old exports until E9. — *`coverageForPostcode()` added; `zoneForPostcode` rebuilt on top of it with the three frozen bridges. `sameDayForShops` still exists (E5 removes it).*
- [x] E2-T10 `shared/src/delivery/locality.ts`: expose place search for coverage (reuse 047's search).
- [x] E2-T11 Unit + container tests for coverage decisions, including PO-box postcodes with no locality.
*Admin service* (`apis/edge-api/admin/src/delivery/`)
- [x] E2-T12 Routes: list coverage (filter by group, search), add postcodes (by place search), remove postcode, set manual distance, create/rename/disable group, move postcode between groups. — *Twelve routes under `/admin/v1/delivery/coverage…` on the staff gateway.*
- [x] E2-T13 Routes: courier exclusions list/add/remove.
- [x] E2-T14 Route: coverage check for a postcode (replaces `delivery-postcode-check-v1-get.ts`) with the reason.
- [x] E2-T15 Retire routes (stop registering, keep code until E9): `delivery-rings-*`, `delivery-zone-suggest-ring-*`, `delivery-exception-*` (per-shop same-day), the ring parts of `delivery-zones-*`. — **Done differently:** the eleven routes and their handlers were **deleted**, not kept. `GET …/delivery/rings` stays read-only until E3.
- [x] E2-T16 Audit rows for every coverage change (admin schema).
- [x] E2-T17 Live announce `coverage` kind; update `change-map.guard.test.ts`.
*Storefront / customer services*
- [x] E2-T18 Address add/edit returns coverage (`effy | courier | none`) — same sentence source as checkout.
- [x] E2-T19 Public "Do we deliver to you?" check (storefront) if the home page uses one.
*Shared types*
- [x] E2-T20 `packages/shared-types/src/delivery-admin.ts`: coverage DTOs; remove ring DTOs from the console surface. Kotlin contract mirror if mobile uses it.
- [x] E2-T21 `packages/shared-types/src/delivery.ts`: `CoverageKind` and the refusal code + sentence.
*Back-office* (`apps/back-office/src/features/delivery/`)
- [x] E2-T22 New Coverage screen: postcode table (place, postcode, group, distance, source), place-search add dialog (replaces `AddPostcodeDialog.tsx`), manual-distance edit, bulk move to group.
- [x] E2-T23 Groups panel (replaces `NewZoneDialog.tsx`).
- [x] E2-T24 Courier exclusions panel.
- [x] E2-T25 Postcode checker widget (Effy / courier / none + why).
- [x] E2-T26 Remove `NewRingDialog.tsx`, `SameDayExceptionsDialog.tsx` from the screen (delete files in E9). — **Done differently:** the four old dialogs were deleted now, not in E9.
- [x] E2-T27 Access rules in `features/delivery/access.ts` (admin/manager edit, csa read). — *Existing `canManageDelivery` reused; no new rule needed.*
*Customer surfaces*
- [x] E2-T28 customer-web address picker (`app/checkout/AddressPicker.tsx`) shows Effy/courier/none.
- [x] E2-T29 customer-mobile address flow shows the same.
*Tests, docs*
- [x] E2-T30 Container tests: migration of old zones preserves coverage; distance recompute; refusal sentence identical across routes.
- [x] E2-T31 Update `docs/delivery-console-guide.md`.
- [x] E2-T32 FEATURE-HISTORY entry + operator steps.

---

## E3 — Delivery Fee Engine v2 · spec 077 — ✅ built and deployed to dev 2026-10-08

> **2026-10-08 — E3 DONE (spec 077): built, checked by machine, migrated and deployed to dev** (reported
> by the operator; walks V1–V17 not recorded)
> ([specs/077-delivery-fee-engine-v2/SIGNOFF.md](../../specs/077-delivery-fee-engine-v2/SIGNOFF.md)). 82/82
> tasks; every E3-T below is ticked with how it landed. Left for later epics:
> - **E5** — remove the compatibility per-package `feeAmount` on the quote; the same-day bridge; the "N
>   of your M deliveries" sentence; teach the quote to price `coverage: "courier"` with `courierFee`.
> - **E9** — drop `delivery_fee_plan.same_day_factor` / `standard_factor` and the two per-package
>   `delivery_fee_amount` columns (unwritten since 077).
> - **E4** — the windows now cost: a plan's **"Delivery today"** surcharge applies to any window today,
>   and a window may carry its own surcharge on any day. When E4 offers the same windows on the next
>   three days, the today surcharge keeps meaning exactly that — no data change.
> - Deviations: the immutability trigger was withdrawn (058's trigger guard) — the admin service holds
>   it; and the web cart has no postcode until checkout, so the free-delivery hint shows at checkout.
> - ⚠ Found while deploying: the back-office build failed because `coverage/` in two `.gitignore` files
>   (back-office, fleet) had hidden 076's source folders from git since 076. Anchored to `/coverage/`.

> **2026-10-08 — specified (`specs/077-delivery-fee-engine-v2/spec.md`); three rules confirmed by the
> operator while clarifying:**
> - **One fee per order, never more for more shops** (Q1 confirmed). Effy collects everything and
>   brings it to the hub, so for the customer the order comes from one place.
> - **Free delivery is free** — it waives the window premium too.
> - **Same-day stays a bit dearer**: the method factor becomes a fixed **premium on today's windows**
>   (amount asked of the operator before release). At release the carried-over plan includes it.
> - Introductory or targeted delivery discounts are **promotions — a later feature**, not part of E3.

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
- [x] E3-T01 Migration: `delivery_fee_plan` v2 columns — `base_cents`, distance bands table `delivery_fee_distance_band(plan_id, upper_km, add_cents)` with one open top band. — **Done** — `delivery_distance_band(plan_id, upper_km NULL = and beyond, add_amount)`; plan gained `base_amount`.
- [x] E3-T02 Keep weight bands table; confirm open-top rule. — **Done** — kept; the heaviest band prices everything above it.
- [x] E3-T03 Columns: `free_over_cents` (nullable), `small_order_under_cents` + `small_order_fee_cents`. — **Done** — `free_over_amount`, `small_order_under_amount` + `small_order_fee_amount` (both or neither; small < free).
- [x] E3-T04 Migration: `delivery_slot_premium(plan_id, slot_id, add_cents)` — premium belongs to the plan, not the slot, so a plan change never edits slots. — **Done** — `delivery_slot_premium`, plus a plan-wide `today_premium_amount`.
- [x] E3-T05 Migration: `courier_fee_plan` (or a `kind` on the same plan) — weight bands, flat per order, optional free threshold, step/floor/cap. — **Done** — a `kind` (`effy` | `courier`) on the same plan table; one active per kind.
- [x] E3-T06 Drop the method factor (`same_day_factor`, `factorMilli`) from the active-plan contract (column drop in E9). Replace it with a premium on today's windows in the carried-over plan — same-day stays dearer (confirmed 2026-10-08). — **Done** — factors unread; the carry-over set the today surcharge from `EFFY_TODAY_PREMIUM`.
- [x] E3-T07 Activation check as SQL function `delivery_plan_is_complete(plan_id)` — every listed postcode's distance falls in a band, weight bands cover 0..∞, premiums reference active slots. — **Done** — `delivery_plan_gaps` + `delivery_plan_is_complete` + `delivery_plan_activate`.
- [x] E3-T08 Snapshot fee breakdown onto the order (`order_delivery_fee` columns or JSON: base, distance add, weight add, premium, small-order, discount from threshold, rounding) so a receipt can always explain itself. — **Done** — `"order".delivery_fee_breakdown` jsonb (plan, inputs, parts, lines).
*Shared library* (`apis/edge-api/shared/src/delivery/`)
- [x] E3-T09 Rewrite `engine.ts` `fee()` → `effyFee({distanceKm, grams, basketCents, premiumCents, plan})` and `courierFee({grams, basketCents, plan})`; integer cents, round-up rule kept; returns the breakdown. — **Done** — plus `feeLines` and `basketValueCents`.
- [x] E3-T10 Table tests for every band edge, threshold edge, floor/cap, rounding (port `engine.test.ts`). — **Done** — `engine.test.ts`, P1–P6, P18.
- [x] E3-T11 `plan.ts`: load v2 plan; remove ring pricing. — **Done**.
- [x] E3-T12 `quote.ts`: price per **order** (if Q1 = per order) — replace `PackageQuote` per-shop options with one order-level quote; remove `ServedZoneUnpricedError` ring wording, keep the fail-loud invariant. — **Done** — one fee per order; `ListedPostcodeUnpricedError`; per-package `feeAmount` kept for old apps only.
- [x] E3-T13 Basket value definition: goods after promo discount, before delivery, GST-inclusive — write it once and test it. — **Done** — `basketValueCents`; points never reduce it.
- [x] E3-T14 Alarm metric when a listed postcode cannot be priced (port the existing invariant metric). — **Done** — the existing `DeliveryQuoteFailures` alarm, now on the new error.
*Admin service*
- [x] E3-T15 Routes: create plan (v2 shape), edit draft plan, activate (with completeness check), list plans, preview/simulate fee. — **Done** — list, create, `PUT` draft, activate, simulate.
- [x] E3-T16 Routes: courier fee plan create/activate/simulate. — **Done** — the same routes with `kind=courier`; simulate with `forceKind`.
- [x] E3-T17 Retire ring-priced plan creation in `delivery-plans-create-v1-post.ts`. — **Done** — and the rings route removed.
*Shared types*
- [x] E3-T18 `delivery-admin.ts`: plan v2 DTOs, simulator request/response with breakdown. — **Done**.
- [x] E3-T19 `checkout.ts`: fee breakdown lines for the customer (delivery, small-order fee, window surcharge, free-delivery saving). — **Done** — in `delivery-fee.ts` (shared by quote, intent and order).
*Back-office*
- [x] E3-T20 Fee plan editor v2 (replaces `NewPlanDialog.tsx`): base, distance bands table, weight bands table, thresholds, step/floor/cap, window premiums per slot. — **Done** — `pricing/PlanEditor.tsx`; `NewPlanDialog.tsx` deleted.
- [x] E3-T21 Fee simulator panel. — **Done** — `pricing/FeeSimulator.tsx`.
- [x] E3-T22 Courier fee plan editor + simulator. — **Done** — the same editor and simulator, kind = courier.
- [x] E3-T23 Activation error messages that name the exact gap (lesson from 047's "nobody could say which term refused"). — **Done** — `pricing/gapText.ts`, one sentence per gap code.
*Customer surfaces* (display only; the flow is E5)
- [x] E3-T24 customer-web: fee breakdown lines component (cart + checkout) and "Spend $N more for free delivery" hint. — **Done** — at checkout (the web cart has no postcode).
- [x] E3-T25 customer-mobile: same. — **Done** — checkout and receipt; words mirrored in `DeliveryFeeWords.kt`.
- [x] E3-T26 Receipt (web, mobile, email) shows breakdown lines (`apis/edge-api/notifications/src/receipts`, `packages/email-kit`). — **Done**.
*Tests, legal, docs*
- [x] E3-T27 Legal check: surcharge display rules (ACL), round-up already cleared by 047 — confirm still valid with new components. — **Done** — research R17; for the operator's adviser.
- [x] E3-T28 Container tests: activation refuses incomplete plans; placed orders keep their snapshotted fee after plan change. — **Done** — P7, P8, P14.
- [x] E3-T29 Update `docs/delivery-console-guide.md`. — **Done**.
- [x] E3-T30 FEATURE-HISTORY entry + operator steps. — **Done**.

---

## E4 — Effy Delivery Windows: today + 3 days · spec 078 — ✅ signed off 2026-10-09 (deployed to dev, switched off)

> **2026-10-08 — decided while specifying 078** (`specs/078-effy-delivery-windows/spec.md`):
> - **Customer words stay "Same-day delivery" and "Standard delivery".** Same-day = today's windows
>   (meaning unchanged). **Standard = Effy delivers on one of the next 3 delivery days, in a window**
>   — no longer "handed to a carrier". Out-of-area addresses show "delivered by a courier partner".
>   This **supersedes** E5's "the old names disappear from everything a customer sees" and E9's
>   customer-facing sweep; E9's guard script must allow these customer words.
> - **Built switched off; turned on at the cutover** (needs E8's hub dwell across days first).
> - A later day's window closes at **that day's own cutoff** (no "day before" rule).
>
> **2026-10-09 — E4 (spec 078) is SIGNED OFF by the operator: built, migrated and deployed to dev; the
> switch is off** (walks V1–V10 not recorded; the alarm apply, web builds and mobile build not confirmed)
> (`specs/078-effy-delivery-windows/SIGNOFF.md`). What it leaves for later epics:
> - **E5** — the per-shop same-day bridge is not consulted by the new path; delete it. Add
>   `order.delivery_type`: today "a `standard` package WITH a window is Effy's" is a convention held
>   by a CHECK and three readers. Offer courier when `effyWindows.unavailable` and the business allows it.
> - **E8** — the planner still gathers `same_day` only (`GATHER_DELIVERY`): a windowed `standard`
>   package gets no delivery round. This is THE reason the switch is off.
> - **E9** — the switch (`delivery_settings.delivery_model_v2_from`) and its one reader
>   (`public.delivery_model_v2_at`) ALREADY EXIST. Add only the setter and the readiness check; do not
>   create `delivery_model_for`. Rename "slot" to "window" on the back-office screen then.

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
- [x] E4-T01 `delivery_slot_booking` already has `delivery_date` — confirm capacity counting (`delivery_slot_load`) is per `(slot_id, delivery_date)`; fix if it counts today only.
- [x] E4-T02 Settings: `effy_lookahead_days` (default 3), reuse `standard_no_delivery_weekdays` and `delivery_non_delivery_date` renamed to Effy semantics (rename in E9; alias now).
- [x] E4-T03 ~~Retire `carrier_lead_days`~~ — **moved to E9-T08**: it still drives the live day picker until the cutover.
*Shared library*
- [x] E4-T04 `shared/src/delivery/slots.ts`: `openWindows(now, lookahead)` returns windows across today + N delivery days; today keeps the cutoff + collection-run reachability gate (`sameday.ts` logic moves here); future days gate on cutoff only (decide: cutoff the day before? — clarify).
- [x] E4-T05 ~~Delete `standard-days.ts`~~ — **moved to E9-T10**: kept for the live path; the window calendar is `windows.ts`.
- [x] E4-T06 Holds: unchanged moment (payment-intent), keyed by date; tests for cross-day holds.
- [x] E4-T07 Timezone tests (Melbourne) around midnight and DST change days.
*Fleet service* (`apis/edge-api/fleet/src/slots`, `deliverydays`)
- [x] E4-T08 Slot admin routes unchanged in shape; add per-day fullness read (`delivery-slots-v1-get.ts` gains a date range).
- [x] E4-T09 Delivery-days routes: `effyLookaheadDays` added; the non-delivery days apply to both (renames at E9).
*Commerce*
- [x] E4-T10 `commerce/src/checkout/delivery-choice.ts`: replace `preferredMethod` same_day/standard with "Effy window chosen (slot + date)"; remove `standardDate` path for Effy.
- [x] E4-T11 Refusal codes `slot_required`, `slot_unavailable` kept; add `no_windows_available`.
*Shared types*
- [x] E4-T12 `delivery-window.ts`: window = `{slotId, date, start, end, premiumCents, full}`; grouped by day.
*Back-office*
- [x] E4-T13 `SlotsPanel.tsx`: show fullness per day for the next 4 days.
- [x] E4-T14 `DeliveryDaysPanel.tsx`: wording → Effy delivery days; lookahead setting.
*Customer surfaces*
- [x] E4-T15 customer-web `DeliveryOptions.tsx`: day tabs (Today, Tue, Wed, Thu) + window list with surcharge; empty states.
- [x] E4-T16 customer-mobile checkout window picker (`CheckoutScreen.kt`, `DeliveryWindowText.kt`).
- [x] E4-T17 Order detail / receipt: "Thursday 9 Oct, 4–6 pm".
*Tests, docs*
- [x] E4-T18 Port `CheckoutFlow.slots.test.tsx`, `slots.test.ts`, `sameday.test.ts`, `standard-days.test.ts`.
- [x] E4-T19 FEATURE-HISTORY entry + operator steps.

---

## E5 — Checkout & Orders: Delivered by Effy vs Courier · spec 079 — ✅ built, migrated and deployed to dev 2026-10-09 (not walked, not signed off)

> **2026-10-09 — E5 (spec 079) is BUILT, MIGRATED AND DEPLOYED TO DEV (operator-reported); not walked or signed off**
> (`specs/079-effy-vs-courier-checkout/SIGNOFF.md`). It rides 078's switch. What it leaves:
> - **E6** — per-courier-service estimates (one platform text for now); courier timing proper (a courier
>   order is simply due at the carrier the day it is placed); the driver app still says "Standard" at
>   hub check-in; pickup from supplier.
> - **E7** — `recordDeliveryType(tx, {orderId, actor: {kind:"staff", sub}, change})` is the one writer;
>   reason `staff_change`; announce with `announceOrder` after commit. `package_delivered_by` already
>   lets the order's type win over a package's window.
> - **E8** — unchanged: the planner gathers `same_day` only, and "needs a driver" in the orders list
>   still means same-day at the hub.
> - **E9** — the three removals below; drop `deliveryMethod` / the `method` filter from the shop wire and
>   `serviceLevel` from the queue contract; the readiness check should require courier to be either off
>   or fully armed.
>
> **2026-10-09 — specified and planned (`specs/079-effy-vs-courier-checkout/plan.md`).** Settled by
> default, for the operator to confirm: one switch shared with 078; the no-window courier fallback
> (078 deferred it here) is in scope, off by default; one platform-wide estimate text until E6's
> courier services; courier parcels go via the hub as "standard" does today until E6; old orders are
> not relabelled for customers. Nothing in E5 changes a placed order's type — it builds the record E7
> writes to. **Corrections to the tasks below, from planning:**
> - **E5-T01** — no backfill: `order.delivery_type` NULL = placed before 079, read through
>   `public.package_delivered_by`. Reasons are `in_coverage | out_of_coverage | no_window |
>   staff_change` (`customer_choice` is E10's).
> - **E5-T03** — the window stays on the package rows; nothing moves to the order.
> - **E5-T04** — `delivery_method` is unchanged; a courier package is `standard` with no window.
>   Shops read `deliveredBy`.
> - **E5-T06** — the existing `serviced` / `coverage` discriminants are kept; a courier variant is added.
> - **E5-T07/T08** — no code change expected: `packageStatus` and completion already give the courier
>   path; tests added. **E5-T09** — nothing changes a placed order here; E7 announces.
> - **E5-T15** — not applicable: shop insights never read the method.
> - **"Flip `COURIER_ORDERING_AVAILABLE`"** became: delete it; `coverage_for_postcode` itself answers
>   courier only when a courier order can be placed (model on, courier on, fee table, estimate).
> - The same-day bridge, the compatibility `feeAmount` and the "N of your M" sentence → **E9**.

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

**`/speckit-specify` prompt** — *amended 2026-10-09 for 078's decisions: the customer words "Same-day
delivery" / "Standard delivery" stay (only shops lose them), out-of-area says "delivered by a courier
partner", and the feature is built switched off.*

```
/speckit-specify Checkout and Orders: Delivered by Effy vs Courier delivery. Every Effy order is
delivered one of two ways, decided at checkout from the delivery address: "Delivered by Effy" when the
address is in Effy's delivery area, and "Courier delivery" when it is not but a courier reaches it.
The customer does not choose between them in this feature. For "Delivered by Effy" the customer picks
a delivery window and pays Effy's delivery fee; the customer still reads the words they know —
"Same-day delivery" for a window today, "Standard delivery" for a window on a later day. For "Courier
delivery" there is no window and no date to pick; the customer is told the order is delivered by a
courier partner and arrives within the courier's usual timeframe (an estimate the business sets, never
a promise) and pays the courier fee. If neither Effy nor a courier reaches the address, checkout
refuses with the one plain sentence the platform already uses. If the customer changes the address
during checkout, the delivery type, fee and window choice update immediately and nothing chosen for
the old address is silently carried over. The order records its delivery type and every later change
to it, with who changed it, when and why. One order has one delivery type, whatever number of
suppliers fill it, and the customer never learns how many suppliers were involved. Every place the
customer sees the order — order list, order detail, tracking, receipt, confirmation email,
notifications — uses the same words and shows the window (Effy) or the courier estimate (courier).
Order status keeps the platform's single set of status words; courier orders use "With carrier" once
the courier has them. Shop staff see whether a package is going with an Effy driver or a courier —
never "same-day" or "standard", never the customer's window or fee. Back-office sees and can filter
orders by delivery type and sees the history of changes. Orders placed before this feature keep what
they were sold and still read correctly everywhere. Like the delivery windows it builds on, this is
built switched off and turned on by the business at the cutover; until then today's checkout is
unchanged.
```

**Tasks**

*Data*
- [x] E5-T01 (078 left a convention to replace: "a `standard` package with a window is Effy's" — backfill `effy` for those; then the readers 078 taught to look at the window can look at the type) Migration: `order.delivery_type` (`effy | courier`, NOT NULL for new orders; NULL = legacy), `order.delivery_type_reason` (`in_coverage | out_of_coverage | admin_override | customer_choice`). — *`order.delivery_type` / `delivery_type_reason` / `courier_estimate` added; **no backfill** — NULL = placed before 079, read through `public.package_delivered_by`. Reasons: `in_coverage | out_of_coverage | no_window | staff_change`.*
- [x] E5-T02 Migration: `order_delivery_type_change` history (order id, from, to, reason, actor, note, created_at). — *`order_delivery_type_change`, append-only; one writer (`recordDeliveryType`); first entry at payment.*
- [x] E5-T03 (078: every package of a new-model order already carries the SAME window, and customers see one arrival via `distinctArrivals`) Order-level window snapshot: today it is on `order_package_delivery` (`slot_id`, `window_start`, `window_end`) — decide (with Q1) whether it moves to the order; package rows keep a copy for dispatch. — *Decided: the window stays on the package rows; nothing moved to the order.*
- [x] E5-T04 `shop_fulfillment.delivery_method` → read-compatible `delivery_type`; legacy values preserved. — *`delivery_method` unchanged (a courier package is `standard`, no window). Shops are sent `deliveredBy`; `deliveryMethod` deprecated on the wire until E9.*
- [x] E5-T05 Courier estimate text setting (`delivery_settings.courier_estimate_text`). — *`delivery_settings.courier_estimate_text` + `courier_when_no_windows`; the order keeps the text it was sold.*
*Shared library*
- [x] E5-T06 `shared/src/delivery/quote.ts`: `QuoteResult` becomes `{kind:'effy', windows, fee} | {kind:'courier', fee, estimate} | {kind:'none'}`. — *Existing `serviced` / `coverage` discriminants kept; a `coverage: "courier"` variant added (fee, estimate, reason).*
- [x] E5-T07 `shared/src/status/status.ts` (`packageStatus`): courier path Preparing → Ready → (With driver → At hub, if hub collection) → With carrier → Delivered; Effy path unchanged. Keep the nine words (073). — *No code change needed — `packageStatus` already gives the courier path; rows added to `status.test.ts`.*
- [x] E5-T08 `shared/src/lib/order-completion.ts`: completion rules per delivery type. — *No change needed: completion is per package, whoever delivers.*
- [x] E5-T09 `shared/src/live/order-moves.ts`: announce on delivery-type change. — *Nothing changes a placed order in E5; E7 announces through `announceOrder` when it calls `recordDeliveryType`.*
*Commerce*
- [x] E5-T10 `commerce/src/checkout/service.ts` / `quote.ts`: compute type from coverage; courier path requires no slot; intent stores type + fee breakdown. — *Type from coverage; `resolveCourier` (no slot, no hold); the pending order carries type, reason, estimate and the courier fee breakdown. The client states `deliveryType`; mismatch → 409 `delivery_type_changed`.*
- [x] E5-T11 Refuse `kind:'none'` with the shared sentence. — *Unchanged path (`address_not_covered`), now also when courier is off / excluded / not ready / pending.*
- [x] E5-T12 Customer orders list/detail DTOs carry `deliveryType`, window or estimate. — *`delivery` on list and detail; `arrivalEstimates` empty for a courier order.*
*Orders / shop / admin services*
- [x] E5-T13 `orders/src/orders/service.ts` + `promise.ts`: delivery promise per type (window vs estimate). — *`package_delivered_by` in the orders readers; a courier order is due at the carrier the day it is placed (no promised day).*
- [x] E5-T14 `shop/src/fulfillments/promise.ts`, `shop/src/orders/*`, `shop/src/today/*`, `shop/src/pick-lists/*`: replace same-day/standard grouping with "Effy driver" vs "Courier"; keep `no-delivery-window.guard.test.ts` intent (shops never see the window). — *`deliveredBy` ("Effy driver" / "Courier") on list, detail, Today, pick lists and the app's queue; `no-delivery-window.guard` kept — the shop never names the window.*
- [x] E5-T15 `shop/src/insights/window.ts`: insights split by type. — *Not applicable — shop insights never read the method.*
- [x] E5-T16 Admin order list filter + detail (`packages/shared-types/src/order-admin.ts`). — *`deliveryType` filter (effy / courier / legacy), detail fields and history.*
*Shared types*
- [x] E5-T17 `order.ts`, `checkout.ts`, `shop-order-console.ts`, `order-admin.ts`, `delivery.ts`: `DeliveryType`; deprecate method fields. — *`delivery-type.ts` (types, words, `deliverySummary`); DTO fields across the five files.*
- [x] E5-T18 Kotlin contracts in `packages/shared-types/contract*/`. — *Regenerated (commerce + shop).*
*Notifications*
- [x] E5-T19 `notifications/src/receipts/sender.ts` + `repository.ts`: receipt shows type + window/estimate. — *The receipt says who delivers and the estimate as sold.*
- [x] E5-T20 Email templates in `packages/email-kit` (confirmation, delivered) — new wording; fixtures in `packages/email-kit/src/fixtures`. — *Confirmation template gained `deliveryLabel` / `deliveryPreheader`; Effy output unchanged. `order-delivered` needed no change.*
- [x] E5-T21 Push copy (`notifications/src/worker/copy.ts`) per type. — *No change needed: no customer push names a window or a driver, and nothing raises "Out for delivery" for a courier order.*
*Customer web*
- [x] E5-T22 `app/checkout/CheckoutFlow.tsx` + `DeliveryOptions.tsx`: Effy → window picker; courier → estimate block, no picker. — *`CourierDelivery.tsx`; heading "Delivered by Effy"; address / postcode change resets the choice.*
- [x] E5-T23 `components/receipt/*`, `StatusPill.tsx`, `_components/status-palette.ts`: wording. — *`ArrivalPanel` says who delivers; the pill keeps its short word.*
- [x] E5-T24 Order list/detail pages. — *Order list rows and detail.*
- [ ] E5-T25 e2e (`apps/customer-web/e2e`): Effy checkout, courier checkout, address switch Effy→courier. — ***Not done** — no e2e was added; the flows are covered by component tests (`CheckoutFlow.courier.test.tsx`).*
*Customer mobile*
- [x] E5-T26 `features/checkout/domain/Checkout.kt`, `data/CheckoutMappers.kt`, `presentation/*`: delivery type. — *Done, with a Kotlin twin of the words and `deliverySummary` on the shared fixture.*
- [x] E5-T27 Orders/Receipt screens; decide on `TrackOrderScreen.kt` (dead code per candidates register #7) — delete or wire with the new language. — *Receipt and orders screens done. `TrackOrderScreen.kt` left as is: it has a test and prints neither word.*
- [x] E5-T28 `core/error`, `core/observability` references to same-day. — *Nothing referenced same-day there; two analytics events declared.*
*Shop web / shop mobile*
- [x] E5-T29 shop-web `features/fulfillment/components/ItemsAndFulfilment.tsx`, `features/today/*`: "Effy driver" / "Courier" chips. — *Done ("Goes with" filter; labels; print).*
- [x] E5-T30 shop-mobile `features/orders/domain/OrderModels.kt`. — *The app never carried the method; it printed a constant `serviceLevel` ("standard") — now `deliveredBy`.*
*Back-office*
- [x] E5-T31 `features/orders/*`: type column, filter, history panel. — *Delivery column, filter, Delivery type section with history; courier settings on the Coverage tab.*
*Telemetry*
- [x] E5-T32 PostHog: `checkout_delivery_type_shown {type}`, `checkout_window_selected` (no PII). Update the taxonomy package. — *`checkout_delivery_type_shown {type, reason}`, `checkout_delivery_type_changed` (web emits; mobile declares). `checkout_window_selected` was 078's.*
- [x] E5-T33 CloudWatch metrics: orders by type; `coverage_none_refusals`. — *`OrdersPlaced {deliveryType}`, `DeliveryQuotes {outcome: courier | courier_fallback}`, `DeliveryTypeChanged`. Unreachable refusals are the existing `DeliveryQuotes {unserviced}`.*
*Tests, docs*
- [x] E5-T34 Container tests across commerce/orders/shop; port tests referencing `same_day`. — *Container tests in shared, commerce, orders, shop, admin.*
- [x] E5-T35 `docs/order-console-guide.md`, glossary from E0-T09. — *Both console guides updated. No glossary exists yet (E0-T09 is open).*
- [x] E5-T36 FEATURE-HISTORY entry + operator steps (deploy order: shared → commerce/orders/shop/admin → web → mobile). — *Entry written; operator steps in the quickstart and SIGNOFF.*

---

## E6 — Courier Fulfilment (hub handover or shop pickup) · spec 080 — ✅ signed off 2026-10-09 (deployed to dev)

> **2026-10-09 — specified and planned (`specs/080-courier-fulfilment/plan.md`).** Corrections to the tasks
> below: E6-T04 — the consignment sits BESIDE `carrier_handoff` (handed over) and `package_arrival`
> (delivered), which keep their one writer each; E6-T06 — status gains a courier problem, nothing else;
> E6-T10 — 079 already made a courier order due "the day placed"; E6 replaces that with the service's
> next pickup. Courier services also replace 079's single estimate text. The courier survey (E6-T01) is
> in research R12, from general knowledge and unverified — the operator chooses and enters services.
>
> **2026-10-09 — SIGNED OFF by the operator: built, migrated and deployed to dev** (walks V1–V6 not
> recorded; rides 078's switch, so no customer is offered courier delivery until the cutover). Record: `FEATURE-HISTORY.md` 080 and
> `specs/080-courier-fulfilment/SIGNOFF.md`. Deviations: E6-T09 — a switch to supplier pickup is
> **refused** while a driver is assigned to collect (unassign first, 073), not silently withdrawn;
> E6-T18 — "Courier problem" is an open failed/lost/damaged/returned only, a parcel merely overdue with
> the courier is at-risk on the Courier tab and alarmed, not a Problem; E6-T24 — the alarm is on parcels
> late at the hub or at a supplier (2 h), from a 30-minute sweep. E6-T10's 069 day−lead remains for
> pre-080 carrier packages until E9.

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

**`/speckit-specify` prompt** — *amended 2026-10-09 with what 079 left for E6: per-service estimates,
courier due times, the driver app's word at hub check-in, and tracking per Q8.*

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
booking with a courier company comes later. The business keeps a list of the courier services it uses,
each with its own usual timeframe; a courier order is told the timeframe of the service it will go
with, and keeps what it was told. A courier parcel waiting at the hub is due to go out by the next
pickup of its courier service, and staff see the ones that are late. Drivers checking parcels in at the
hub see "Courier" for parcels that go to a courier, never "Standard". A customer sees one tracking link
for their order only when it travels as a single consignment; otherwise they are told tracking is sent
by email for each parcel.
```

**Tasks**

*Research (plan phase)*
- [x] E6-T01 Research couriers in Melbourne/Sydney with business-address pickup and an API: Sendle, CouriersPlease, Australia Post / StarTrack (MyPost Business / AP Shipping API), Aramex, Uber Direct, Zoom2u, DoorDash Drive. Compare: pickup from many addresses, same-day vs next-day, label API, tracking webhooks, pricing model, contract need. Write `specs/079-*/research.md`.
- [x] E6-T02 Decide what 053's "no carrier table because no contract" rule becomes once a courier is chosen (constitution: identifiers are asked for, never inferred — courier account details come from the operator).
*Data*
- [x] E6-T03 Migration: `courier_service` (name, service code, estimate text, status) — operator-entered.
- [x] E6-T04 Migration: `courier_consignment` (shop_fulfillment id, courier_service id, collection mode `hub|shop_pickup`, reference nullable, label URL nullable, booked_at, handed_over_at, state `booked|handed_over|in_transit|delivered|failed|returned`, actor). Relationship with `carrier_handoff` (053): migrate it into consignment or keep both — decide in plan; one source of truth.
- [x] E6-T05 Settings: `courier_collection_mode_default` (`hub`); order column `courier_collection_mode` (nullable override).
- [x] E6-T06 `public.package_status` derivation (`shared/src/status/sql.ts`) reads consignments.
*Orders service* (`apis/edge-api/orders/src/handoff`, `arrival`)
- [x] E6-T07 Extend `handovers-v1-get.ts` / `fulfillment-handoff-v1-post.ts` for consignment create/handover at hub.
- [x] E6-T08 Routes: record courier progress (in transit/delivered/failed/returned) — staff-entered.
- [x] E6-T09 Route: change collection mode per order (guarded: before first handover).
- [x] E6-T10 Remove `carrier_lead_days` day−lead handover scheduling for Effy (069) — courier hub handover becomes "next courier pickup", not "chosen day minus lead".
*Shop service*
- [x] E6-T11 Shop view: "Courier pickup" parcels for today (reference, courier, pickup time), mark handed over.
- [x] E6-T12 Delivery-isolation contract (`shop/src/delivery-isolation.contract.test.ts`): shop never sees fee/window/customer address beyond what a label requires — decide label content with D13.
*Fleet / planner*
- [x] E6-T13 `fleet/src/planner/*`: courier packages in hub mode still go on collection runs; shop-pickup packages are **excluded** from collection runs.
- [x] E6-T14 Driver app: hub check-in shows "Courier" (not "Standard") for parcels to hand over.
*Back-office*
- [x] E6-T15 Courier services settings screen.
- [x] E6-T16 Handover console (hub): due parcels by courier, record reference + handover.
- [x] E6-T17 Order detail: consignments, mode, override control, progress entry.
- [x] E6-T18 Problems queue for failed/returned consignments (reuse 073's exceptions area if possible).
*Shop web / shop mobile*
- [x] E6-T19 shop-web: Courier pickup list + handed-over action + label print/reference.
- [x] E6-T20 shop-mobile: same.
*Customer surfaces*
- [x] E6-T21 Tracking display per Q8 (single-consignment link, or email per parcel).
- [x] E6-T22 "With carrier" notification (email + push).
*Live updates, telemetry*
- [x] E6-T23 Announce on consignment changes (`orders`, `rounds` kinds) — `change-map.guard.test.ts`.
- [x] E6-T24 Metrics: consignments by state; alarm on parcels booked but not handed over after N hours.
*Tests, docs*
- [x] E6-T25 Container tests: hub path, shop-pickup path, two-shop order, mode switch, status derivation.
- [x] E6-T26 Runbook `docs/runbooks/courier-handover.md`.
- [x] E6-T27 FEATURE-HISTORY entry + operator steps.

---

## E7 — Back-Office Courier Override & Compensation · spec 081 — ✅ signed off 2026-10-09 (deployed to dev)

> **2026-10-09 — SIGNED OFF by the operator: built, migrated and deployed to dev** (`specs/081-courier-override-compensation/SIGNOFF.md`);
> walks V1–V7 not recorded. Rides 078's switch. Deviations: only orders with a
> delivery type move; out for delivery blocks a move; consignments are made at booking, not at the move; one
> `POST …/delivery-move` (both directions, compensation in the call) + one `GET` preview; a quiet points credit (one
> message); "nothing" needs a note; `changeDeliveryType` returns the history row. **Next: E8 (spec 082).**

> **2026-10-09 — specified (`specs/081-courier-override-compensation/spec.md`).** The specify prompt below
> was amended with what 080 left: a moved order takes the default collection mode (via the hub if any
> parcel is already collected) and the default courier service's timeframe. Settled by default, for the
> operator to confirm: compensation is chosen once, with the move; "no compensation" needs a note;
> pre-model same-day orders count as Effy orders; moving back gives no compensation and only to an
> address on Effy's list; alert above 5 moves/day.
>
> **2026-10-09 — planned (`specs/081-courier-override-compensation/plan.md`).** Corrections from planning:
> only orders WITH a recorded delivery type can be moved (`recordDeliveryType` never invents history),
> so E7 is dormant until the cutover like 079/080; a parcel out for delivery on a round under way blocks
> the move; collection work stays when the order goes via the hub. Task corrections: E7-T01 — the table
> is `delivery_override`, 1:1 with the 079 history row, plus refund kind `delivery` / reason
> `courier_override`; E7-T02 — consignments are NOT created at the move (they are created at booking,
> 080); the mode is set through `consignment.ts`; E7-T05/T06/T07 — one `POST …/delivery-move` (both
> directions, compensation in the same call) and one `GET …/delivery-move` preview, on `orders` (staff);
> E7-T08 — fleet's `removeAssignment` moves into the shared library rather than being called over HTTP.

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
order will now arrive by courier, with the new estimate. Once moved, the order reaches the courier the
way any courier order does: by the business's default (via the hub or pickup from the supplier), which
staff can change for that order as for any other courier order, and with the business's default courier
service and its timeframe. Staff then choose, for that order, how to make
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
- [x] E7-T01 Migration: `delivery_override` (order id, from, to, reason, actor, compensation kind `points|free_delivery_points|free_delivery_refund|refund_difference|none`, amount, created_at). Links to `order_delivery_type_change` (E5) and `points_ledger` (E1) / refund (055).
*Shared library*
- [x] E7-T02 `@effy/edge-shared/delivery/override`: one function that, in one transaction, changes type, releases the `delivery_slot_booking`, removes the package from rounds (`round_package`), creates consignments per collection mode (E6), and records the change. Announce after commit. — *Built as `delivery/override.ts`; consignments are made at booking (080), not at the move; the mode is set through `consignment.ts`.*
- [x] E7-T03 Compensation via `@effy/edge-shared/points` (E1) or `@effy/edge-shared/payments` refunds (055) — never re-implemented.
- [x] E7-T04 Compute `effyFeePaid` from the snapshotted breakdown (E3-T08) and `courierFee` from the active courier plan at override time; clamp difference at ≥ 0.
*Admin / orders service*
- [x] E7-T05 Route `POST /admin/v1/orders/{id}/delivery-type` (to courier / back to Effy) with role guard and state guards. — *Built as one `POST /orders/v1/orders/{id}/delivery-move` on `orders` (staff gateway), both directions.*
- [x] E7-T06 Route `POST /admin/v1/orders/{id}/delivery-compensation` (or same call) with choice + amount preview. — *Same call as T05: the compensation is chosen with the move.*
- [x] E7-T07 Preview route: shows courier fee, difference, each option's effect. — *`GET /orders/v1/orders/{id}/delivery-move?to=`.*
*Fleet / driver*
- [x] E7-T08 Removing a package from an open round — reuse 073's Unassign; driver app reflects via live update. — *`removeAssignment` moved into the shared library; a delivery round under way blocks the move.*
*Notifications*
- [x] E7-T09 Email + push "Your order will now arrive by courier" with compensation sentence (email-kit template).
*Back-office*
- [x] E7-T10 Order detail action "Send by courier…" → dialog: reason, compensation choice (points preselected), preview, confirm.
- [x] E7-T11 Reverse action "Deliver by Effy…" with window picker.
- [x] E7-T12 Override history panel on the order.
*Customer surfaces*
- [x] E7-T13 Order detail shows type change and compensation line; receipt updated (web, mobile).
*Tests, docs*
- [x] E7-T14 Container tests: each compensation kind; courier dearer → no charge; override after handover refused; window released frees capacity; driver round updated. — *All but the refusal for an order with no delivery type were in the list; that is covered too.*
- [x] E7-T15 Metrics: overrides per day (alarm if above threshold — emergencies should be rare).
- [x] E7-T16 FEATURE-HISTORY entry + operator steps. — *Operator steps in `specs/081-courier-override-compensation/SIGNOFF.md`; migrated and deployed to dev 2026-10-09.*

---

## E8 — Driver Operations Realignment · spec 082 — ✅ signed off 2026-10-09 (deployed to dev)

> **2026-10-09 — SIGNED OFF by the operator: built and deployed to dev** (`specs/082-driver-operations-realignment/SIGNOFF.md`);
> walks V1–V7 not recorded. No migration. The driver side no longer blocks 078's switch. Deviations: no migration
> (the method column is unread until E9); `same_day_delivery` stays on the driver wire until E9; dispatch's
> unassigned list hides parcels not yet due on a run. Known gap: the orders list's "needs a driver" lists a
> supplier-ready parcel before its run is due. **Next: E9 (spec 083).**

> **2026-10-09 — specified (`specs/082-driver-operations-realignment/spec.md`).** The specify prompt below was
> amended with what 076, 079 and 081 left for E8: areas are postcode groups and an ungrouped postcode is
> deliverable by any driver who delivers; dispatch sees every day on sale; "needs a driver" covers any
> day's window; an order moved back to Effy for a later day gets a round. Settled by default, for the
> operator to confirm: **collect on the LATEST run that makes the window** (E8-T02); **chilled/frozen may
> wait at the hub overnight, marked for cold storage** (E8-T04); delivery rounds are created on their day.
>
> **2026-10-09 — planned (`specs/082-driver-operations-realignment/plan.md`).** Corrections to the tasks below:
> **E8-T05 — NO migration**: nothing reads `driver_zone_capability.method` any more and existing rows keep
> working as (function, area); the column is dropped at E9. **E8-T07** — the task kind stays
> `same_day_delivery` on the wire until E9 (the previous app's enum would not parse a new value); the
> check-in adds `effyGroups`. **E8-T09** — one new read, `GET /fleet/v1/dispatch/windows?date=`.
> **E8-T01** — "on its day" is one predicate in the gather; "Effy's" is `package_delivered_by`.

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
collects, delivers, or both, and where; the old split by "same-day" or "standard" goes away, and "where"
is the business's named groups of postcodes or everywhere — a postcode in no group can be delivered by
any driver cleared to deliver, not only by drivers cleared for everywhere. Drivers and dispatch staff
never see the words "same-day" or "standard" (customers keep them). Dispatch staff can look at any of
the days that have windows on sale, and "needs a driver" in the order list means any Effy parcel at the
hub whose window is coming up with no driver, whichever day it was sold for. An order moved back from
courier to Effy delivery for a later day gets a delivery round like any other. Work still opens at its
planned time and is assigned as soon as a qualifying driver can take it.
```

**Tasks**

- [x] E8-T01 ⚠ **This is what keeps 078's switch off.** `GATHER_DELIVERY` takes `delivery_method = 'same_day'` only; since 078 a later-day Effy package is `standard` WITH a window (`opd.slot_id`), so gather by the window, not the method. `fleet/src/planner/windows.ts` / `service.ts` / `sql.ts`: plan delivery waves for windows on future dates; only release a round on its date (`round_opens_at` unchanged, single source). — *Gather by `package_delivered_by`, plus one day predicate; `round_opens_at` unchanged.*
- [x] E8-T02 Collection eligibility: package due for collection by `window_start − hub_turnaround`; future-day packages collected on the latest run that makes it (or earliest — decide; earliest frees shop space, latest keeps chilled goods in shops). — *LATEST run that makes the window (`collectionRunFor`), settled by default.*
- [x] E8-T03 Hub storage: package "At hub" across days; status derivation already handles it — test multi-day dwell. — *Covered by the planner container tests (a parcel at the hub for two days).*
- [x] E8-T04 Temperature classes (065): chilled/frozen dwell at hub overnight — product call; add an exception if storage is not allowed. — *Settled by default: allowed, flagged "Needs cold storage" on dispatch's day view.*
- [x] E8-T05 Migration: `driver_zone_capability.method` dropped; `zone_id` → coverage group id (or NULL = everywhere). Data migration from current grants. — *NO migration: the method column is unread and dropped at E9; areas stay keyed on the group.*
- [x] E8-T06 `fleet/src/capabilities`, `fleet/src/drivers`: routes and validation without method.
- [x] E8-T07 `driver/src/work/*` (`repository.ts`, `sql.ts`, `service.ts`, `complete.ts`, `delivery.ts`): task type `same_day_delivery` → `effy_delivery` (enum change with legacy alias); hub check-in split Effy/courier. — *Wire value `same_day_delivery` kept until E9; check-in adds `effyGroups`.*
- [x] E8-T08 `driver/src/proof/*`: completion rules unchanged; courier handover proof via hub staff (E6). — *No change needed.*
- [x] E8-T09 `fleet/src/dispatch/*`: day selector across 4 days. — *`GET /fleet/v1/dispatch/windows?date=`.*
- [x] E8-T10 Shared types `dispatch.ts`, `driver.ts`: rename types; Kotlin `contract-driver`.
- [x] E8-T11 driver-mobile: `features/collection/*`, `features/today/*` (`UpcomingRounds.kt`, `UpNextList.kt`, `TodayScreen.kt`), `features/delivery/*`, `features/map/*`, `features/history/*`, `core/nav/DriverRoutes.kt`: wording + hub check-in two groups.
- [x] E8-T12 back-office `features/dispatch/*`, `features/drivers/*` (capability editor without method).
- [x] E8-T13 Port driver container tests (`hub-stop`, `checkin`, `drop-window`, `manifest`, `open`, `drop-progress`). — *Ported where they asserted a method; `checkin` extended.*
- [x] E8-T14 Port `CollectionViewModelTest.kt` and add Today tests for future-day rounds. — *`HubSplitTest` extended; the Today screens only changed words.*
- [x] E8-T15 Update `docs/logistics-engine-architecture.md`, `docs/driver-app-design-brief.md`.
- [x] E8-T16 FEATURE-HISTORY entry + operator steps (driver app release needed). — *Operator steps in the SIGNOFF; deployed to dev 2026-10-09.*

---

## E9 — Cutover & Retirement of Same-Day/Standard · spec 083 — ✅ both stages deployed to dev 2026-10-10

> **2026-10-09 — specified (`specs/083-delivery-model-cutover/spec.md`).** The specify prompt below was amended with
> what 078–082 left: the customer words "Same-day delivery" / "Standard delivery" STAY (078's decision — the
> old ARRANGEMENT goes, not those two names); the readiness check requires courier delivery to be off or fully
> armed (079); collection runs and the hub location are readiness items; the removal waits for updated apps.
> Settled by default, for the operator to confirm: **two stages released separately** (the switch; then the
> removal once no old order is open); **admins only** set the switch; it **can be turned back, with a reason,
> until the removal**; "open" = paid and not completed, cancelled or fully refunded; an alert if old orders are
> still open 7 days after the switch.
>
> **2026-10-09 — planned (`specs/083-delivery-model-cutover/plan.md`).** Corrections to the tasks below:
> **E9-T02** — readiness is ONE shared function used by the page, the setter and a 5-minute sweep that blocks
> a scheduled switch whose readiness has broken. **E9-T03** — no work: old orders already render from
> `package_delivered_by` and their method. **E9-T06** — the two tables are NOT dropped or renamed (076 evolved
> them in place; they are the list). **E9-T09** — the method columns STAY: for an Effy order they are the
> customer's word (same-day = today's window). **E9-T13/T14** — the driver wire's `same_day_delivery`,
> `sameDayCount`, `standardCount` and the shop wire's `deliveryMethod` are KEPT as compatibility values:
> there is no app-update mechanism, so installed apps must keep working. **E9-T15** — the script is
> `check-no-legacy-delivery.sh` and names the old PATH's identifiers, not the words `same_day`/`standard`.
> **Stage 2's migration refuses while an old order is open.**
>
> **2026-10-09 — stage 1 built (083 T001–T021).** One migration (a settings column for the alert age). The
> switch's ONE writer is `admin/src/delivery/go-live.repository.ts`; `goLiveReadiness` (shared) is the one
> definition the page, the setter and the sweep ask; `LEGACY_OPEN_ORDER_SQL` is the one definition of "an old
> order still open" for the count, the list filter and the alert. `GET /admin/v1/delivery/go-live`,
> `PUT /admin/v1/delivery/go-live/switch` (staff gateway +2). Done differently: **P7** ("old orders finish as
> sold") is proven in the planner and handover suites that already hold the fixtures, not in a new
> cross-service test; **E9-T03 / T015** needed no change — every surface already asserted an old order renders.
> Found while proving P6: an order's type is recorded when it is **captured**, so an order captured the old way
> and paid just after the moment is still an old order — the runbook says to expect a few.
>
> **2026-10-10 — stage 2 built (083 T022–T038), on the operator's instruction to proceed** (dev has no users);
> **not migrated or deployed.** One checkout (Effy windows or courier); the removal migration refuses while an
> old order is open or the model was never switched on, and runs on a database with no orders. Decisions that
> differ from the tasks below: **E9-T06** — the two tables are kept (they are the list and its groups);
> **E9-T07** — only `shop_sameday_exception` still existed; **E9-T09** — the method columns are KEPT (the
> customer's words for an Effy order, and how an old order is read); **E9-T11 / T12** — already deleted by 076/077;
> **E9-T13** — the customer quote and intent lost the old fields, while the driver and shop wire KEEP
> `same_day_delivery` / `sameDayCount` / `standardCount` / `deliveryMethod` as compatibility values. ⚠ The
> customer web and app must be released with the `commerce` deploy: an older build cannot read the new quote.
> Not done: four operator guides carry a notice rather than a rewrite. **Programme status: E0–E9 built; E10
> deferred. Stage 2 of E9 awaits the operator's deploy and walks.**

> **2026-10-09 — three removals moved here from E5 (079 research R10).** Today's live checkout still
> reads them, so they go with the legacy quote, not before: the same-day bridge
> (`delivery_zone.sameday_eligible`, `shop_sameday_exception`, `sameDayForShops`), the per-package
> compatibility `feeAmount` (`compatibilityFees`), and the "N of your M deliveries" sentence. Also
> E9's: drop `shop_fulfillment.delivery_method` / `order_package_delivery.method` from the shop wire
> (`deliveryMethod`, the `method` filter) once `deliveredBy` is the only reader.

**Goal.** Switch new orders to the new model on a chosen date, keep old orders readable, then
delete the old model's code, columns and docs.

**`/speckit-specify` prompt**

```
/speckit-specify Cutover to the new delivery model. From a moment the business chooses, every new
order uses "Delivered by Effy" (a delivery window today or on one of the next delivery days) or "Courier
delivery"; orders placed before that moment keep exactly what they were sold (a same-day window, or a
standard day handed to a carrier) and finish their journey unchanged — customers, suppliers, drivers and
staff can still see and complete them. Before the switch, staff can check that the new setup is complete
— delivery area listed, an Effy fee plan active, delivery windows defined, collection runs scheduled, and
courier delivery either switched off or fully set up (fee table, default courier service, how parcels
reach the courier) — and the switch refuses to happen if anything is missing. Staff choose the moment
(now, or a future time), can change or cancel it until it arrives, and can see afterwards when it
happened and who set it. After the switch staff can see how many orders of the old kind are still open.
Once none remains open and every app in use has been updated, the old arrangement is removed entirely in
a second step: the old checkout choices, the old settings and screens that only served it, and the old
words for staff, suppliers and drivers all go, while the history of old orders still reads correctly.
Customers keep reading "Same-day delivery" and "Standard delivery" as the names of an Effy window today
or on a later day. The business's documentation is rewritten to describe only the new model, with a short
record of what the old one was and how to read an old order.
```

**Tasks**

*Cutover*
- [x] E9-T01 **The switch already exists (078)** — `delivery_settings.delivery_model_v2_from`, read only via `public.delivery_model_v2_at` → `deliveryModelV2At`. Add ONLY the setter route (staff gateway) behind E9-T02's readiness check; do not create `delivery_model_for`. — **Done (stage 1).** `PUT /admin/v1/delivery/go-live/switch`, admin only, with `expected` so two admins cannot overwrite each other; set / change / cancel / turn back off (reason required), each audited.
- [x] E9-T02 Readiness check route + back-office "Go-live checklist" panel (coverage non-empty, Effy plan active and complete, courier plan active, ≥1 active slot, courier service defined, collection mode set). — **Done (stage 1).** One shared `goLiveReadiness`; Go-live tab; a 5-minute sweep clears a scheduled switch that is no longer ready within 10 minutes of its moment and alarms.
- [x] E9-T03 Legacy rendering: `delivery_type IS NULL` orders render from `delivery_method` everywhere (status, receipts, apps) until closed. — **No work (stage 1):** already true; proven with the switch ON (planner + handover suites).
- [x] E9-T04 Report: open legacy orders count (back-office + metric) — the trigger for the retirement step. — **Done (stage 1).** Count on the Go-live tab linking to the order list's "Still open" filter; metrics `LegacyOrdersOpen` / `LegacyOrdersOpenPastDue` + alarm.
- [x] E9-T05 Runbook `docs/runbooks/delivery-model-v2-cutover.md` (order: migrations → deploy shared → services → web → mobile releases → set the date). — **Done (stage 1).** Written for the real order of work: migration → `admin`, `orders` → `apply` → back-office → readiness → the moment.
*Retirement (after legacy count = 0)*
- [x] E9-T06 Migration: drop `delivery_ring`, `delivery_zone.ring_id`, `ring_is_overridden`, `hub_distance_km`, `sameday_eligible`; drop `delivery_zone` + `delivery_zone_postcode` if E2 replaced them. — **Done differently (stage 2).** `sameday_eligible` dropped; rings were already gone (077); the two tables are KEPT.
- [x] E9-T07 Migration: drop `shop_sameday_declaration`, `shop_sameday_area`, `shop_sameday_exception` (if still present in the live schema — verify). — **Done (stage 2).** `shop_sameday_exception` dropped; the other two no longer existed.
- [x] E9-T08 Migration: drop method factor columns from fee plans; drop `carrier_lead_days`, `standard_lookahead_days` (renamed ones stay; `effy_lookahead_days` from 078 stays). (Takes over E4-T03.) — **Done (stage 2).** Also `courier_estimate_text`, the per-package `delivery_fee_amount` columns and the round lock.
- [x] E9-T09 Migration: `shop_fulfillment.delivery_method`, `order_package_delivery.method` → constrain to legacy-only or drop after archival (keep history readable: decide archive view). — **Done differently (stage 2).** The method columns are KEPT, unconstrained: not legacy. `docs/archive/delivery-model-v1.md` says how to read an old order.
- [x] E9-T10 (takes over E4-T05; also delete the 069 half of `quote.ts`, `resolveDeliveryChoice`, and the web/mobile 069 pickers; rename "slot" → "window" on the back-office screen) Delete `shared/src/delivery/sameday.ts`, `standard-days.ts`, ring code in `plan.ts`/`zone.ts`, `METHOD_SAME_DAY`/`METHOD_STANDARD` exports. — **Done (stage 2).** `sameday.ts` → `schedule.ts`; `standard-days.ts`, `model.ts`, `judgeSlot`/`openSlots`, `resolveDeliveryChoice`, `compatibilityFees` and the web/mobile 069 pickers deleted. `METHOD_SAME_DAY`/`METHOD_STANDARD` KEPT (the customer's words).
- [x] E9-T11 Delete admin routes `delivery-rings-*`, `delivery-zone-suggest-ring-*`, `delivery-exception*`, `admin/src/delivery/suggest.ts` (+ tests) and `serverless.yml` entries. — **No work (stage 2):** deleted by 076/077.
- [x] E9-T12 Delete back-office `NewRingDialog.tsx`, `SameDayExceptionsDialog.tsx`, old `NewZoneDialog.tsx`, `NewPlanDialog.tsx`. — **No work (stage 2):** deleted by 076/077.
- [x] E9-T13 Remove same-day/standard from `packages/shared-types/src/*` and Kotlin contracts. — **Done differently (stage 2).** Customer quote/intent fields removed; driver and shop compatibility fields kept and marked.
- [x] E9-T14 Remove same-day/standard from all three mobile apps and three web apps (sweep from E0-T03). — **Done differently (stage 2).** The old CHECKOUT is removed from customer web and mobile; the customer words stay (078); driver/shop compatibility values kept.
- [x] E9-T15 Add a guard script `scripts/check-no-same-day.sh` (pattern of `check-no-emerald.sh`) that fails the build on `same_day|sameday|standard_date` outside migrations and archived docs. — **Done (stage 2)** as `scripts/check-no-legacy-delivery.sh`: the old path's identifiers, not the words.
- [x] E9-T16 Dev seeds (`db/seeds/047_delivery_dev.sql`) rewritten for the new model. — **Done (stage 2).** Also `062_capability_dev.sql`.
*Docs*
- [x] E9-T17 Rewrite `CLAUDE.md` → "Driver logistics model" for the new model (remove the 047/069 same-day/standard bullets; keep 072/073 bullets that still hold). — **Done (stage 2).** The section is now "Delivery model".
- [x] E9-T18 Constitution amendment if any principle names same-day/standard (check `.specify/memory/constitution.md`). — **Checked (stage 2):** no principle names it; not amended.
- [x] E9-T19 Mark 047/069 specs as superseded in their headers; FEATURE-HISTORY entry. — **Done (stage 2).**
- [x] E9-T20 `docs/archive/delivery-model-v1.md`: what the old model was and how to read legacy orders. — **Done (stage 2).**

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
