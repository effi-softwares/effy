# 047 Delivery — implementation status

**56 / 57 tasks complete and machine-verified.** All five user stories are built on every surface —
backend (hot + cold path), back-office console, customer-web, and customer-mobile. The only remaining
task is the operator deploy + live walk (T057), which by the platform's mode of work only the operator
runs (it touches live AWS).

## Verified this session
- **Migration** applied to dev + `net_weight` backfill confirmed (T007/T012); realistic dev data seeded
  (`db/seeds/047_delivery_dev.sql`): 4 rings, 9 Melbourne zones, an active fee plan, hub + 2 collection runs.
- **Hot path (Go)** — the pure fee engine (snap-up/floor/cap/a≥b, 11 invariant tests); serviceability +
  locality reads; the full quote (standard + **same-day** + **per-shop exceptions**, SC-011) with capture
  into intent/finalize; the loader; metrics (serviceability + quote outcome + the served-zone-unpriced
  **invariant alarm**); the Go↔Kotlin wire contract (Go half). **14 pkgs, 0 fails.**
- **Cold path (edge-admin)** — zones (compose-by-place with the FR-008/009/010 disclosure + refusals),
  rings + Haversine suggestion, fee plans + the activation completeness gate (SC-016), collection runs,
  per-shop same-day exceptions, settings; config-contract test. **191 tests.**
- **edge-shop** — product weight (measured/assumed) + the delivery-config isolation guard (SC-008/009).
  **172 tests.**
- **Back-office console** — Delivery section: Zones / Rings / Fee plans / Same-day (schedule + exceptions)
  / Settings. **79 tests**, builds.
- **customer-web** — serviceability + delivery fee + same-day choice at checkout; not-serviceable refusal.
  **366 tests**, bundle within 174 KB.
- **customer-mobile** — generated Kotlin delivery DTOs (T009); the Go↔Kotlin wire-contract test (T029,
  green); serviceability + fee + same-day choice in the checkout flow, Clean-Arch/MVVM (T031/T039).
  **Android 272 tests, 0 fails; iOS test target compiles; cm-guard clean.**
- No-PII sweep clean; parity registers + operator guide (`docs/delivery-console-guide.md`) updated.

## Remaining
- **T057 — OPERATOR.** Deploy the delivery services and walk the live SC table:
  `make edge-deploy SERVICE=admin ENV=dev` · `make edge-deploy SERVICE=shop ENV=dev` ·
  `make core-image-push TAG=delivery-047 ENV=dev` + `make core-deploy TAG=delivery-047 ENV=dev` ·
  push `dev` for customer-web (Amplify) · then quickstart §2–§7 (SC-001…SC-017) + the no-leak sweep.
  See `docs/delivery-console-guide.md` and the deploy runbook.
- **T055** (Playwright) is authored + skip-guarded (`apps/customer-web/e2e/delivery.spec.ts`); it runs as
  part of that operator walk against a live core-api + signed-in session (the checkout is auth-gated).

Nothing is committed (operator does that).
