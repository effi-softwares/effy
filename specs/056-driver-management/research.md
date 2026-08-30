# Phase 0 — Research: Back-Office Driver Management

**Feature**: 056-driver-management · **Date**: 2026-08-30 · **Spec**: [spec.md](./spec.md)

Every decision below was settled by reading the code, not by recall. Where a claim is measurable, the
measurement is included so a reviewer can reproduce it.

---

## R1 — Where the routes live: a NEW cold-path service, `apis/edge-api/fleet`

**Decision**: create `apis/edge-api/fleet` (`service: effy-edge-fleet`), attaching to the shared HTTP
gateway behind the **existing back-office authorizer**. Path scheme `/fleet/v1/...`, matching the
platform's `/<service>/v1/...` convention.

**Rationale — a measured constraint, not a preference.**

```
$ grep -c "^    handler:" apis/edge-api/admin/serverless.yml   → 77
$ grep -c "httpApi:"      apis/edge-api/admin/serverless.yml   → 76
```

`effy-edge-admin` declares **77 functions / 76 routes** and is recorded at **434 of CloudFormation's
hard 500-resource limit**, with `versionFunctions: false` **already spent** (its own header comment
records that the driver-management routes are what tipped it to 511 in the first place, and that
turning versions off was the recovery). This feature adds ~18 routes; at the ~5 resources per function
that stack averages, that is ~90 resources — it does not fit, and there is no lever left to reclaim.

053 (`edge-api/orders`) and 054 (`edge-api/inventory`) each hit this wall and each made the same call.
This is the third application of a settled pattern, not a new one.

**Why `fleet` and not `drivers`**: the service carries duty, runs, exceptions, stranded work and
coverage as well as the driver record. Naming it for the record would misdescribe two-thirds of it.

**The five existing routes move.** `apis/edge-api/admin/src/drivers/` (5 functions) is **relocated**
into the new service rather than left behind, so there is exactly one driver-management implementation.
This reclaims ~25 resources from `effy-edge-admin` as a side effect, which is the opposite of the usual
direction and worth banking.

**Alternatives rejected**:
- *Add to `edge-api/admin`* — cannot fit; measured above.
- *Add to `edge-api/driver`* — that service carries the **driver** authorizer. Putting back-office
  routes there means two audiences' authorizers in one service. API Gateway authorizers are per-route
  so it would be structurally sound (054 did exactly this for shop + back-office), but the failure mode
  is asymmetric: a mis-wired route in the *driver* service hands a **driver** the ability to edit driver
  records — including their own employment status. A separate service makes that mistake unreachable.
- *Split reads and writes across two services* — two deployment units for one domain, for nothing.

---

## R2 — Employment status: widen 2 → 3, and name the states positively

**Decision**: `public.driver.status` moves from `('active','disabled')` to
`('active','suspended','offboarded')`. `disabled` maps to `offboarded`. Add `status_reason text` and
`status_changed_at timestamptz`.

**Rationale**: FR-015 needs "back next week" and "no longer employed" to be different facts — the
register is unusable for either if they are the same value. `public.shop` already models exactly this
three-state lifecycle (009), so this is consistency, not invention.

**The migration is safe because every reader tests the POSITIVE state.** Measured:

```
apis/edge-api/driver/src/assignment/repository.ts:17,38,153,170   d.status = 'active'
apis/edge-api/driver/src/delivery/assignment.ts:17                d.status = 'active'
```

Six sites, all `= 'active'`. None tests `<> 'disabled'`, so none silently admits a new state. ⚠ This is
the **055 lesson applied on purpose**: 053's account-closure blocker was written as `<> 'delivered'`
and two new terminal states walked straight through it. A negative test against a widening enum is a
latent defect; these are positive and stay correct. **A test will pin this** rather than a comment
(`TestNewStatusesAreNotEligibleForWork`), because "all six happen to be positive today" is not a
property that survives the next edit.

One type widening is required: `apis/edge-api/driver/src/driver/repository.ts:22` declares
`status: "active" | "disabled"` — the driver app's own `/driver/v1/me`. It must learn the new union or
it fails to compile, which is the desired outcome.

**Alternatives rejected**: keeping two states and putting "suspended" in a separate boolean column —
two columns that can disagree about one fact; a separate `driver_employment` table — a one-to-one table
for three columns.

---

## R3 — Stranded work: a derived fact, never a stored flag

**Decision**: stranded work is **computed on read**, defined as work claimed by a driver who is no
longer eligible, which the automatic release sweep will not reclaim:

