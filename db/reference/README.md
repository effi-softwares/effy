# `db/reference/` — Australian locality reference data

Feature **030-delivery-location-suburb**. This is what lets a shopper name where they live by
**suburb** instead of by a postcode they have to already know.

| File | What it is |
|---|---|
| `au-localities.csv` | The committed dataset: `locality,state,postcode`, **15,414 rows** (G-NAF MAY 2026). Loaded into `public.locality` by `make load-localities ENV=dev`. |
| `derive-localities.mjs` | Produces the CSV above from a G-NAF download. |

---

## Attribution — REQUIRED, not optional

> Incorporates or developed using **G-NAF ©** [Geoscape Australia](https://geoscape.com.au) licensed by
> the Commonwealth of Australia under the
> [Open Geo-coded National Address File (G-NAF) End User Licence Agreement](https://data.gov.au/dataset/ds-dga-19432f89-dc3a-4ef3-b943-5326ef1dbecc/details).

**Source**: Geoscape Geocoded National Address File (G-NAF), via
[data.gov.au](https://data.gov.au/data/dataset/geocoded-national-address-file-g-naf)
**Licence**: Creative Commons Attribution 4.0 International (CC BY 4.0), as tagged by data.gov.au
**Release**: G-NAF **MAY 2026**
**Retrieved**: 2026-08-01
**Rows**: **15,414** distinct `(locality, state, postcode)` triples, derived from **16,905,824** address records

⚠ **CC BY 4.0 requires attribution to be preserved.** The block above is the attribution. Do not remove
it, and do not remove this file, when the dataset is refreshed.

⚠ **G-NAF also ships an End User Licence Agreement and an "Open G-NAF Use Restriction" fact sheet**
alongside the CC BY tag. Both are in the data.gov.au package. They were read and accepted by the
operator on **2026-08-01** (specs/030 T002a). Re-read them on any future release that changes terms.

---

## Refreshing the data

The 1.7 GB G-NAF download is **not committed** — only the derived triples are. That is deliberate: it
keeps this a small reference file rather than a copy of every address in Australia.

```bash
# 1. Download + unzip G-NAF from data.gov.au (the Standard distribution, either GDA94 or GDA2020 —
#    this script reads only names, states and postcodes, so the datum makes no difference).
# 2. Derive:
make derive-localities GNAF=~/Downloads/G-NAF_MAY26

# 3. Review the diff, then load:
make load-localities ENV=dev
```

`load-localities` is idempotent — it upserts on `(name, state, postcode)`, so re-running it is safe and
re-running it is exactly what a refresh is.

⚠ Refreshing the data does **not** need a migration. The schema is a migration
(`20260801122324_locality.sql`, forward-only); the rows are reference data on an operations cadence.
Shipping ~17k `INSERT`s in a migration would mean a new ~2 MB forward-only file on every refresh,
forever. See `specs/030-delivery-location-suburb/research.md` R2.

---

## What the derivation guarantees

`derive-localities.mjs` **refuses rather than repairs**, matching the Go loader
(`apis/core-api/internal/platform/localityload`) and 029's image conformance check before it. It writes
nothing at all unless every one of these holds:

- **Leading-zero postcodes survived.** ⚠ NT postcodes begin `08xx`. If any step in the chain read the
  column as a number, `0800` became `800` and the entire Northern Territory would be unreachable by
  name. Zero leading-zero postcodes → refuses to write.
- **All 8 states and territories are present.**
- **The row count is between 10k and 40k** — outside that, the G-NAF layout was not what it expected.
- **Every postcode is exactly four digits, as text.** Anything else is dropped and counted, never
  padded — padding would repair the symptom and hide that the data was already corrupt.
- **Retired addresses and retired localities are skipped**, so a withdrawn address cannot keep a
  postcode alive for a locality that no longer uses it.
- **Only residential locality classes are kept** — G (gazetted), I (Indigenous), U (unofficial but in
  real use). Excluded: T (topographic features), D (districts), H (SA cadastral "hundreds"). None of
  those is an answer to "where do you want this delivered?".
- ⚠ **`OT` (Other Territories) is excluded** — Christmas Island, Cocos, Jervis Bay, Norfolk Island.
  `public.locality.state` permits exactly eight codes, and adding a ninth for territories Effy does not
  serve would be schema churn. If that changes, this is the line to revisit; SC-002's coverage query is
  what would catch the omission.
- ⚠ **File patterns are anchored to the whole basename.** `{ST}_LOCALITY_psv.psv` — **not** a loose
  `_LOCALITY_psv.psv` suffix match, which also matches `{ST}_STREET_LOCALITY_psv.psv`, a different
  table holding STREET names. The loose form would have loaded thousands of street names into the
  suburb list silently. It was caught only by running against the real download.

Output is **deterministic**: sorted, LF-terminated, no timestamp inside the file. Running it twice on
the same G-NAF release produces a byte-identical CSV, so `git diff` shows real changes and nothing
else — the same discipline as `packages/brand`'s generators.

**Proven against the real G-NAF MAY 2026 download (2026-08-01)**: 16,905,824 addresses streamed in
~44 s → **15,414 triples** across 8 states, **299 leading-zero postcodes** preserved, `OT` excluded,
144 non-residential locality classes excluded, 36 addresses in unknown localities dropped. Two
consecutive runs are **byte-identical** (`34ec3bfa…`), and the Go loader parses the result end to end.
Separately proven on a synthetic fixture: the leading-zero guard **fires and exits non-zero** when
zeros are stripped upstream, leaving any previously good CSV untouched.

⚠ **Sanity anchors in the output**, all of which are the reason the natural key is the triple:
`Richmond` exists in **6** (state, postcode) combinations; `Springfield` in **9**; `Melbourne` spans
**3000 and 3004**; postcode **0872** legitimately appears in NT, SA **and** WA — it is the remote-
Australia code that crosses three borders.

---

## Why the postcode is on the address, not the locality

G-NAF keeps `POSTCODE` on `ADDRESS_DETAIL` and the name on `LOCALITY`. That is not an accident of
schema — it is the fact this whole feature is shaped around: **a locality can span several postcodes,
and a postcode can cover several localities.** Neither identifies a place on its own, which is why
`public.locality`'s natural key is the triple and why a shopper is never offered a bare suburb name to
select (FR-008).

---

## Coordinates (added by 032)

`au-localities.csv` now carries **`latitude,longitude`** alongside `locality,state,postcode`, derived
from G-NAF's `{ST}_LOCALITY_POINT_psv.psv` — the same download, the same licence.

⚠ **030 discarded these columns**, and 031 then reasoned from "the platform has no distance
capability" — a premise that was false when it was written, and which let same-day delivery be enabled
across 98 km. If you are regenerating this file, the coordinates are not optional extras: without them
every postcode prices at the furthest delivery band and no same-day approval can show a distance.

- **Empty means unknown, never `0,0`.** G-NAF has no point for a few localities. A zero is a place in
  the Gulf of Guinea; an empty cell is an honest absence, and the loader and the pricing core both
  handle it explicitly.
- A postcode's location is the **mean of its localities' points**, computed at load time into
  `public.postcode_centroid`.
- The derivation refuses to write a file where fewer than 90% of rows have a coordinate — a silent
  join failure would otherwise produce a well-formed CSV that breaks delivery pricing nationwide.

Unit tests: `make reference-test` (no download required).

## ⚠ Attribution is a licence condition, not a courtesy

G-NAF is published under **CC BY 4.0**, which **requires** attribution. The statement above must not
be removed, and it must survive any regeneration of this file.
