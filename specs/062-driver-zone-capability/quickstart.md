# Quickstart — Driver Zone Capability & Coverage (062)

How to run, prove and walk this feature. **Every step that touches AWS or the database is the
operator's**; Claude authors, the operator applies.

**Prerequisites**: `AWS_PROFILE=ef`, the dev database reachable, Node 22 + pnpm, **Docker running**
(container tests skip silently without it — §2b), and **061 deployed** (this feature extends its
readiness view and its driver screens).

---

## §1 Machine verification — no cloud, no database

```bash
pnpm -r typecheck                                   # expect 20/20
pnpm -r test                                        # expect exit 0
pnpm --filter @effy/edge-fleet test
pnpm --filter @effy/back-office test
pnpm --filter @effy/design-system test              # tokens:check MUST be UNCHANGED
scripts/check-no-emerald.sh && scripts/check-no-jade.sh
```

**Unchanged-suite proof** — these must pass **without their expectations being edited**, which is how
we know this feature added rather than altered: `edge-admin` · `edge-customer` · `edge-shop` ·
`edge-orders` · `edge-driver` · `customer-web` · `shop-web`.

---

## §2 Proofs that need real PostgreSQL

```bash
CONTAINER_TESTS=1 pnpm --filter @effy/edge-fleet test
```

| # | Proof | Requirement |
|---|---|---|
| C1 | ⚠ Granting the **same clearance twice** is refused by the index and surfaces as a no-op | FR-005 |
| C2 | ⚠ **Two identical "every zone" grants cannot both exist** — `NULLS NOT DISTINCT` holds | FR-005, R2 |
| C3 | ⚠ A driver cleared for **every zone** matches a zone **created afterwards** | **FR-011** |
| C4 | A zone-specific grant does **not** match a different zone | FR-001 |
| C5 | Revoking one clearance leaves the driver's others intact | FR-004 |
| C6 | Revoking a clearance the driver does not hold is a no-op | FR-006 |
| C7 | Deleting a zone removes clearances naming it and leaves every-zone grants untouched | §1 |
| C8 | ⚠ **Disabling** a zone does **not** delete clearances; re-enabling restores cover | §1 |
| C9 | A zone nobody is cleared for reports `no_driver_cleared` | FR-018 |
| C10 | A zone whose cleared drivers are all blocked reports `all_cleared_unavailable` | FR-018 |
| C11 | ⚠ A covered (zone, function, method) emits **no row at all** | FR-019 |
| C12 | ⚠ Same-day gaps appear **only** for zones whose `sameday_eligible` is true | R3 |
| C13 | Coverage and readiness agree about every driver, across every blocking reason | FR-020 |
| C14 | An offboarded driver's clearances do not count toward coverage | FR-021 |

### §2b ⚠ Docker must actually be up
058 was written with Docker down; its container tests ran afterwards and found **three** defects a
fully green suite had missed. 059 shipped 40 container tests that had **never run**. 061's first
container run caught a dropped column that typechecked perfectly. **If Docker is down, say so in the
sign-off rather than reporting a green suite.**

---

## §3 Database — operator

```bash
git add db/migrations/<ts>_driver_zone_capability.sql && git commit     # 003 commit-guard
make db-up ENV=dev
make db-status ENV=dev
psql "$(infra/scripts/db-dsn.sh dev)" -f db/seeds/062_capability_dev.sql
```

⚠ **DESTRUCTIVE**: drops `driver.delivery_zone_id`. The values are **not** migrated into the new table
— a single zone does not say which function or method it applied to, so converting it would invent a
clearance nobody granted. Operators re-grant deliberately.

---

## §4 Deploy — operator, in this order

```bash
make edge-deploy SERVICE=fleet ENV=dev      # 1. clearances + coverage
# 2. push to `dev` — Amplify auto-deploys back-office
```

⚠ **`fleet` BEFORE the console**, or the clearance editor and the coverage view call routes that do
not exist. 056 and 061 both recorded this ordering for the same reason.

---

## §5 The walk — a person, with eyes, on a screen