- a `collection_task` in `('collected','short')` whose run is not `completed`/`cancelled`, or
- a `delivery_task` in `('out_for_delivery','en_route','arrived')`,

where the owning driver's record is not `active`, or has no open duty session.

**Rationale**: `releaseIneligibleWork` (`apis/edge-api/driver/src/assignment/repository.ts:143`)
deliberately releases only work **not yet physically started** — `assigned`/`en_route` collection tasks
and `staged` drops. Its own comment: *"In-progress steps are NEVER yanked."* That is correct: the
packages are in a van, and deleting the task would make the platform forget goods that exist.

The gap is that nothing tells a human it happened. `collection_task_package_uq UNIQUE
(shop_fulfillment_id)` keeps those packages claimed, and the assignment sweep's `NOT EXISTS` skips
them, so they are unreachable by any automatic path — permanently, silently.

**Derived, not stored** — this is 027's counted-not-stored rule, third application after 028's
exhaustion count and 055's refund proposals. A stored `is_stranded` flag and the task rows can disagree,
and then nobody knows which is true. The condition is cheap (it is a predicate over rows already
indexed by run and driver) and always current.

**Releasing it is an explicit human action** (FR-021), because releasing means asserting something about
the physical world: the goods are back, or they are written off. No sweep can know that.

---

## R4 — Proof media: reuse `presignRead`, add an access record

**Decision**: reuse `presignRead` from `@effy/edge-shared`
(`apis/edge-api/shared/src/lib/media.ts:134`), already used by the driver app's own history
(`apis/edge-api/driver/src/history/repository.ts:138`). No new bucket, no new mechanism.

**Rationale**: FR-042 requires private, time-limited access. That is exactly what `presignRead` gives,
and the driver service already proves the grant works against this bucket. Building a second read path
for the same objects would be Principle II copy-paste.

**What is new**: FR-042 also requires each access to be **recorded**. A presigned URL is minted by the
service, so the mint is the access point — an `admin.audit_log` row with action `driver.proof.viewed`
is written when the URL is issued. ⚠ This records the *issuing*, not the *fetching*; a URL issued and
never opened still logs. That is the honest limit of presigning and it is stated in the data model
rather than papered over.

**The new service needs the S3 read grant** scoped to the media bucket — the same statement
`edge-api/driver` carries, not a widened one.

---

## R5 — Exception resolution: columns on the two existing tables, not a polymorphic table

**Decision**: add `resolved_at`, `resolved_by_sub`, `resolution_note` to **both**
`public.delivery_failure` and `public.collection_task_issue`, each with a partial index
`WHERE resolved_at IS NULL`.

**Rationale**: a resolution belongs to the thing resolved. A shared `driver_exception_resolution` table
would need a one-subject CHECK (the `driver_task_event` shape) and a join on every read, to hold three
columns that are identical in both cases and never queried across the two together. The partial index
is what makes "what is outstanding" a cheap query, which is the view FR-032 puts on the landing screen.

⚠ **Neither table is altered in any other way**, and the driver app is not touched. The driver keeps
writing exceptions exactly as it does today; this feature only adds the reader that was always implied.

**Alternatives rejected**: a status enum on each (`open`/`resolved`) — `resolved_at IS NULL` carries the
same information plus *when*, in one column; deleting resolved exceptions — FR-031 forbids it, and a
deleted exception is an un-auditable one.

---

## R6 — Unassigned work: the same predicate the assignment sweep uses

**Decision**: the duty view's "waiting for a driver" count reuses the sweep's own candidate predicate —
`shop_fulfillment` in `ready_for_pickup` with no `collection_task` claiming it, and checked-in same-day
packages with no `delivery_task_package` row.

**Rationale**: if the console computed "unassigned" its own way it would eventually disagree with what
the sweep actually sees, and the screen would be confidently wrong about why nothing is moving — which
is the one question it exists to answer. The predicate is **extracted to a shared SQL constant** in the
fleet service and pinned by a test asserting it matches the sweep's, the way 029 shared the promotion
visibility predicate between the home read and the detail read so they could not drift.

---

## R7 — Work email is the identity key and is not editable

**Decision**: `workEmail` is absent from the update contract. Changing it is not offered.

