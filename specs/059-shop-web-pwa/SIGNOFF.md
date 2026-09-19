# Sign-off — 059 Shop Console as an Installable, Notifying Production App

**Date**: 2026-09-19 · **Status**: 🚧 **CODE-COMPLETE AND MACHINE-VERIFIED. NOT DEPLOYED, NOT
COMMITTED, NOT WALKED BY A PERSON.**

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)
· **Tasks**: [tasks.md](tasks.md) · **Quickstart**: [quickstart.md](quickstart.md)

---

## What was built

**109 of 128 tasks.** The **19 open ones are all operator-owned**: the Firebase credentials, the
deploys, and every live walk. Claude writes the code; the operator runs anything that touches live
AWS or a real device (`CLAUDE.md`, Mode of work).

⚠ T114–T117 are counted among the open ones and are not deferred work — they are *fix whatever the
walk finds*, and they cannot begin until somebody has walked.

| Phase | Story | State |
|---|---|---|
| 1 — Setup | — | ✅ code · ⚠ T001–T003 operator |
| 2 — Foundational | — | ✅ migration, contracts, Terraform |
| 3 — Installable console | US2 | ✅ built · ⚠ T045 walk |
| 4 — New-order notifications | US1 | ✅ built · ⚠ T066 walk |
| 5 — Attention | US3 | ✅ built · ⚠ T085 walk |
| 6 — Control | US4 | ✅ built · ⚠ T097 walk |
| 7 — Offline | US5 | ✅ built · ⚠ T107 walk |
| 8 — The walk | US6 | ⚠ **entirely operator — T108–T113** |
| 9 — Polish | — | ✅ telemetry, metrics, 12 negative proofs · ⚠ T128 commit |

---

## ⚠ The defect this slice closes, and how small the fix turned out to be

`core-api` has enqueued one `shop_new_order` notification intent **per active staff member of every
fulfilling shop, on every paid order, since 050** (`checkout/store.go:621`). The worker resolves
those intents to rows in `device_token`. `device_token.platform` was
`CHECK (platform IN ('android','ios'))` — and the shop audience works in a **web console**.

So every one of those intents has been written, attempted, and recorded `skipped` for the whole life
of the platform's push feature. The decision to notify was made and stored; only the arrival was
missing. **One line of the migration is the fix.**

⚠ **No backfill, deliberately.** Those `skipped` rows are a historical record of a real defect, not
a queue to replay. Re-sending them would notify operators about orders picked weeks ago.

---

## ⚠ Things found while building that were not in the plan

### 1. A **fourth** reader of `device_token.platform` the research missed

The plan's research (R5) enumerated three. The T009 audit — run before the widening, as 053 and 056's
shipped enum-widening defects demand — found a fourth: `packages/shared-types/src/device.ts`, whose
comment read *"Web push is out of scope this slice"*. It is **dormant**: exported from the package
index and imported by nothing, which is exactly why it was found by grep rather than by a failing
build, and exactly how a contradiction between it and the live contract would have sat unnoticed.

Widened, with the duplication **recorded and pinned** rather than hidden: `edge-shared` deliberately
does not depend on `@effy/shared-types` (every other edge service does), and collapsing them would
restructure seven Lambda bundles. Both sides now carry the same list and a test asserts it.

### 2. The reader audit found a way for **one unknown row to kill the whole drain**

`worker/repository.ts` casts `PendingRow.type` to `NotificationType` with nothing checking it. In the
window between deploying a producer that writes a new type and deploying the consumer, a row arrives
with a type not in `COPY` → `copyFor` returns `undefined` → a throw on `.title` → **the whole drain
dies, taking every other audience's notifications with it**. That is 053's "an unconfigured FCM
halted the whole drain" by a different road.

⚠ **My first fix was wrong and was reversed.** I made `copyFor` return `NotificationCopy | undefined`,
which pushes an impossible case onto every call site that already holds a valid type — and forced
existing tests to change, costing the "these suites pass unmodified" proof. The lie is the **cast**;
that is the one place that had to stop lying. Now `isKnownNotificationType` guards the boundary and
the drain **filters** the row, leaving it pending for the deploy that understands it.

### 3. ⚠ `RecipientToken.mutedTypes` had to be **optional**, and the tests are what said so

Declaring it required broke every mobile fixture — which would have destroyed the one proof that
matters about this widening. A field whose absence *is* the pre-059 behaviour must not be able to
break the tests that describe that behaviour.

