# Quickstart: Delivery Pricing & Same-Day Coverage (032)

How to run and validate this feature end to end.

⚠ **Sections 0 and 1 are gates, not steps.** Nothing after them can be validated until they are done,
and both are operator-run (they touch live AWS, the database, and a 1.7 GB download).

Per CLAUDE.md: **the operator runs every migration, deploy and cloud command.** The commands below are
written to be run by a person, not by the agent.

---

## 0. Gate — places need coordinates (FR-035)

⚠ **Requires re-downloading G-NAF.** 030 discarded the coordinate columns; there is no way to recover
them from what is in the database.

```bash
# 1. Download G-NAF from data.gov.au (CC BY 4.0) — see db/reference/README.md
#    ~1.7 GB, unzipped to a scratch directory.

# 2. Re-derive, now including LATITUDE/LONGITUDE from {ST}_LOCALITY_POINT_psv.psv
make derive-localities GNAF=~/Downloads/G-NAF_MAY26

# 3. Expected: 15,414 data rows → ⚠ wc -l reads 15,415, because the file has a header.
#    If the row count differs from 030's, STOP and find out why before loading —
#    a changed count means the dataset moved under you.
wc -l db/reference/au-localities.csv
```

```bash
make db-up ENV=dev                    # the 032 migration
make load-localities ENV=dev          # re-load, now with coordinates + centroids
```

**Verify the gate:**

```sql
-- Every delivered-to postcode has a centroid (SC-013). Expect ZERO rows.
SELECT p.postcode
FROM public.delivery_zone_postcode p
LEFT JOIN public.postcode_centroid c ON c.postcode = p.postcode
WHERE c.postcode IS NULL;

-- ⚠ The honesty check: postcodes whose centroid averages many far-apart places.
SELECT postcode, locality_count FROM public.postcode_centroid
ORDER BY locality_count DESC LIMIT 5;
```

⚠ **If the first query returns rows, do not proceed.** Those shoppers would be priced at the furthest
band — correct by design (FR-038), but it means the configuration, not the code, is wrong.

---

## 1. Gate — products need weights (FR-036/FR-037)

Runs inside the same migration. **Verify it did something:**

```sql
SELECT weight_is_assumed, count(*) FROM public.product GROUP BY 1;
-- Expect roughly:  false | 14      true | 24
```

⚠ **If `false` comes back as 0, the backfill matched nothing** — check the attribute key is `net_weight`
and the value column is `value_number` (not `value_numeric`; see data-model.md). A migration that updates
zero rows reports success, and every product would then be priced on an assumption while looking fine.

⚠ **If `false` comes back as 38, the WHERE clause is not filtering** — every product would claim a real
weight it does not have, which is worse than the gap it replaced.

**SC-012** is this query returning `0` for weight-less products:

```sql
SELECT count(*) FROM public.product WHERE weight_grams IS NULL OR weight_grams <= 0;  -- expect 0
```

⚠ **That query alone does not prove SC-012.** It is satisfied by the `DEFAULT 500` on every row. The
second half of the criterion is that an operator can make a weight *true*: open a product in the shop
console, enter its real weight, and confirm it flips from **assumed** to **measured**. Without that, the
platform can only ever hold the default and the flag is written once by a migration and never again.

---

## 2. Deploy

```bash
make edge-deploy SERVICE=admin ENV=dev
make edge-deploy SERVICE=shop  ENV=dev
make core-run                             # hot path, local Docker (core-api has no cloud deploy)
```

Consoles: `pnpm --filter @effy/back-office dev` (:5173) and `pnpm --filter @effy/shop-web dev` (:5174).

---

## 3. US1 — pricing rules (P1)

**In the back office**: Delivery → Pricing. Set standard delivery:

| Field | Value |
|---|---|
| Base | `6.00` |
| Rounding step | `0.50` |
| Cap | `45.00` |
| Distance bands | 5 km → `+0.00` · 15 km → `+3.00` · 50 km → `+9.00` |
| Weight bands | 2 kg → `+0.00` · 10 kg → `+2.50` |

**Then verify by quoting, not by reading the form:**

- **SC-001** — two addresses at materially different distances, identical basket → the further pays more.
- **SC-002** — same address, one light basket and one heavy → the heavier pays more.
- **SC-003** — every quoted fee ends in `.00` or `.50`, and none is below what the bands produce.
- **SC-010** — quote an order, **then change the rules**, then complete it → it is fulfilled at the fee
  it was quoted. ⚠ This is the one a pricing change could break invisibly.

**Refusal walks** (§A of the contract) — each must be *distinguishably* refused:

```bash
# ⚠ cap below FLOOR: base 6.00 + smallest distance band 0.00 + smallest weight band 0.00 = 6.00; cap 5.00
curl -X PUT .../admin/v1/delivery-pricing/standard -d '{"baseAmount":"6.00","maxAmount":"5.00",...}'
# expect 422 cap_below_floor  — NOT a 200 that silently makes every fee $5.00

# ⚠ cap not a multiple of the step: step 0.50, cap 45.33
curl -X PUT .../admin/v1/delivery-pricing/standard -d '{"roundingStep":"0.50","maxAmount":"45.33",...}'
# expect 422 cap_not_rounded — otherwise min(45.33, roundUp(...)) returns 45.33 and breaks SC-003
# on exactly the most expensive orders, where nobody looks

# ⚠ And confirm a LEGITIMATE binding cap is ACCEPTED: base 6.00, bands to +11.50, cap 12.00.
# If this is refused, the predicate is testing "largest bands" and FR-012's ceiling can never be set.
```

