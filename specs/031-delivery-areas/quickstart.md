# Quickstart: Delivery Areas (031)

How to bring this feature up and the walks that decide whether it works. **[operator]** marks a step
you run — Claude authors, you run anything touching a database or live AWS.

---

## §0 — Prerequisites

| Need | Check |
|---|---|
| Dev DB reachable | `make db-status ENV=dev` |
| **030's locality data loaded** | `SELECT count(*) FROM public.locality;` → **15,414** |
| Back-office signed in | an `admin` or `manager` account (mutations need one) |
| Delivery data present | 2 zones, 4 postcodes, 3 offerings — ⚠ and the live defect below |

### ⚠ Confirm the defect BEFORE you start

This feature exists to make this state visible. **See it first, so you can tell whether the feature
actually found it.**

```sql
SELECT dz.code AS destination, count(o.id) AS active_offerings
FROM public.delivery_zone dz
LEFT JOIN public.delivery_offering o
       ON o.destination_zone_id = dz.id AND o.status = 'active'
GROUP BY dz.code ORDER BY dz.code;
```

**Expected today**: `MEL-METRO → 3`, **`REGIONAL → 0`**.

`REGIONAL` holds **3350 (Ballarat)** and **3550 (Bendigo)**. So the storefront tells those shoppers
"we deliver here" and checkout cannot quote them a single option. Confirm it end to end:

```bash
make core-run   # separate shell
curl -s 'localhost:8080/v1/storefront/serviceability?postcode=3350' | jq
# → {"postcode":"3350","serviced":true}   ⚠ and yet no delivery option exists
```

---

## §1 — The migration **[operator]**

```bash
# Commit the migration first — the 003 commit-guard requires it.
git add db/migrations/<timestamp>_delivery_area_decisions.sql
git commit -m "feat(031): delivery area decision record"
make db-up ENV=dev
```

Schema only, one new table, **no existing table altered** — additive and reversible in dev.

---

## §2 — Deploy the admin service **[operator]**

```bash
make edge-deploy SERVICE=admin ENV=dev
```

⚠ **Six** new routes join the ten the delivery slice already has — ⚠ including `/delivery-localities/coverage`, which is the data behind the FR-006 disclosure and the easiest to forget. Confirm they exist before walking the
console — a 404 here reads in the UI as an empty screen, which looks like "no problems found".

---

## §3 — The endpoints

```bash
# Places an operator could mean — the same shape the shopper's search returns
curl -s "$API/admin/v1/delivery-localities?q=ballarat" -H "Authorization: Bearer $TOKEN" | jq

# ⚠ THE DISCLOSURE DATA (FR-006). 3350 must report 20 places; 3550 must report 12.
curl -s "$API/admin/v1/delivery-localities/coverage?postcode=3350" -H "Authorization: Bearer $TOKEN" | jq '.count'

# ⚠ THE ACCEPTANCE TEST FOR THIS FEATURE — must list 3350 and 3550 as unconfigured, TODAY.
curl -s "$API/admin/v1/delivery-health" -H "Authorization: Bearer $TOKEN" | jq
```

⚠ **If `/delivery-health` returns empty on day one, it is not working** — it is looking in the wrong
place. An endpoint that finds nothing has not been proven to find anything.

---

## §4 — The walks

Nine walks. **Three cannot be machine-checked** (W2, W5, W6) — each measures whether an operator
*understood* what they did, which is the failure this feature exists to prevent.

### W1 — Compose a zone from real places *(SC-001)*

Open a zone → **Add areas** → search "ballarat" → pick a place → save.

**Pass**: a complete zone composed **without typing a single postcode**.

### W2 — ⚠ The disclosure *(SC-003 — 5 admins, observer test)*

⚠ **If five admins are not available** — and on a small team they may not be — walk it with as many as
there are and **record the number**. A 2-of-2 result is a real signal; a 5-of-5 claim from two people is
not. ⚠ 028's identical five-tester criterion was never walked at all, which is the outcome this note
exists to avoid.

Have an admin add **Alfredton** (3350). Before they confirm, stop and ask:
**"How many places did you just make serviceable?"**

**Pass**: they say **twenty**, not one.

