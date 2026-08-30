# Quickstart — Back-Office Driver Management (056)

Validation guide. Every step is runnable; every expected outcome is checkable. ⚠ Operator-run steps
(anything touching live AWS or the database) are marked **[OPERATOR]** — per CLAUDE.md these are never
run by the assistant.

---

## 0. Prerequisites

- The `dev` environment is provisioned; `apis/edge-api/driver` and `apps/back-office` are deployed.
- A back-office **admin** account, a **manager** account, and a **csa** account exist (006/009).
- Docker is running — the repository tests are container-backed and **skip silently** without it.
  ⚠ 052 lost every exactly-once proof this way and did not notice until sign-off.
- At least one `delivery_zone` exists (047).

```bash
docker info >/dev/null && echo "docker UP"      # if this fails, the proofs below do not run
```

---

## 1. Baseline — record the state BEFORE the migration

⚠ Do this first. An unrecorded baseline makes a real regression look pre-existing (054's lesson).

```bash
pnpm -r typecheck
pnpm -r test
cd apis/edge-api/driver && CONTAINER_TESTS=1 pnpm test ; cd -
```

Record: typecheck package count, total test count, and the driver service's pass/fail. Any failure here
is **pre-existing** and must be written down as such before proceeding.

---

## 2. Migration **[OPERATOR]**

```bash
git add db/migrations/*_driver_management.sql && git commit   # 003 commit-guard runs first
make db-status ENV=dev
make db-up ENV=dev
```

Verify the widening landed and no driver was lost:

```sql
SELECT status, count(*) FROM public.driver GROUP BY status;   -- no 'disabled' remains
\d+ public.driver                                             -- 10 new columns, 3-value CHECK
\d+ public.delivery_failure                                   -- resolved_at / by / note + partial index
\d+ public.collection_task_issue                              -- same
```

Then **re-run step 1's driver suite**. It must match the baseline exactly. A new failure here is the
status widening and must be fixed before anything else.

---

## 3. Deploy **[OPERATOR]**

```bash
make edge-deploy SERVICE=fleet  ENV=dev     # the new service
make edge-deploy SERVICE=admin  ENV=dev     # the 5 old driver routes are REMOVED here
make edge-deploy SERVICE=driver ENV=dev     # status union widening only
```

⚠ **Order matters.** Deploy `fleet` **before** `admin`: between the two deploys the old routes still
answer, so there is no window in which driver management is unreachable. The reverse order leaves a gap.

Confirm the old routes are gone and the new ones answer:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$API/admin/v1/drivers"   # expect 404 — route removed
curl -s -o /dev/null -w '%{http_code}\n' "$API/fleet/healthz"      # expect 200
curl -s -o /dev/null -w '%{http_code}\n' "$API/fleet/v1/drivers"   # expect 401 — no token
```

---

## 4. US1 — the register and the profile (FR-001…FR-012, SC-001, SC-010)

1. Sign in to back-office as **admin**. **Drivers** appears in the nav.
2. **SC-001**: from the console home, find a named driver and open their profile. **Time it — under 15
   seconds**, without knowing an id.
3. Type three letters of a name → the list filters. Combine with a status filter and a zone filter.
4. Open a profile. Every field in [data-model §1](./data-model.md) is present, with an explicit empty
   state where unset — not a blank.
5. **SC-010 — the clearing proof.** Set a zone, a vehicle plate, a phone and a licence reference. Save.
   Reload. Now **clear each one** and save. Reload again. ⚠ Every one must still be empty. This is the
   defect FR-010 exists for: today `COALESCE` silently keeps the old value.
6. Open the same driver in two tabs, save an edit in the first, then save in the second.
   ⚠ The second must be **refused with a named conflict**, not silently win.
7. Sign in as **csa**. The profile reads in full; **no editing control is present** (absent, not
   disabled-looking).

---

## 5. US2 — onboarding and offboarding (FR-013…FR-021, SC-002, SC-004, SC-005)

1. **SC-002**: create a driver with a fresh work email. **Under 2 minutes**, no step outside the console.
2. Sign in to the **driver app** as that person with the emailed 6-digit code. It works.
3. **SC-005 — the duplicate refusal.** Try to create a second driver with the **same** work email.
   ⚠ It must be **refused, naming the existing driver**. Then re-open the original driver: name, zone,
   vehicle and status must be **byte-identical to before the attempt**. Today this path silently edits
   them. Repeat with the email of an **offboarded** driver — same refusal, and their Cognito account
   must **remain disabled**.
4. **SC-004**: suspend the driver with a reason. Within 60 seconds, the driver app must refuse them a
   session. Restore them → sign-in works again.
5. Offboard them. Access ends; they leave the default register view; `includeOffboarded` shows them;
   their history is **still there**.
6. **FR-024**: open the profile's history. Every action above is listed with who, what and when.
   ⚠ Then check the audit rows carry **no phone and no emergency contact** (FR-050).

---

## 6. US2 held-work guard + US4 stranded release (FR-020, FR-021, SC-006)

⚠ This is the proof that matters most in this feature, and it needs a real package.

1. Put a driver on duty and let the sweep assign a collection run. Have them **collect** at least one
   package (status `collected` — physically in the van).
2. Try to suspend them. ⚠ The console must **warn before confirming**, itemise the held packages and
   name the affected orders.
3. Confirm. The driver is suspended.
4. Open **stranded work**. The package appears, attributed to the named driver and the named order.
   ⚠ **This is the state that is invisible and permanent today.**
5. Release it with a note. Wait for the next sweep. An eligible on-duty driver receives it.
6. Confirm an `admin.audit_log` row records the release.

---

## 7. US3 — exceptions reach a person (FR-027…FR-033, SC-003)

1. In the driver app, mark a drop **undeliverable** with a reason and a note.
2. In the driver app, report a **short** package at a shop.
3. **SC-003**: both appear in back-office **within the same working session**, with the reason, the
   note, the driver, the order and the time. ⚠ Neither required a database query to discover — this is
   the gap the order-flow register calls the top structural one.
4. Click through to the order in **one step**.
5. Resolve one with a note. It leaves the outstanding list, stays readable, records who resolved it.
6. The outstanding count is visible on entering Drivers — ⚠ as a labelled figure in a section header,
   **not a metric card**.

**SC-003 as a measurement**, not a spot check:

```sql
SELECT (SELECT count(*) FROM public.delivery_failure)
     + (SELECT count(*) FROM public.collection_task_issue) AS recorded;
```

Compare against the console's total with `resolved=all`. They must be equal.

---

## 8. US4 — who is working right now (FR-034…FR-038, SC-008)

1. With one driver on duty mid-run and one off duty, open the duty view. **SC-008 — under 10 seconds**
   to answer "who is working and what are they doing".
2. The on-duty driver shows run type, progress against total, and next stop.
3. Take everyone off duty while work is `ready_for_pickup`. ⚠ The view must state the work is
   **unassigned** — not leave it invisible.
4. Leave a duty session open past the threshold → it is flagged; an admin can end it; a csa cannot.
5. **FR-038 negative**: no route accepts a target driver id for work. Grep the deployed route table;
   attempt a hand-made request that names a driver. It must not exist.

---

## 9. US5 — work record and proof (FR-039…FR-043, SC-012)

1. Open a driver's history. Runs newest first by working day, with type, outcome and volume.
2. Open a run → ordered stops/drops with the time each state was reached.
3. Open a drop delivered with a **signature or photo** → the proof renders.
4. **SC-012 — two halves.** Copy the media URL and open it **signed out**: it works while fresh
   (it is presigned) and **must fail after the TTL**. Then confirm an `admin.audit_log`
   `driver.proof.viewed` row was written when it was issued.
   ⚠ Record honestly that this logs the **issuing**, not the fetching (research R4).
5. Period summary shows days worked, runs, packages collected, drops delivered, drops failed —
   ⚠ **and no currency anywhere** (FR-049).

---

## 10. US6 — readiness (FR-044…FR-046, SC-009)

1. Create a driver with **no zone**. ⚠ **SC-009**: they are flagged as unable to receive work on the
   register — before any order is affected, not after one fails to move.
2. A zone with no active driver is reported as uncovered.
3. Set a licence expiry in the past and one inside the warning window → both flagged with the date.
4. Fix each → the flag clears with no further action.

---

## 11. Machine verification

```bash
pnpm -r typecheck
pnpm -r test
cd apis/edge-api/fleet && CONTAINER_TESTS=1 pnpm test ; cd -
cd apis/edge-api/driver && CONTAINER_TESTS=1 pnpm test ; cd -   # must match §1 baseline
cd apps/back-office && pnpm test ; cd -
make brand-check
pnpm --filter @effy/design-system run tokens:check              # must be UNCHANGED — no new token
```

**SC-013 — paging at scale**, container-backed and **through the service**, not the repository:

```
seed 500 drivers → page the full register at limit=25 → assert the union of all pages
has 500 distinct ids, no duplicate, no gap
```

⚠ It must go through the service, because that is where the cursor is minted. 053's paging test called
the repository directly, supplied its own cursor, and **passed with the defect in place**.

**SC-011 — role negative**, one request per mutating route as **csa**, each refused:

```bash
for r in create update status resolve release end-duty; do ... done   # expect 403 on every one
```

**SC-014 — PII sweep** over the logs of a full exercise:

```bash
grep -iE 'contact_phone|emergency|licence_reference|[0-9]{9,}' <captured logs>   # expect no match
```

---

## 12. ⚠ Look at it

039 shipped **four live defects with a fully green suite** — an orphaned divider, a backwards phone
layout, a CTA that vanished in dark mode, and a scrim that bleached the artwork. None was catchable by
a DOM assertion, because layout, contrast and hierarchy are not properties a test can see.

Open every screen in **light and dark**, at a narrow width, and confirm:

- no card-style container and no metric card anywhere (Principle V);
- status is legible by **weight and wording**, not colour;
- every list has a worded empty state, a loading state and an error state that says what to do;
- the register is usable at 500 rows.

---

## Open operator checklist

- [ ] Commit (spec, plan, migration, service, console) — ⚠ the assistant does not commit
- [ ] `make db-up ENV=dev`
- [ ] `make edge-deploy SERVICE=fleet` **then** `SERVICE=admin` **then** `SERVICE=driver`
- [ ] ⚠ **NOT `make apply`** — this slice touches no Terraform. The IAM and the alarm are in the fleet
      service's own `serverless.yml` (so `edge-deploy` creates them), and all seven SSM parameters it
      reads already exist. Verified, not assumed.
- [ ] §4–§10 walks
- [ ] §6 in full — the held-work guard and the stranded release. **The most important walk here.**
- [ ] §12 — a person actually looking at the screens