---

## 4. US2 — a shop declares (P1)

**In the shop console** (as a `shop_manager`): Delivery → Same-day.

1. Turn same-day on, set a cutoff, search **"Alfredton"** and add it.
2. ⚠ **Confirm the console tells you it covers 20 Ballarat localities** *before* you save. If it does
   not, the shop is making a broad commitment believing it made a narrow one — 031's disclosure
   obligation, on this surface.
3. Save.

**SC-006 — the whole point of US2**: with the declaration saved and **not yet approved**, put a shopper
in that area through checkout. ⚠ **Same-day must not be offered.** Verify end to end, not by reading the
`status` column.

**FR-020 — two refusals, walked separately:**

1. Clear a shop's `postcode` → the screen says a location is needed; the `PUT` returns
   `422 shop_location_required`.
2. ⚠ Set the postcode to one with **no `postcode_centroid`** → `422 shop_location_unmappable`. This is
   the subtle one: the shop *has* a location, passes the first check, and then every requested area
   reports `straightLineKm: null` at approval — so FR-023's entire purpose evaporates without anything
   reporting a problem. It is 031's live 3001 case (a real postcode with no localities) on a new surface.

**SC-004** — the structural one:

```bash
# With a SHOP token, call the ADMIN pricing route.
curl -H "Authorization: Bearer $SHOP_TOKEN" .../admin/v1/delivery-pricing
# expect 401 — refused at the gateway, by pool, before any handler runs
```

⚠ **Do this with a token, not by looking at the console.** "There is no button" is not the claim; "there
is no route a shop can reach" is.

---

## 5. US3 — an admin approves (P2)

**Back office**: Delivery → Approvals.

- **SC-008 — the case that motivated this feature.** Use the Bendigo shop (postcode 3550) declaring
  **3350 (Ballarat)**. ⚠ The queue must show **≈98 km**, labelled *straight-line*. Decline it on that
  basis, and confirm the shop can read the reason.
- Approve a **3550** declaration (≈2 km) instead.
- **SC-007** — ⚠ after approving, confirm **zero** same-day offers exist for any (shop, area) pair
  without an approval in force. Quote in both directions; do not infer it from the approved case passing.
- **FR-018** — with an approval in force, submit a *changed* declaration from the shop. ⚠ **The approved
  one must keep working** while the new one sits pending. This is the failure a single mutable row would
  have produced silently. Then approve it, and confirm the old row reads **`superseded`**.
- **FR-025** — revoke the approval → same-day stops, and the shop is told ⚠ in wording it can tell apart
  from "your update went live". An admin withdrawing service and a shop's own change being approved both
  end an approval; a shop reading its history needs to know which happened.
- **SC-014** — every decision names a person and a time.

**SC-009 (observer test)** — show a pending declaration to **5 admins** and ask how far the furthest
requested area is from the shop. ⚠ **All 5 must answer correctly.** This measures whether a person
*understood* what they were shown, which is the failure this feature exists to prevent. It is an
operator walk and cannot be marked complete on reasoning.

---

## 6. US4 — the shopper (P2)

- **SC-011** — a basket from **two** shops where only one is approved for same-day → same-day appears on
  exactly **one** package.
- **SC-015** — a shopper served by a shop with no same-day approval still gets **standard**.
- **SC-005** — ⚠ inspect the **raw JSON** of the checkout quote. No `straightLineKm`, no shop id, no
  postcode, no weight. Reading the Go struct is not the check.
- **FR-030** — quote after the cutoff → same-day is withdrawn. ⚠ **In `Australia/Melbourne`**: on a UTC
  container `time.Now()` puts the cutoff 10 or 11 hours out depending on daylight saving, and the fault
  shows only in the evening and only in summer. Walk it at a real Melbourne evening time.
- **FR-030a** — remove an approved area from every delivery zone, then quote. ⚠ Same-day must **stop**.
  An approval is a claim about a shop's reach, not a grant of serviceability, and without this term it
  would outlive the service it depends on.

---

## 7. Machine verification (the agent runs these)

```bash
pnpm -r typecheck                # ⚠ count the reporting packages — 029 had green tests over a failing typecheck
pnpm -r test
turbo build
cd apis/core-api && go build ./... && go vet ./... && go test ./... && gofmt -l .
make lint
pnpm --filter @effy/design-system tokens:check   # ⚠ NOT `pnpm tokens:check` — no such root script
```

⚠ **`go test ./...` must pass with every existing checkout and storefront assertion unmodified —
*except* the same-day eligibility assertions in `delivery_test.go`**, which encode the rule FR-029
deletes and are a **named, expected delta** (R8 lists the exact groups). A change outside that delta
means the design moved, not that the test was wrong. ⚠ A guard stated as "nothing may change" would be
unsatisfiable here, and an unsatisfiable guard gets ignored wholesale.

⚠ **`pnpm -r test` does not run `tsc`** — vitest and typecheck are separate gates, and 029 shipped a
slice where tests were green and typecheck was red. Run both, and check the package count.

---

## 8. What is NOT validated here

- **`customer-web` and both mobile apps** — untouched by design. The quote's shape is unchanged.
- **Road distance** — out of scope; straight-line under-states by ~7% and bands absorb it.
- **Cold-path metrics** — ⚠ no cold-path service on this platform emits one. Recorded as an exception in
  plan.md § Complexity Tracking; a carry-forward with an owner, not a gap introduced here.
- **Road distance** — the fee leaks a *coarse* distance by construction (FR-033a). What is verified is
  that it never resolves to a **shop**, not that it reveals nothing at all.