**Rationale**: the driver's sign-in account is keyed on the email (`ensureDriverUser` uses it as
`Username`) and the platform record joins on the `sub` that account returned. Changing the email means
creating a second Cognito user and re-pointing the record — a re-provisioning, not an edit, and one
that can strand the old account still able to sign in. FR-012 permits offering it as a distinct,
explicitly-confirmed operation; this slice takes the narrower option and does not offer it, because a
half-built identity migration is worse than none. Recorded as a carry-forward.

---

## R8 — Audit reuses `admin.audit_log`; driver actions are its third target type

**Decision**: write to the existing `admin.audit_log` (009) with `target_type = 'driver'`.

**Rationale**: the table was built general — *"General by design (ARCHITECTURE: admin schema = accounts
+ audit)"* — and already carries shop, shop_staff, catalog-schema and promotion actions. Its
`audit_log_target_idx (target_type, target_id, created_at DESC)` is exactly the profile-history query.

⚠ **This is a defect being closed, not a feature being added.** Driver management is currently the only
privileged back-office domain that writes **no** audit row: `grep -rn "audit_log"
apis/edge-api/admin/src/drivers/` returns nothing. Shops, promotions and catalog schema all write one.

**No PII in `detail`**: the column's own comment says *"detail carries before/after with NO PII beyond
governance (no raw token; email omitted by default)"*. FR-050 makes that binding here — phone and
emergency contact are recorded as *changed*, never as before/after values.

---

## R9 — Paging: keyset cursor minted from the column that is ordered on

**Decision**: keyset pagination ordered on `(name, id)` for the register and `(created_at, id)` for
exceptions and history; the cursor is minted from **the same expression the ORDER BY uses**.

**Rationale**: stated this explicitly because 053 shipped the opposite and it was found by reading the
code back — the order list ordered and filtered on `created_at` but minted its cursor from `placed_at`,
always the later instant, so paging **re-showed rows**. ⚠ Worse, its first test *passed with the defect
in place*, because it called the repository directly and supplied its own cursor, never touching the
service where the cursor is minted. **The paging test here goes through the service** and asserts the
union of two consecutive pages has no duplicate and no gap (SC-013).

---

## R10 — Search: `pg_trgm` on name, `citext` equality on email

**Decision**: `pg_trgm` GIN index on `public.driver.name` for the partial-name filter;
`work_email` is already `citext NOT NULL UNIQUE` and needs no index for prefix matching.

**Rationale**: both extensions are already installed (`pg_trgm` by 016, `citext` by 011 and by 049's own
migration) — no new extension. A fleet is hundreds, not millions, so the index is about predictable
plans rather than raw speed; it costs one line and removes the sequential-scan cliff at whatever size
the fleet actually reaches.

---

## R11 — Thresholds are configuration, never literals

**Decision**: two operational thresholds are environment configuration with declared defaults, read
through the service config module:

| Threshold | Default | Why configurable |
|---|---|---|
| Overdue duty session (FR-037) | 14 hours | A shift length is an operational fact, not a constant |
| Licence/registration expiry warning window (FR-046) | 30 days | Notice period is a policy choice |

**Rationale**: 035's defect was four env vars the service read and `serverless.yml` never declared — so
every pool resolved "unknown", no email was ever sent, and 100 passing tests missed it because they set
those vars themselves. A **config-contract test** that reads the real `serverless.yml` is the fifth
guard against that shape and is mandatory here (`config.contract.test.ts`, as `edge-api/admin/src/drivers`
already carries).

---

## R12 — Concurrent edits: `updated_at` as the concurrency token

**Decision**: a profile update carries the `updatedAt` it was loaded with; the write is
`WHERE id = $1 AND updated_at = $2`, and zero rows affected is a `409` naming the conflict.

**Rationale**: the spec's edge case requires that a second save not silently discard the first. The
column already exists and is already maintained on every write, so this costs one predicate and no
schema change. A dedicated version integer would be a second thing to keep correct for no additional
guarantee.

---

## R13 — Contracts: `@effy/shared-types`, and NO Kotlin regeneration

**Decision**: all DTOs go in `packages/shared-types/src/driver.ts` alongside the existing
`AdminDriverRow` family, which is expanded rather than duplicated.

**Verified**: only `cm-contract-gen`/`cm-contract-check` (customer-mobile) and `sm-contract-check`
(shop-mobile) exist in the `Makefile`. `apps/driver-mobile` has **no** `core/contract/` directory and
**no** drift guard — its DTOs are hand-written Kotlin. So adding back-office DTOs to `driver.ts`
generates nothing and breaks no mobile build.

