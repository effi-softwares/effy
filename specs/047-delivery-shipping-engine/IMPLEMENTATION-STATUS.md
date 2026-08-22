# 047 Delivery — implementation status (this session)

**51 / 57 tasks complete, machine-verified.** All five user stories are built and green on every surface
that could be built and tested in this environment.

## Done & verified
- **Migration** applied to dev + `net_weight` backfill confirmed by operator (T007/T012).
- **Hot path (Go)**: the pure fee engine (snap-up/floor/cap/a≥b, 11 invariant tests); serviceability +
  locality reads; the full quote (standard + same-day + per-shop exceptions) with capture into
  intent/finalize; the loader command; metrics (serviceability + quote-outcome + the served-zone-unpriced
  invariant alarm); the Go half of the wire contract. Go: 14 pkgs, 0 fails.
- **Cold path (edge-admin)**: zones (compose-by-place with FR-008/009/010 disclosure + refusals), rings +
  Haversine suggestion, fee plans + the activation completeness gate (SC-016), collection runs, per-shop
  same-day exceptions, settings; config-contract test. 191 tests.
- **edge-shop**: product weight (measured/assumed) + the delivery-config isolation guard (SC-008/009). 172 tests.
- **Back-office console**: Delivery section — Zones / Rings / Fee plans / Same-day (schedule + exceptions) /
  Settings. 79 tests, builds.
- **customer-web**: serviceability + delivery fee + same-day choice at checkout, not-serviceable refusal. 366 tests.
- No-PII sweep clean; customer-web bundle within 174 KB; parity registers updated.

## Remaining (blocked on environments not available this session)
- **T009 / T029 / T031 / T039 (mobile half)** — customer-mobile serviceability + fee + same-day, and the
  Kotlin half of the Go↔Kotlin wire test. Need the **KMP Gradle toolchain**. The Go wire half is green and
  pins the exact JSON, so the Kotlin literals can be matched byte-for-byte when built. (T039's web half is done.)
- **T055** — Playwright storefront path. Needs a **live core-api** + seeded catalogue.
- **T057** — OPERATOR: `make edge-deploy SERVICE=admin ENV=dev` (+ `SERVICE=shop`) and the live SC walk.

Nothing is committed (operator does that).
