# Research: Effy Delivery Coverage

**Feature**: 076-effy-delivery-coverage · **Date**: 2026-10-08 · **Spec**: [spec.md](spec.md)

Read from `dev` after 075. Backlog: `docs/prd/2026-10-delivery-model-v2-backlog.md`, epic E2.

---

## F1 — What exists today (047, 062, 063, 069)

| Thing | Where | Who reads it |
|---|---|---|
| `delivery_zone` (code, name, `ring_id` NOT NULL, `hub_distance_km`, `sameday_eligible`, `status`) | 047 | quote, serviceability, fleet planner/dispatch/readiness/duty/capabilities, driver app |
| `delivery_zone_postcode` (`zone_id` NOT NULL **ON DELETE CASCADE**, `postcode` UNIQUE) | 047 | the same |
| `delivery_ring`, `delivery_ring_price` | 047 | the live fee (`shared/src/delivery/quote.ts`) |
| `shop_sameday_exception` (shop × zone) | 047 | `sameDayForShops` in the live quote |
| `driver_zone_capability.zone_id` (NULL = every zone) | 062 | driver eligibility: `c.zoneId === null \|\| c.zoneId === work.zoneId` |
| `round_stop.zone_id` (ON DELETE SET NULL) | 063 | round ordering, history |
| `locality` (name, state, postcode, `latitude`, `longitude` nullable, `address_count`) | 030/047 | address typeahead, ring suggestion |
| `delivery_settings` (`hub_latitude`, `hub_longitude`) | 047 | ring suggestion |
| `serviceableForPostcode` / `zoneForPostcode` (`shared/src/delivery/zone.ts`) | 047 | storefront serviceability, checkout quote |

Two facts shape everything below:

1. **`delivery_zone_postcode.postcode` is already UNIQUE** — it already *is* a flat list of postcodes,
   each in exactly one zone.
2. **Thirteen source files across five services join these two tables**, and the live checkout, the
   live fee and the live driver planner all depend on them until epics E3, E5 and E8 replace those
   readers.

Two refusal wordings exist today: the server's `"we don't deliver to this address yet"`
(`commerce/src/checkout/respond.ts`) and the web's `"We don’t deliver to this address yet. Try a
different address above."` (`CheckoutFlow.tsx`). Saved addresses are not checked at all.

---

## R1 — Evolve the two tables in place; do not create a second list

**Decision.** The coverage list **is** `delivery_zone_postcode`, and a coverage group **is**
`delivery_zone`. They gain columns and lose constraints; they are not copied into new tables. The
tables keep their names until the cutover (E9), which renames them.

**Rationale.** The backlog sketched new `effy_coverage_*` tables filled by a copy. Until E3/E5/E8 land,
the live quote, fee and planner must keep reading the old tables — so there would be **two lists of
where Effy delivers**: the one staff edit and the one checkout obeys. Add Richmond to the new list and
the address screen says "Delivered by Effy" while checkout refuses it. This repository has shipped that
defect shape five times (CLAUDE.md, "two sources for one fact"). One list cannot disagree with itself.

**Cost.** For a few features the names say "zone" where the product says "group". Table and column
comments say so; the shared library and every DTO use the new words.

**Alternative rejected.** New tables with triggers keeping the old ones in step — two lists plus the
machinery to pretend they are one.

---

## R2 — One function decides the answer

**Decision.** `public.coverage_for_postcode(p_postcode text)` returns one row:
`kind` (`effy` | `courier` | `none`), `reason` (a closed set, below), `distance_km`, `group_id`,
`group_name`. `@effy/edge-shared/delivery` exposes `coverageForPostcode(q, postcode)` over it, and
`serviceableForPostcode` / `zoneForPostcode` are rebuilt on top of it rather than keeping their own
joins. No other SQL may decide coverage; a guard test greps for joins on `delivery_zone_postcode`
outside the allowed files.

