# Sign-off record — 056-driver-management

**Status**: 🚧 **CODE-COMPLETE AND MACHINE-VERIFIED. NOT DEPLOYED, NOT COMMITTED, NOT WALKED BY A PERSON.**
**Date**: 2026-08-30

---

## What was built

The back-office driver console that 049 deferred in writing: *"a full driver-management console is out
of scope for this slice unless folded in during planning."*

- **One new cold-path service**, `apis/edge-api/fleet` (`effy-edge-fleet`), 18 routes behind the
  **existing** back-office authorizer. The five 049 routes **moved** here; the admin copy is deleted.
- **One migration**, `20260830055348_driver_management.sql` — alters three tables, **creates none**.
- **One console feature slice**, `apps/back-office/src/features/drivers` — a register, a profile, a duty
  panel, a stranded-work panel, an exceptions queue, a work history with proof, and a readiness view.
- **The driver mobile app is untouched**, except for one type widening and one defect fix (below).

## ⚠ Defects found and fixed

### Mine, caught by a test I wrote to catch it

1. **The concurrency token would have made every profile edit fail.** `updated_at` came back as a JS
   `Date`, and `toISOString()` truncates to **milliseconds** while PostgreSQL stores **microseconds** —
   so `WHERE updated_at = $2` never matched its own row. Every save would have reported *"changed by
   someone else"*, and **no profile edit could ever have succeeded**. Invisible to `tsc` (both sides are
   strings) and invisible to the mocked unit tests (they mock the repository). Caught by the container
   test on its first run. Now `to_char(… AT TIME ZONE 'UTC', '…US"Z"')`.
2. **Two wrong column names**, each of which typechecks perfectly and fails only at runtime:
   `public."order".reference` (it is `order_number`) and `public.customer_address.suburb` (it is
   `city`). Caught by writing the container schema from the real migrations.
3. **A duplicated field error** — `name` was validated twice on create, so the form would have printed
   the same sentence twice under one box. Caught by an assertion on the field list.
4. **The PII guard did not catch the leak I injected to prove it.** It matched only the shorthand
   `{ driver }` and my injected leak was `{ driver: row }`. The guard now covers shorthand, explicit
   and spread forms, and is proven against all three. ⚠ **A guard nobody tries to defeat is
   decoration** — this one was decoration for about ten minutes.

### Pre-existing, found while building

5. **⚠ THE DRIVER ACCESS GATE WAS A NEGATIVE TEST, AND WIDENING THE ENUM WOULD HAVE BROKEN IT.**
   `requireDriver` read `if (record.status === "disabled")`. The moment 056 widened the employment enum
   to three values, a **suspended driver satisfied its negation and was handed a working session** —
   stood down in the console, still able to sign in and be assigned work. Nothing would have failed.
   This is 055's lesson recurring on the very next slice: 053's account-closure blocker was
   `<> 'delivered'` and two new terminal states walked through it. Now `!== "active"`, with the test
   parameterised over every non-active state so a fourth status forces a decision.
6. **Driver management wrote no audit row at all** — the only privileged back-office domain that did
   not. Shops, promotions and catalog schema all do.
7. **`ensureDriverUser` re-enabled a disabled Cognito account** and `insertDriver` upserted on conflict.
   Together: creating a "new" driver with the work email of someone **deliberately stood down** silently
   adopted their record, overwrote their name/zone/vehicle, brought their sign-in back to life, and
   **reported success**. Both halves now refuse, and the refusal names them.
8. **A profile field could never be cleared.** `COALESCE($n, col)` cannot distinguish "leave alone" from
   "clear", so a zone once assigned was permanent.
9. **The register had no search, no filter, no paging** — `ORDER BY d.name ASC`, the whole table, always.
10. **`delivery_failure` and `collection_task_issue` had no reader anywhere.** Both are annotated
    "recorded for back-office follow-up"; the driver service was the only code that touched either and
    it only INSERTed.
11. **Standing a driver down can strand physical goods, permanently and invisibly.** Not previously in
    any register. `releaseIneligibleWork` correctly never yanks picked-up work — but the UNIQUE
    constraint then keeps those packages claimed and the sweep skips them forever, with an order
    attached to each.
12. **049's drivers slice carried its own copy of the back-office authz** that 053 had already promoted
    into `@effy/edge-shared`. Deleted rather than moved (Principle II).

## Verification

| Gate | Result |
|---|---|
| `pnpm -r typecheck` | **19/19 packages** |
| `pnpm -r test` | **1,908 passed**, 20 reporting packages, zero failures |
| `CONTAINER_TESTS=1 pnpm -r test` | **2,024 passed** — every container suite on the platform, Docker up |
| `edge-fleet` | **91 tests** — 62 unit + **29 container-backed against real PostgreSQL 16** |
| `edge-driver` | **10** (baseline was 10; the status widening broke nothing) |
| `edge-admin` | **191 passed UNMODIFIED** — the proof the extraction changed no other behaviour |
| `back-office` | **190** (30 files) |
| Go build / vet / gofmt | clean (untouched by this slice; confirmed no collateral) |
| `tokens:check` | **unchanged** — 10 generated files match; this slice adds no design token |
| `brand-check` | 57 assets OK |
| `mobile-assets:check` | 84 copies match across 3 apps |
| CloudFormation headroom | `effy-edge-admin` **77 → 72 handlers** (~25 resources reclaimed — the first time that stack has gone *down*) |

