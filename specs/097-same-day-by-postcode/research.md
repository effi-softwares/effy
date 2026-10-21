# Research: Delivery Today, Postcode by Postcode (097)

Every decision below was taken by reading the code as it stands on `dev` (2026-10-21), not from
memory of earlier features.

## R1 — Where the setting lives

**Decision**: a column on the list itself — `public.delivery_zone_postcode.today_offered boolean NOT
NULL DEFAULT true`.

**Rationale**: the list row IS "a postcode Effy delivers to" (076); the setting is a property of that
fact and dies with it (spec edge case: a removed-and-re-added postcode does not remember). `DEFAULT
true` makes the migration itself change nothing any customer sees (FR-002, SC-002).

**Alternatives rejected**:
- *A column on `delivery_zone` (the group)* — groups decide nothing a customer sees (076 FR-014,
  CLAUDE.md); the spec rejects it explicitly.
- *A separate `postcode_today_exclusion` table* — two tables for one fact about a listed postcode,
  and a row that can outlive its listing.
- *A distance threshold setting* — rejected by the spec (no automatic rule).

## R2 — How the decision reaches checkout: through the ONE coverage answer

**Decision**: `public.coverage_for_postcode(text, timestamptz)` gains a sixth column,
`today_offered boolean` (the row's value when listed; `true` when not listed — it means nothing
there). `coverageForPostcode` (`shared/src/delivery/coverage.ts`) returns it as
`Coverage.todayOffered`.

**Rationale**: `coverage.guard.test.ts` (P12) fails any new reader of `delivery_zone_postcode`
outside the allowed files, and fails a second reader of the coverage function. The quote and the
override already ask `coverageForPostcode` for this address; they get the new fact in the same
call, with no new query and no new reader.

**Mechanics**: the return type changes, so the migration must `DROP FUNCTION` and `CREATE` it
(Postgres cannot `CREATE OR REPLACE` a function whose result columns change) — exactly what 079's
migration did to add the instant argument. No other SQL object calls it (checked: only `COMMENT`s
and its own definitions reference it). Down migration restores 079's body verbatim.

## R3 — Where the rule is applied: the CALENDAR, not the window rule

**Decision**: `effyDays(now, lookahead, noWeekdays, noDates, todayOffered)` — when `todayOffered`
is false, the calendar it returns **does not contain today**. The later delivery days are
unchanged (still `lookahead` of them).

**Rationale** — it is a fact about which DAYS an address may be sold, and the calendar is the one
thing every Effy path already builds:

| Path | Builds the calendar with `effyDays` | Effect of today being absent |
|---|---|---|
| Checkout quote (`shared/src/delivery/quote.ts`) | yes | no today `EffyDay` → no `same_day` day in the DTO → **no Same-day section** on web and app (both already render `today == null` as no section — `EffyWindowOptions.tsx` `{today ? … : null}`, `CheckoutScreen.kt` `view.today?.let`). No surcharge priced. |
| "As soon as possible" (`resolveAsap`, commerce) | reads the quote's days | first day with an Any-time window is now a later day (FR-006) — no code change |
| Choice at the payment-intent call (`resolveEffyWindow`) | reads a fresh quote | a today choice is not found → `date_unavailable` refusal, nothing written; the customer chooses again (FR-008) — no code change |
| Back-office move to Effy / re-time — the window list (`override.ts` `windowsNow`) | yes | today not offered to staff |
| Back-office move to Effy / re-time — the commit (`override.ts` `bindEffyWindow`) | yes (`calendar.find(date)`) | a today window → `window_unavailable` (FR-007) |
| Courier-when-no-windows (quote) | `windowsUnavailable(days)` | judged over the days actually offered — so a postcode whose only open window was today falls to the existing rule (spec edge case) — no code change |

**Alternatives rejected**:
- *A new verdict in `judgeWindow`* — judgeWindow judges ONE window; today's day would still be
  listed with every window refused, so the customer would see the Same-day section with "No windows
  left today." (`DELIVERY_WINDOW_WORDS.todayClosed`) — new visible behaviour, against FR-010 — and
  the DTO mapper would need a second rule to hide it. Two mechanisms for one fact.
- *Mark today `nonDelivery`* — the customer would read "We don't deliver today." — false (Effy does
  deliver today, just not here) and new wording.
- *Filter today out in the commerce DTO mapper only* — the override paths would not see it (FR-007
  fails), and ASAP would still land today.

**The place hold (`commerce/src/checkout/store.ts` `captureDelivery`) needs no change.** It runs in the
same request, after the fresh quote and `resolveEffyChoice`, and judges only the window rule; the
calendar (non-delivery days included) has always been the quote's job. FR-009 (a held place stands)
follows from not touching held or confirmed bookings at all.

## R4 — Making every caller decide

**Decision**: `noWeekdays`, `noDates` and the new `todayOffered` become **required** parameters of
`effyDays`. The two staff calendars that are not about an address — `fleet/src/dispatch/windows.ts`
and `fleet/src/slots/service.ts` — pass `true` with a one-line comment ("a staff calendar, not an
address").

**Rationale**: a defaulted parameter is how a new caller silently sells today everywhere. All five
production callers already pass the first two; only tests rely on the defaults.

## R5 — An Effy order whose postcode is no longer listed

**Decision**: for re-timing such an order, `todayOffered` is `true` (the coverage function's value
for an unlisted postcode). Moving a courier order to Effy is already refused there (`not_in_area`).

**Rationale**: removal from the list never touched an existing order (076); this feature does not
start to. Recorded so the behaviour is chosen, not accidental.

## R6 — Staff controls: no new route

**Decision**: extend the existing coverage routes (all on the **staff** gateway, `admin` service):
- `GET …/coverage` — rows carry `todayOffered`; new filters `today=offered|not_offered` and
  `minKm=<decimal>`; `counts.todayNotOffered`.
- `PATCH …/coverage/postcodes` — new optional `todayOffered: boolean`, for up to 500 postcodes, in
  the same request shape that already moves groups in bulk.
- `POST …/coverage/postcodes` — new optional `todayOffered` (default `true`) for the postcodes added.
- `GET …/coverage/check` — `todayOffered` (null when not listed).

**Rationale**: no new integration on either gateway (`gateway-capacity.contract.test.ts` unchanged);
the existing manager/admin gate, audit helper and `announce(ops, coverage)` already wrap these routes.

**Why `minKm`**: the spec's own example is "filter to postcodes more than 25 km from the hub, select,
switch off". The list's current "Distance" facet filters by how a distance was obtained
(computed/manual/review), not by its size; without `minKm` the example is not doable.

## R7 — Audit

**Decision**: one `admin.audit_log` row per change request, action `coverage.postcode.today`,
`detail = { before: { "<postcode>": <bool>, … }, after: <bool> }` — the same shape
`coverage.postcode.group` already uses for a bulk move. Adds record `todayOffered` in their existing
`after`.

**Rationale**: FR-016 asks for who/when/which/before/after; the group move proves a single row per
bulk action satisfies the existing audit readers.

## R8 — What does not change

- **Customer apps and customer-web**: no code change; no new wording. Installed mobile apps behave
  correctly because they already render a quote with no `same_day` day as no section.
- **Fee engine**: unchanged. The "Delivery today" surcharge is only priced for a today window, which
  no longer exists for these addresses.
- **Driver work, planner, round opening, hub check-in**: unchanged — they act on orders, and orders
  already placed keep what they bought (FR-009).
- **Storefront "do we deliver to you?"** (`serviceability-v1-get.ts`): reads `kind` only; unchanged.