| `reason` | `kind` | Meaning (staff-facing) |
|---|---|---|
| `listed` | effy | on Effy's list |
| `courier_offered` | courier | not on the list; courier delivery is on and the postcode is not excluded |
| `courier_off` | none | not on the list; courier delivery is switched off |
| `courier_excluded` | none | not on the list; excluded from courier delivery (the exclusion's own reason is read separately) |
| `unknown_postcode` | none | no such postcode in the country's place data |

Same discipline as `public.round_opens_at` (072) and `public.points_usable` (074): derived, never
stored, never recomputed elsewhere (FR-020, FR-021).

---

## R3 — Distance is worked out in SQL

**Decision.** Two SQL functions: `public.haversine_km(lat1, lon1, lat2, lon2)` and
`public.coverage_computed_distance_km(p_postcode)` — the straight-line distance from
`delivery_settings`' hub point to the postcode's **primary place**: the `locality` row for that
postcode with coordinates and the highest `address_count` (ties: name). NULL when the postcode has no
place with coordinates.

Each list row stores `distance_km NOT NULL` and `distance_source` (`computed` | `manual`).

**Rationale.** A hub move must recalculate every computed distance (FR-012). In SQL that is one
`UPDATE … WHERE distance_source = 'computed'` inside the same transaction as the settings change, and
it returns the counts the screen reports. In TypeScript it is a loop over hundreds of rows with the
formula living in a second place. The existing `haversineKm` in `admin/src/delivery/suggest.ts` is
retired with ring suggestion (R5) — the formula exists once.

Hub latitude/longitude are NOT NULL today, so "the hub has no location" (spec US6-4) cannot occur in
practice; the function still returns NULL defensively and the add flow then requires a manual distance.

A manual distance is bounded 0–5000 km (wider than the country; rejects a typo of metres for km).

---

## R4 — A group is the old zone; removing one never removes its postcodes

**Decision.**

- `delivery_zone_postcode.zone_id` becomes **nullable**, and its foreign key changes from
  `ON DELETE CASCADE` to **`ON DELETE SET NULL`**. Today, deleting a zone deletes every postcode in it
  — the exact opposite of FR-015.
- "Remove a group" is a **soft removal**: the zone row is set `status = 'disabled'` and its postcodes'
  `zone_id` set NULL, in one transaction. The row stays because `round_stop.zone_id` and driver
  clearances reference it, and delivery history must keep its group names.
- `status` no longer decides coverage. Everything that asks "is it covered?" goes through R2, which
  does not look at it.

**At release** (FR-029): postcodes belonging to a zone that is `disabled` today are **not served
today**, so the migration removes them from the list (and writes one audit row naming them). Every
postcode in an active zone stays, in its zone. SC-002 — zero gained, zero lost — is proved by a
container test comparing `serviceableForPostcode` for every postcode before and after the migration.

---

## R5 — The live fee and same-day rules keep working from frozen settings

The spec's assumption: same-day and standard keep selling until E5/E9; this feature removes the
*controls*. Three bridges, each a `COALESCE` in `zoneForPostcode`, each deleted by the epic named:

| Live rule (until) | For a postcode in a pre-076 group | For a postcode added after, or ungrouped |
|---|---|---|
| **Fee tier** (E3) | the zone's `ring_id`, unchanged — nobody's fee moves at release | the tier whose `suggest_upper_km` covers the postcode's distance (the existing `ringForDistance` rule, moved into SQL as `public.coverage_ring_for_km`) |
| **Same-day eligible** (E5) | the zone's `sameday_eligible`, unchanged | **true** — under the new model Effy delivers same day to everything on its list |
| **Per-shop same-day exception** (E5) | existing rows, unchanged | none |

`delivery_zone.ring_id` becomes nullable; groups created from 076 on have NULL and are priced by
distance. `sameday_eligible` gets default `true`.

**Routes removed** (controls gone, FR-030): ring create, zone create/patch, zone-postcode add/remove,
suggest-ring, the three same-day-exception routes, postcode-check — **11**. **Ring *list* stays**,
read-only: the fee-plan dialog prices per tier until E3.

**Invariant kept.** `ServedZoneUnpricedError` (047 FR-029) still fires if the active plan does not price
the resolved tier. `coverage_ring_for_km` returns a tier whenever any exists, and every tier in a plan
must be priced (047), so adding a postcode cannot create an unpriced destination. A container test
adds a far postcode and quotes it.

---

## R6 — ⚠ Driver clearances still hang off groups until E8

`driver_zone_capability` grants a driver work in one zone, or in every zone (`zone_id IS NULL`).
Eligibility is `c.zoneId === null || c.zoneId === work.zoneId` (`shared/src/lib/driver-eligibility.ts`).

**Consequence.** A postcode with **no group** has `work.zoneId = null`, which only an **every-zone**
driver matches. So until E8 (driver operations realignment), a group is not *purely* organisational
inside the building: it is also what a driver is cleared for.

This does not break FR-014 as written — no customer's answer, price or offered service changes with a
group. But an ungrouped postcode with no every-zone driver on duty would be *sold* and then left
unplanned (the existing unplanned-work alarm fires).

**Decision.** Do not change the planner in this feature (E8 owns it). Instead make it impossible to do
by accident:

- the Coverage screen shows, on the list and in the add / remove-group dialogs, **"N drivers can
  deliver here"** per group and for ungrouped postcodes (one aggregate from `driver_zone_capability`);
- adding a postcode ungrouped, or removing a group, when that count would be **zero** asks for explicit
  confirmation in words;
- recorded in SIGNOFF as a limitation E8 removes.

**Alternative rejected.** Teach the planner "ungrouped = any delivery driver" now — it is E8's design
decision, made early in a feature that should not touch dispatch.

---

## R7 — Courier reach: a switch that cannot yet be turned on

**Decision.** `delivery_settings.courier_offered boolean NOT NULL DEFAULT false` and a table
`courier_excluded_postcode (postcode PK, reason NOT NULL, added_by, created_at)`.

Turning the switch on is **refused** (`409 courier_ordering_unavailable`) while
`COURIER_ORDERING_AVAILABLE` in `@effy/edge-shared/delivery` is `false`. E5 flips the constant when a
courier order can actually be placed.

**Rationale.** Spec assumption 1. Without the lock, one click makes every address in the country say
"Courier delivery" while checkout — which cannot sell one — refuses it: FR-020 broken by a setting.
Fail loudly (constitution, Real-World Identifiers' "a build that stops beats a value that silently
works" applies in spirit). Exclusions can be maintained now.

`unknown_postcode` is `none` even with courier on: a courier cannot be booked to a place that is not
in the country's data.

---

## R8 — One refusal sentence, in one file

**Decision.** `packages/shared-types/src/delivery.ts` exports

```ts
export const COVERAGE_REFUSAL_SENTENCE = "Sorry, we can't deliver to this address.";
export const COVERAGE_REFUSAL_CODE = "address_not_covered";
```

mirrored into the Kotlin contract by the existing generator. The server's refusal carries the code and
the sentence; web and mobile render the constant, never their own string. The two existing wordings
(F1) are deleted. A guard test fails if `don't deliver to this address` / `don’t deliver` appears in
any customer surface or service outside that file (SC-004).

The customer-facing names are constants beside it: `"Delivered by Effy"`, `"Courier delivery"`.

---

## R9 — Where the customer meets the answer (no new customer route)

The shared gateway is at 53%; still, three existing responses gain a field rather than adding routes:

| Surface | Route (existing) | Change |
|---|---|---|
| "Do you deliver to me?" (home, delivery location) | `GET /storefront/v1/serviceability` | adds `coverage`; `serviced` kept (= `coverage !== "none"`) for clients already released |
| Saved addresses (add, edit, list) | `customer` address routes | each address in the response gains `coverage`, computed at read (FR-021) |
| Checkout | `POST /commerce/v1/checkout/quote` | adds `coverage`; refusal uses R8 |

⚠ `serviceability` is cached publicly for a day. A postcode removed from the list would keep
answering "yes" from caches for 24 h, contradicting checkout. Cache drops to **5 minutes**.

⚠ `coverage: "courier"` cannot occur before E5 (R7). The live quote treats it as not purchasable and
says so with a distinct internal error, so if E5 forgets to handle it the failure is a test, not a
customer.

Mobile already-released builds ignore the new field and keep reading `serviced`.

---

## R10 — Back-office routes: service `admin`, staff gateway

`admin` owns delivery configuration (path-assignment). All routes take the back-office authorizer on
the **staff** gateway.

Removed 11 (R5), added 13 ([contracts/routes.md](contracts/routes.md)) — **net +2**. Staff gateway
144 → 146 of 300. The `admin` stack is at 374 of CloudFormation's 500 resources; +2 functions ≈ +10.

Authorization, from the `admin.staff` record (existing `delivery/authz.ts`): **read** = any active
staff incl. `csa`; **write** = `admin`, `manager` (FR-026).

Every write inserts into `admin.audit_log` in the same transaction (the pattern the delivery
repository already follows) with before and after (FR-027). No new audit table.

---

## R11 — Live update

`LIVE_KINDS` gains `"coverage"`, announced on the ops channel after any coverage write commits
(FR-028). Back-office maps it to the coverage query keys. Not sent to customers, shops or drivers: a
customer's answer is re-read when they next ask, and a kind on their channel would say only "something
about coverage changed somewhere".

`infra/envs/dev/live.tf` `live_kinds` gains it too (the 074 lesson: the contract test fails otherwise).

---

## R12 — The screen

`DeliveryScreen.tsx` today has tabs for zones, rings, plans, settings, collection runs, slots, days.
**Zones** and **Rings** are replaced by **Coverage**: one table (postcode, places, group, distance,
how obtained, drivers), filters, a place-search add dialog, a checker, a groups panel and a courier
panel. Tables and panels, no cards (Principle V). `NewRingDialog`, `NewZoneDialog`,
`AddPostcodeDialog`, `SameDayExceptionsDialog` are deleted — not left unreferenced (their routes are
gone, and dead dialogs calling dead routes are how a later feature revives one).

Shop console: it has **no** same-day-exception or coverage control today (checked), so FR-030/031
need no shop-web change.

---

## Unknowns

None blocking. Two things are **checked by the first tasks** rather than assumed:

- that no disabled zone in dev holds postcodes someone expects to keep (the migration lists what it
  removes; the operator sees the list in the migration's NOTICE output before anything else deploys);
- the count of `locality` rows without coordinates among currently listed postcodes — those become
  `manual` distances seeded from the zone's `hub_distance_km`, and are flagged for review.