### 4. ⚠ The built service worker would have been an **ES module**, and `pwa.ts` registers it as classic

`vite-plugin-pwa`'s `injectManifest` defaults to `rollupFormat: "es"`. Today the bundle contains no
top-level `import`/`export`, so classic registration works **by accident** — until a dependency
change emits one, at which point registration fails **only in a real browser**: every test passes,
the build succeeds, and the console silently loses offline support and notifications. Pinned to
`iife`. This is 024's VectorDrawable and 058's `WriteTimeout` shape — valid, compiling, tested, wrong
only where it runs.

### 5. ⚠ `pnpm -r test` was green while `pnpm -r typecheck` FAILED

An untyped `vi.fn(async () => …)` mock gives `mock.calls` the type `[][]`, so indexing it is a
compile error. **Vitest does not run `tsc`.** 029 recorded exactly this and it recurred here; it was
caught only because the full typecheck was run separately, not because any test went red.

### 6. ⚠ Adding a `platform` **dimension** to the existing send metric would have blinded the alarm

In CloudWatch a dimensioned metric is a *different* metric from an undimensioned one, so the alarm in
`notifications.tf` — which queries no dimensions — would have gone on reading a series nothing
publishes any more. It would not error. 054 recorded this shape ("a metric declared with label
`outcome` but called with `stage`… silently emits a series every alert querying `{stage=…}` misses").
The per-platform counters are emitted as their **own** EMF record; the existing ones are byte-identical.

### 7. Two variables for one fact, caught before it shipped

`dev.tfvars` already carries `fcm_project_id` from 050 — the *same* Firebase project. A new
`firebase_project_id` would have been a second name for one fact, and the way that fails is the two
drifting until the console talks to a project the worker never sends from. Collapsed to one.

### 8. ⚠ NP10 had no guard until I tried to break it

The plan's proof for "one derivation, two callers" was *"edge-shop's Today tests pass unmodified"* —
which proves the **screen** still works and says nothing about whether a second implementation grew
up beside it. A source guard (`one-rule.guard.test.ts`) now fails if the evaluator re-derives, drops
the `POSITIVE_INFINITY` cap, or grows a stock predicate of its own. **Found by executing the negative
proof, not by review.**

### 9. A deliberate deviation from T067, recorded rather than taken silently

The plan said to extract the derivation into `attention/derive.ts`. Reading the code showed
`buildAttention` is **already** pure, exported, and takes its cap as a parameter — so `derive.ts`
would have been a pass-through module adding a file and no guarantee. The principle is "one rule, two
callers"; importing it satisfies that. What the cap parameter buys is real: the evaluator passes
`Number.POSITIVE_INFINITY` where the card passes 8, because a shop with forty products below
threshold must record forty occurrences, not eight.

### 10. FR-035 is served by the offline banner **plus** one screen-level marker

The shell's banner says the console is offline. Today additionally says *how old* what you are
reading is, because Today is the screen an operator makes decisions from and "3 orders awaiting pick"
reads identically whether it arrived four seconds or four hours ago. The other screens rely on the
banner; recorded here so the asymmetry is not mistaken for an oversight.

---

## Verified

| Gate | Result |
|---|---|
| `pnpm -r typecheck` | **20/20** |
| `pnpm -r test` | **every package green** |
| `apps/shop-web` | **429** (was 335) |
| `apis/edge-api/shop` | **357** (was 314) + 61 skipped container tests |
| `apis/edge-api/notifications` | **43** (was 28) |
| `apis/edge-api/shared` | **75** (was 61) |
| `pnpm --filter @effy/shop-web build` | ✅ sw.js (**iife**), manifest.webmanifest, 23 precache entries |
| `make brand-check` | 62 assets |
| `tokens:check` | ⚠ **UNCHANGED** — 10 generated files match. The mechanical proof no token moved and no mobile Compose theme was touched |
| `check-tokens` / `check-component-shape` / `check-token-usage` | ✅ (319 files) |
| `check-no-emerald` / `check-no-jade` | ✅ |
| `terraform validate` / `fmt` | ✅ |

### ⚠ Suites that pass **UNMODIFIED** — each is a proof, not a formality

| Suite | Tests | Proves |
|---|---|---|
| `apps/back-office` | **191** | The Amplify module generalisation and the shared-component changes touched nothing else (048's pattern) |
| `apps/customer-web` | **463** | Same |
| `apis/edge-api/customer` | **170** | The `platform` widening changed nothing for other audiences |
| `apis/edge-api/driver` | **10** | Same |
| `apis/edge-api/admin` | **191** | Untouched |
| `edge-notifications` `drain.test.ts` | **12** | The sender branch changed nothing that already worked |
| `edge-shop` `today/` | **directory untouched** (`git status` empty) | ⚠ The attention promotion changed nothing (Principle II, A10) |

### ⚠ Twelve negative proofs, each executed by breaking the thing

| # | Break | Caught by |
|---|---|---|
| NP1 | `webmanifest` out of the Amplify allow-list | Proven against the **live regex** — the manifest is answered with HTML and a 200 |
| NP2 | A `notification` block on the web branch | P1 |
| NP3 | `tag` removed | P8 |
| NP4 | `renotify` removed | P8's audible half |
| NP5 | Push handler throws on a malformed payload | 4 P5 tests |
| NP6 | `includeUncontrolled` removed | P9 |
| NP7 | ⚠ `dedupe_key` keyed on the product id | A3 (×2) |
| NP8 | ⚠ `subject_key` nullable | A8 (×3) |
| NP9 | One intent per item instead of per kind | A4 |
| NP10 | Evaluator re-derives attention | one-rule guard (×3) |
| NP11 | A second `serviceWorker.register` | T036 |
| NP12 | A `webPath` with no route | P3, naming the path |

⚠ **NP7 and NP8 are the two the plan flagged as most likely to survive review**, because each leaves
a fully green suite and a feature that looks like it works. Both are caught, by multiple tests.

---

## ⚠ Not verified, and honestly so

- **Docker was down for this entire session**, so the **40 container-backed tests are written and
  have never executed** — including the ones that prove the CHECK constraints, the `UNIQUE` index
  behind "once per occurrence", and the four-table recipient join. ⚠ **058 recorded that its
  container tests, run late for the same reason, found three defects its whole green suite had
  missed**, and **056 found two wrong column names only in a container test** — both typecheck
  perfectly and fail at runtime. `CONTAINER_TESTS=1 pnpm --filter @effy/edge-shop test` is the first
  thing to run when Docker is up, and it is **not** optional.
- **Nobody has looked at any screen.** 039 shipped four live defects behind a fully green suite,
  because layout, contrast and hierarchy are not properties a DOM assertion can see.
- **No notification has ever been delivered.** Every claim about the push path is inference until
  quickstart §3b runs on a real device.
- ⚠ **iOS FCM token flakiness** (research R12) is documented, unfixable from our side, and
  **unobserved**. If it proves unreliable, R1's rejected standalone-VAPID path is the recorded
  fallback.

---

## ⚠ Open — all operator (19 tasks)

**In this order. The deploy order is the reverse of the obvious one and is stated in the migration.**

```bash
# 0. The backlog first — walking a console four slices behind measures the wrong thing
#    (054/055/057/058's own open items; quickstart §0a has the full sequence)

# 1. Firebase credentials → infra/envs/dev/dev.tfvars   ⚠ terraform plan REFUSES without them
#    Firebase console → Project settings → Your apps → Web        (api key, app id, sender id)
#                     → Cloud Messaging → Web Push certificates   (the PUBLIC VAPID key)

# 2. Schema BEFORE the services
make db-up ENV=dev

# 3. ⚠ THE CONSUMER LEARNS THE NEW TYPES BEFORE THE PRODUCER WRITES THEM
make edge-deploy SERVICE=notifications ENV=dev
make edge-deploy SERVICE=shop ENV=dev

# 4. Amplify env + the rewrite fix + the cache headers
make apply ENV=dev

# 5. Push shop-web to `dev` (Amplify auto-builds)

# 6. With Docker up, BEFORE trusting anything above:
CONTAINER_TESTS=1 pnpm --filter @effy/edge-shop test
```

Then [quickstart.md](quickstart.md) §1–§6. **§3b is the first moment anything in this slice is
proven**; **§6 is the one the brief actually asked for**.

⚠ **`make apply` will FAIL until the four Firebase values are supplied.** That refusal is the
feature, not an obstacle: without `VITE_VAPID_PUBLIC_KEY` the console boots, the operator grants
notification permission, the toggle turns on — and the tablet never rings, with nothing thrown and
nothing logged. Constitution § Real-World Identifiers: a build that stops beats a value that silently
works.

---

## Parity register

[docs/audiences/shop-capabilities.md](../../docs/audiences/shop-capabilities.md) §059 — ⚠ **to be
updated with OBSERVED state during US6**, not with intended state now. That is the whole point of
FR-038.