⚠ **027's R13 still applies to any new numeric on a wire the mobile app reads.** This feature adds none
that driver-mobile consumes — every new DTO is back-office-only — but the register's counts are declared
`WireInt` regardless, because the rule is about the contract, not about who happens to read it today.

---

## R14 — Front end: a console feature slice, no new package

**Decision**: `apps/back-office/src/features/drivers/` + `apps/back-office/src/routes/drivers.tsx`,
nested under the protected `appRoute`, with a `Drivers` nav entry carrying **no `requiredRole`** —
every back-office role sees it, and mutating controls are gated in-screen and independently by the
backend.

**Rationale**: FR-022 puts read access with csa deliberately — a CSA is exactly who is asked "why did my
delivery fail". This mirrors Orders, Shops, Delivery, Deliverability and Feedback, all of which carry no
`requiredRole` with in-screen gating for mutations. The shape is copied from
`apps/back-office/src/features/orders/` (list screen + detail screen + `queries.ts` + `repo.ts` +
`access.ts` + `errorText.ts`), which is the most recent and closest analogue.

⚠ **`errorText.ts` is not optional.** 053 shipped a console where *every* refusal collapsed to one
generic sentence, because the screen tested `e instanceof Error` while the api-client throws a **plain
object**. FR-011 and FR-014 both require a named refusal to survive to the screen, so the error mapping
is written and tested against the api-client's real throw shape.

---

## R15 — Design: tables, lists and detail rows; no cards

**Decision**: the register is a table; the profile is a sectioned page of detail rows; duty, exceptions
and history are lists. **No card layouts and no metric cards**, including for the exception count
(FR-032) and the readiness view (US6), which are the two places a summary card is the obvious temptation.

**Rationale**: Principle V's no-card rule, with no exception claimed. The count in FR-032 is rendered as
a labelled figure in the section header, not a tile. The one permitted card application on this platform
is the console dashboard overview (041), which this feature does not touch.

**Colour**: monochrome ramp only. Status is carried by **weight and wording**, not hue — the same
correction 041 made when it removed `amber` used as a "warning" colour across shop-web. The two semantic
colours are available for a genuine error state; an expired licence is an ordinary fact, not an error.

---

## R16 — Telemetry (Principle VII)

**Product events** (PostHog, back-office console — on by default for internal consoles):
`driver_created`, `driver_status_changed`, `driver_exception_resolved`, `driver_work_released`.

**Metrics** (structured log lines the existing metric filters can select):
`fleet.driver_provision_failed` (Cognito reachable but the record write failed, or the reverse — the
half-created driver is the one state an operator cannot fix from the console),
`fleet.stranded_work_released`, `fleet.exception_outstanding_count`.

**Alarm**: one, on `fleet.driver_provision_failed`. Deliberately not one on outstanding exceptions —
that is a workload number, and alarming on workload teaches operators to ignore alarms.

⚠ **No PII in any of them** (FR-050): driver id only, never name, email, phone or emergency contact.
Metric labels stay low-cardinality — no driver id as a label.

---

## R17 — What this feature deliberately does NOT do

- **No manual dispatch.** 049 settled "no dispatcher, no accept/decline". Release-to-pool is the
  sanctioned intervention (FR-038). A test asserts no route accepts a target driver id for work.
- **No change to `apis/edge-api/driver` behaviour** beyond the status type widening in R2. The driver
  app is not modified at all.
- **No customer notification** for a failed delivery. Making it visible to Effy is this slice; deciding
  what the shopper is told is the failed-delivery handling slice this one unblocks.
- **No document image storage.** Licence is a reference and an expiry date. Storing scans creates a
  store of sensitive identity documents with its own retention and access obligations.

---

## Open risks carried into implementation

1. **The half-provisioned driver.** Create is two writes across two systems (identity, then record). If
   the second fails the operator sees a failure and a Cognito user exists. Mitigated by the
   Cognito-first + idempotent-upsert order (006/009's pattern — a retry converges) and by
   `fleet.driver_provision_failed`. ⚠ It cannot be made atomic; the profile must **show** the
   discrepancy (spec edge case) rather than render a half-working driver as normal.
2. **Suspension is immediate for access, eventual for work.** The sweep reclaims on its own schedule.
   The screen must say so; implying a suspended driver is cleared of work when they are not is the
   failure mode this feature exists to prevent.
3. **`edge-api/driver`'s container tests are the ones that would catch a status-widening regression**,
   and 054 recorded two Go packages red at clean HEAD for unrelated reasons. Run the edge-driver suite
   against a real database before and after the migration, and record both results.