⚠ **This is the walk that matters most.** If they say "one", the disclosure is technically present and
functionally absent, and the feature has not worked. Do not accept "well, it's on the screen".

Then have them **remove** it and ask the same question — removal is the more dangerous direction
because it silently stops serving customers who were being served.

### W3 — The 3001 path *(SC-002)*

Try to add postcode **3001** directly through the escape hatch.

**Pass**: an explicit warning that it matches no known delivery destination, and it is **not** accepted
until deliberately confirmed. ⚠ Not silently accepted (today's behaviour) and not hard-blocked.

### W4 — Configure an area *(SC-004, SC-005)*

Pick 3350 → set standard on with a fee and lead time → save. Then open it again.

**Pass**: everything the area gets is on **one screen**, statable in under 30 seconds.

⚠ **Then check the disclosure one level up**: configuring 3350 also configures 3550, because
`delivery_offering` is keyed on zone. The editor must say so (`data-model.md` §consequence 2).

### W5 — ⚠ Not-served vs unconfigured *(SC-006 — 5 admins, observer test)*

Mark one area **not served** with a note. Leave another **unconfigured**. Show both, and ask an admin
which is which.

**Pass**: 5 of 5 tell them apart, and can say who decided the first one and when.

⚠ These are the two meanings that were fused into one absent row. If the UI fuses them again, the
migration bought nothing.

### W6 — ⚠ Same-day is not a blind toggle *(SC-007 — observer test)*

Enable same-day for an area with **no shop in its zone**.

**Pass**: the shops and their locations are shown, and the admin must **acknowledge** before it takes
effect. Afterwards, the acknowledgement and who made it are still visible.

⚠ Attempt it via `curl` without the acknowledgement flag — **must be `422`**. A UI-only guard is not a
guard.

### W7 — Health finds all three *(SC-008, SC-009)*

Introduce each defect deliberately: an unknown postcode, an unconfigured area, an empty zone.

**Pass**: each is surfaced within one screen of where an admin would look. Then fix them all —
**Pass**: a correctly configured zone raises **zero** warnings. ⚠ An indicator that is always lit tells
an operator nothing.

### W8 — ⚠ The shopper is untouched *(SC-010, SC-011, SC-012)*

Before and after, for an **unchanged** configuration:

```bash
curl -s 'localhost:8080/v1/storefront/serviceability?postcode=3000' | jq   # identical
```

Then place a quote, change the area's fee, and complete the order.
**Pass**: the order is fulfilled at the **quoted** fee (FR-014).

Then quote from two different shops for the same area.
**Pass**: the **same fee** both times (SC-011).

### W9 — ⚠ Close the loop that started this *(SC-014)*

Configure `REGIONAL` properly. Then:

```bash
curl -s "$API/admin/v1/delivery-health" -H "Authorization: Bearer $TOKEN" | jq '.unconfigured'   # → []
curl -s 'localhost:8080/v1/storefront/serviceability?postcode=3350' | jq                          # → serviced true
```

…and complete a real checkout to a Ballarat address.

**Pass**: a Ballarat shopper is told yes **and can actually order**. That is the whole feature in one
walk, and it is the thing that was broken when this slice started.

---

## §5 — The machine sweep

```bash
pnpm -r typecheck          # ⚠ vitest does NOT run tsc — count the reporting packages
pnpm -r test
turbo build

# ⚠ THE FR-028 GUARD — these must pass with ZERO edits to core-api
cd apis/core-api && go build ./... && go vet ./... && go test ./... && gofmt -l .
```

⚠ **If a core-api test needed changing, the design breached FR-028.** It is not a test that needed
updating — it is the guard reporting that this feature leaked into the shopper's experience. Stop and
redesign rather than editing the assertion.

---

## §6 — Sign-off

State plainly:

- Which walks ran, and **who** the five admins were for W2 and W5.
- ⚠ Whether `/delivery-health` **found 3350 and 3550 before** they were fixed. If it was only ever run
  against a clean configuration, it has not been proven.
- Whether core-api's suites passed **unmodified**.
- Whether the `422` same-day guard was tested by `curl`, not only through the UI.
- ⚠ **How many admins actually walked W2 and W5**, by name. Not "5 of 5" unless there were five.
- The state of `REGIONAL` at sign-off — configured, deliberately not served, or still broken.