⚠ **039 shipped four live defects with a fully green suite**, because layout, contrast and hierarchy
are not properties a DOM assertion can see. **Nothing below is proven by any test above.**

| # | Walk | Proves |
|---|---|---|
| W1 | Clear a driver for same-day delivery in one zone | US1, FR-001/003 |
| W2 | Clear the same driver for standard collection in two other zones → all three show together | FR-002/007 |
| W3 | Revoke one → the other two are untouched | FR-004 |
| W4 | Grant the same clearance twice → **no error, nothing duplicated** | FR-005 |
| W5 | ⚠ Clear a driver for **every zone** → shown as "every zone", not as a list | FR-010/012 |
| W6 | ⚠ **Create a new zone, then reopen that driver → they cover it, with nobody touching their record** | **FR-011, SC-003** |
| W7 | Revoke the every-zone grant → zone-specific grants for other combinations survive | FR-013 |
| W8 | Open the register → each driver's breadth of clearance is visible without opening them | FR-014 |
| W9 | A driver cleared for nothing is shown as a **stated fact**, not blank space | FR-015 |
| W10 | ⚠ Open coverage → a zone nobody is cleared for says **nobody is cleared** | FR-018 |
| W11 | ⚠ Block the only cleared driver (expire their licence) → the same zone now says **cleared but unavailable** | FR-018 |
| W12 | ⚠ A zone with only collection cover is reported uncovered **for delivery** | FR-017 |
| W13 | ⚠ A fully covered zone **does not appear at all** | FR-019 |
| W14 | ⚠ A standard-only zone shows **no same-day gap** | R3 |
| W15 | Coverage and the readiness view agree about the same driver | FR-020 |
| W16 | Open a driver → **no single-zone field exists anywhere** | FR-024 |
| W17 | A driver cleared for nothing is blocked for **that reason**, not for a missing zone | FR-025 |
| W18 | Sign in as a **csa** → can read clearances and coverage, **no mutating control is visible** (absent, not disabled) | assumptions |
| W19 | Light **and** dark, on a real console window | Principle V |

**W6 is the most important walk.** FR-011 is the one behaviour whose absence is completely invisible —
the driver quietly stops being eligible for new areas, nothing fails, nobody is told. It cannot be
confirmed by looking at a screen once; it has to be *caused*.

---

## §6 Negative proofs — executed by breaking the thing

Each must be **performed**, not reasoned about. 057 records a guard that did not catch its own negative
proof; 056 records one where the break was **not** caught and the guard had to be fixed.

| # | Break it | Expect |
|---|---|---|
| NP1 | Drop `NULLS NOT DISTINCT` from the unique index → run C2 | C2 fails |
| NP2 | ⚠ Remove `OR c.zone_id IS NULL` from the match → run C3 | C3 fails |
| NP3 | Cascade-delete clearances on zone **disable** → run C8 | C8 fails |
| NP4 | Emit a row for covered combinations → run C11 | C11 fails |
| NP5 | Cross-join same-day across all zones → run C12 | C12 fails |
| NP6 | Re-derive "available" instead of reading `BLOCKED_REASONS` → run C13 | C13 fails |
| NP7 | Make a duplicate grant a `409` → the FR-005 test fails |
| NP8 | Add a `/fleet/v1/*` route with no authorizer | the contract test fails **naming it** |
| NP9 | Re-add `delivery_zone_id` to the driver payload | the FR-024 absence test fails |
| NP10 | Collapse the two coverage reasons into one | the FR-018 test fails |

⚠ **NP2 is the one that leaves a green suite and a broken feature.** Removing `OR zone_id IS NULL`
compiles, and passes every test written against zone-specific grants — it silently excludes every
"everywhere" driver from every zone. **NP5** is the same shape on the coverage side: it produces rows
that look plausible and can never be cleared.

---

## §7 Sign-off

Not done until: §1 green · §2 green **with Docker up** · §5 walked by a person · §6 all ten executed ·
`tokens:check` **unchanged** · the unchanged-suite proof holds · the parity register
[docs/audiences/driver-capabilities.md](../../docs/audiences/driver-capabilities.md) updated with §062.