### Seven things proven by breaking them

1. Restore the negative status test → a **suspended driver gets a session**; 1 test red.
2. Remove one route's authorizer → the config contract names **`readinessV1` must be authenticated**.
3. Restore `COALESCE` → the clearing proof goes red.
4. Mint the cursor from a different column than the `ORDER BY` (053's exact defect) → the
   duplicate-name paging proof goes red.
5. Reintroduce `e instanceof Error` (053's exact defect) → **7 refusals** collapse to the generic
   sentence.
6. Reach for a `Card` and an `amber` hue → the design guard fails and **names the file**.
7. Log `{ driver: row }`, `{ driver }`, `{ ...row }` → all three caught (after the guard was fixed
   because the first shape was **not**).

## ⚠ Not verified

- **Nobody has looked at any screen.** 039 shipped **four live defects with a fully green suite** —
  layout, contrast and hierarchy are not properties a DOM assertion can see.
- **Nothing is deployed.** No route has ever answered a real request.
- **The held-work → stranded → release loop has never run against real packages.** It is proven
  container-backed against real PostgreSQL, which is not the same as a real driver with a real van.
- **The presigned proof URL has never expired in a browser.** SC-012's first half is untested live.

## ⚠ One flaky result, recorded rather than buried

`apis/edge-api/orders` failed **1 of 54** on one full-workspace run with `CONTAINER_TESTS=1`, and passed
54/54 both in isolation and on a repeat of the same full run. The suite spins up its own PostgreSQL
container; under the load of every package's containers starting at once it can exceed its startup
budget. **Not caused by this slice** — 056 touches no file in `edge-api/orders` — but it is a real
source of noise in that sweep, and an intermittent red that gets waved away is how a genuine regression
eventually gets waved away too. Worth a longer container timeout in that suite.

## ⚠ Pre-existing, verified NOT caused by this slice

- `make check-no-phantm` fails on prose in specs **042 / 045 / 050**. Confirmed: **056 contributes zero
  hits** (`grep` for 056 paths in the failure output returns 0). CLAUDE.md already records this.

## Open operator items (14)

1. **Baseline first** — record `pnpm -r typecheck` / `pnpm -r test` counts and `edge-driver`'s container
   result *before* the migration. An unrecorded baseline makes a real regression look pre-existing.
2. **Commit** — spec, plan, tasks, migration, service, console. ⚠ The 003 commit-guard requires the
   migration committed before `db-up`.
3. `make db-up ENV=dev`, then verify: no `disabled` remains, ten new columns, the three-value CHECK,
   resolution columns + partial indexes on both exception tables.
4. `make edge-deploy SERVICE=fleet ENV=dev` — ⚠ **BEFORE admin**, or there is a window in which driver
   management answers nothing at all.
5. `make edge-deploy SERVICE=admin ENV=dev` (removes the five old routes).
6. `make edge-deploy SERVICE=driver ENV=dev` (the status union + the access-gate fix).
7. ⚠ **NO `make apply` — and my own quickstart said otherwise until this was checked.** This slice
   touches **zero Terraform files** (`git status` on `*.tf` / `infra/` is empty). The IAM statements and
   the alarm live in the fleet service's own `serverless.yml`, so `edge-deploy` creates them; and every
   SSM parameter the service reads already exists (all seven verified live against `/effy/dev/*`).
   Running `make apply` here would at best be a no-op and at worst apply unrelated drift someone else
   left in the working tree.
8. Confirm the old routes are gone: `GET /admin/v1/drivers` → **404**; `GET /fleet/healthz` → **200**;
   `GET /fleet/v1/drivers` with no token → **401**.
9. quickstart §4 — US1, **SC-001 timed** and the **SC-010 clearing proof on every optional field**.
10. quickstart §5 — US2, **SC-005** (create with an in-use email, then confirm the existing driver is
    byte-identical) and **SC-004** (revocation effective within 60 s).
11. ⚠ **quickstart §6 — THE MOST IMPORTANT WALK IN THIS FEATURE.** Collect a real package, try to
    suspend the driver, confirm the warning itemises the held work, confirm, find it under stranded,
    release it, and confirm the next sweep gives it to someone else.
12. quickstart §7 — US3, with **SC-003 measured by SQL count** against the console total, not
    spot-checked.
13. quickstart §8–§10 — US4/US5/US6, including the "nobody on duty, work waiting" statement and
    **SC-012 both halves** (the URL expires; issuing it wrote an audit row).
14. ⚠ **quickstart §12 — look at it.** Every screen, light and dark, narrow width.

## Boundary — what this slice does NOT close

**Failed-delivery visibility is closed for Effy, NOT for the shopper.** `shop_fulfillment` still stays
`collected` after a failed drop; there is **no customer notification**, **no re-attempt scheduling** and
**no customer-facing state**. A shopper still sees "on the way" until a person acts. 056 makes a person
*able* to act; deciding what the shopper is told is its own slice, which this one unblocks.

Also deliberately absent: manual dispatch (049's no-dispatcher model stands, asserted over the whole
route table), rostering, payroll, licence document images, live driver tracking, driver self-service,
multi-hub, and any change to the driver mobile app beyond the two fixes above.
