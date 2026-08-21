# Contract: The Fee Engine (pure)

`apis/core-api/internal/platform/delivery/engine.go` — the **one and only** place a customer delivery
fee is computed. Pure: no I/O, no clock, no DB. Table-tested (`engine_test.go`). The admin console never
reimplements this; it only validates a plan's completeness.

## Inputs

- `method` ∈ `{same_day, standard}`
- `ringPrice` — cents; the active plan's `delivery_ring_price` for the destination zone's ring
- `packageGrams` — int > 0 (sum of item `weight_grams`)
- `weightBands` — the active plan's `delivery_weight_band` rows: `[(upperGrams, addAmount)]`, ascending
- `factor` — `same_day_factor` or `standard_factor` (`>0`, same_day ≥ standard)
- `step`, `floor`, `cap` — the active plan's rounding step, floor, cap (cap & floor are multiples of step)

## Formula

```
weightAdd = addAmount of the smallest band whose upperGrams >= packageGrams;
            if packageGrams exceeds every band, use the LAST (largest-upper) band     // FR-028
raw       = factor * (ringPrice + weightAdd)
fee       = min( cap, max( floor, roundUpToStep(raw, step) ) )                          // FR-024/026/027
```

`roundUpToStep(x, step) = ceil(x / step) * step` computed in integer cents (no float).

## Invariants (asserted in `engine_test.go`)

1. **Every output is a multiple of `step`** — including when `cap` or `floor` binds (they are multiples). *(SC-005)*
2. **`fee ≥ floor` always** — never free, never below cost. *(FR-026)*
3. **`fee ≤ cap` always** — never absurd. *(FR-027)*
4. **`fee ≥ roundUp(rawUnclamped)` is false only when capped; never `< raw`'s rounded value otherwise** — never rounds down. *(FR-024)*
5. **Monotonic**: heavier `packageGrams` ⇒ `fee` non-decreasing; farther ring (larger `ringPrice`) ⇒ non-decreasing. *(SC-003/004)*
6. **same_day ≥ standard** for identical `(ringPrice, packageGrams)` when `same_day_factor ≥ standard_factor`. *(FR-022)*
7. **A weight above the top band is priced at the top band**, never zero, never error. *(FR-028)*
8. **Deterministic** — same inputs, same output (no clock, no randomness).

## Worked examples (fixtures)

Plan: `step=0.50`, `floor=4.00`, `cap=40.00`, `standard_factor=1.0`, `same_day_factor=1.8`.
Rings: `INNER=6.00`, `OUTER=12.00`. Weight bands: `≤2000g +0.00`, `≤5000g +2.00`, `≤10000g +5.50`.

| method | ring | grams | ringPrice+weightAdd | ×factor | roundUp .50 | clamp[4,40] | fee |
|---|---|---|---|---|---|---|---|
| standard | INNER | 1500 | 6.00 | 6.00 | 6.00 | 6.00 | **$6.00** |
| standard | OUTER | 7000 | 12.00+5.50=17.50 | 17.50 | 17.50 | 17.50 | **$17.50** |
| same_day | INNER | 1500 | 6.00 | 10.80 | 11.00 | 11.00 | **$11.00** (≥ standard $6) |
| same_day | OUTER | 30000 | 12.00+5.50=17.50 (top band) | 31.50 | 31.50 | 31.50 | **$31.50** |
| standard | INNER | 100 | 6.00 | 6.00 | 6.00 | 6.00 | **$6.00** |
| same_day | OUTER | 50000 | 17.50 | 31.50→ but suppose factor 2.4 → 42.00 | 42.00 | **cap 40.00** | **$40.00** (still a .00 multiple) |

The last row is the SC-005 capped case: the cap is a multiple of the step, so the capped fee is still clean.
