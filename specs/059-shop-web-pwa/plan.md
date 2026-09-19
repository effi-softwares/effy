# Implementation Plan: Shop Console as an Installable, Notifying Production App

**Branch**: `059-shop-web-pwa` | **Date**: 2026-09-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/059-shop-web-pwa/spec.md`

**Research**: [research.md](research.md) — the brief asked for it; every decision below cites it.

---

## Summary

Make `apps/shop-web` installable, make it notify, and make somebody look at it.

Research found the slice is **much smaller on the backend than it looks, with one genuinely new
mechanism on top** (R0):

- **US1 needs no producer.** `core-api` has enqueued one `shop_new_order` intent per active staff
  member of every fulfilling shop since 050. **`POST /shop/v1/devices` already exists.** The only
  thing standing between a paid order and an operator's tablet is
  `device_token.platform CHECK (… IN ('android','ios'))` — every intent resolves to zero tokens and
  is recorded `skipped`. One migration and one sender branch close a defect that has been live since
  the push foundation shipped.
- **US3 is the real build.** Attention is derived on read from four queries; nothing records when a
  condition *began*. ⚠ And `awaiting_pick` becomes true **by the passage of time**, so there is no
  write to trigger on — which is what rules out both database triggers and per-write application
  code, and leaves a scheduled evaluator as the only correct shape (R6).
- **US2/US5 are the console**: one `injectManifest` service worker, a manifest, a precached shell, a
  persisted read cache, an install affordance and an update prompt.
- **US6 is a person walking the console**, with the backlog of 054/055/057/058 deploys applied first.

Transport is **FCM web push** — the constitution locks FCM, and the existing outbox already carries
retry, idempotency and dead-token pruning (R1). The standalone VAPID alternative most 2026 guidance
recommends is recorded as rejected, with its reasoning, because it is good advice for a codebase
this is not.

---

## Technical Context

**Language/Version**: TypeScript 5.9 (console + cold path), Node 22 (Lambda, arm64), SQL (PostgreSQL 16)

**Primary Dependencies**:
- New to `apps/shop-web`: `vite-plugin-pwa` (+ `workbox-*` through it), `firebase` (app + messaging,
  **dynamically imported** — R14), `@tanstack/query-persist-client-core` + an IndexedDB persister
- Reused unchanged: `firebase-admin` (already in `edge-api/notifications`), `@effy/edge-shared`,
  TanStack Router/Query/Store, `@effy/design-system`, `@effy/brand`
- **No new Go dependency; no hot-path change at all**

**Storage**: PostgreSQL 16, raw SQL, Goose forward-only. One migration: widen two CHECK constraints,
add one column, add one table.

**Testing**: Vitest (console + cold path), `@testing-library/react`, container-backed tests against
the real migrations for the evaluator (`CONTAINER_TESTS=1`), plus **a person on a real iPad** — the
one thing no test substitutes for (R15).

**Target Platform**: AWS Amplify Hosting (`platform = WEB`, static SPA) at
`shop.dev.effyshopping.com`. Operator devices: iPadOS Safari (primary), Android Chrome, desktop
Chromium.

**Project Type**: Web SPA + cold-path serverless, inside the existing monorepo.

**Performance Goals**: notification on device **< 30 s from payment** (SC-001) — the existing
worker runs on a schedule, so **its interval is the binding constraint** and must be verified, not
assumed. Evaluator run bounded well inside its own interval. No regression to console first paint
(the Firebase SDK never loads on the sign-in path).

**Constraints**:
- ⚠ **iPadOS gives the Push API only to a Home-Screen web app** — installation is a precondition of
  notifications on this audience's primary device (R12).
- ⚠ **A service worker that receives a push and shows nothing has its permission revoked on iOS** —
  silent push is unavailable; every push must render (R3, FR-029).
- ⚠ **Chrome rate-limits low-engagement senders (429 since Jan 2026)** — over-notifying costs the
  ability to notify at all (R7).
- The console has **no bundle budget gate** (unlike `customer-web`'s 174 KB); the Firebase SDK cost
  is acceptable *here* and explicitly not transferable (R14).

**Scale/Scope**: a handful of shops, 1–3 operator devices each. Volume is irrelevant; **interruption
hygiene is the binding constraint**, not throughput.

---

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1 design. Constitution v1.13.0.*

| Principle | Assessment | Verdict |
|---|---|---|
| **I. Spec-Driven** | `spec.md` (tech-free; three clarifications resolved by the operator), this plan, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`. `tasks.md` follows. | ✅ |
| **II. Monorepo / shared contracts** | `webPath` is added to the shared copy catalogue in `@effy/edge-shared`, not mapped per surface (R4). The attention derivation is **promoted** out of `edge-shop/today` so the screen and the evaluator run one rule — the move 058 made for the refund predicate and the pick-list renderer. The service worker stays shop-web-local **by design**: it is one surface's chrome, and back-office/customer-web will want different caching and different notifications. | ✅ |
| **III. Dual-path** | **Everything new is cold path**, and doctrinally so (R16): operator CRUD and a scheduled batch job. ⚠ **No new hot-path route** — 058's `GET /v1/shop/live` stays the only shop read on `core-api` besides the refund, and this slice does not add a second. `core-api` is not touched at all. | ✅ |
| **IV. Auth isolation** | Registration and preferences sit behind the **existing shop authorizer**; ownership is the verified `sub`, never a body field (the existing `devices.ts` contract). The evaluator runs with no user identity and addresses intents by `sub`. The `refund_proposed` kind is filtered by the **platform record** (`shop_manager`), reusing Today's `canRefund` — never the claim, never CSS (FR-022). ⚠ **The service worker holds no credential**: it shows a notification and opens a URL; the page authenticates. | ✅ |
| **V. Design** | Install affordance, offline banner, update prompt and the notification-settings screen use `@effy/design-system` primitives and existing tokens. **No new token** — `tokens:check` must pass **unchanged**, the mechanical proof nothing reached the mobile Compose themes. Notification icons reuse `@effy/brand`'s existing shop colourway; no new mark is authored. **No card layouts** on the settings screen — sectioned rows, per Principle V. | ✅ |
| **VI. Layered architecture** | Cold path keeps handler → service → repository with raw SQL. The evaluator is a scheduled handler → service → repository, mirroring 058's rollup job. Console: TanStack Query stays the server-state source of truth — ⚠ **the persisted cache is that same cache rehydrated, not a second one**, and API responses are **never** cached by Workbox (R8). | ✅ |
| **VII. Observability & telemetry** | Declared in full in R16: nine product events, a `platform` label on the existing send counters (3 values — low cardinality), evaluator run metrics, one alarm on repeated evaluator failure. ⚠ Push goes through **the platform notifications path** — this slice adds a *destination* to it, not a second path. | ✅ |
| **Technology Standards (locked)** | FCM is the locked push transport and is what this uses (R1). React 19 + TanStack + shadcn unchanged. Node 22 / Serverless / arm64 unchanged. PostgreSQL 16 + Goose forward-only. **No locked technology is swapped** — which is precisely why the VAPID alternative was rejected rather than adopted. | ✅ |
| **Real-world identifiers** | The **VAPID public key / Firebase Web Push certificate is operator-supplied**. Configuration **fails loudly** when absent; the existing sender's `configured=false` no-op is the precedent and is preserved. No address, domain or endpoint is inferred. | ✅ |
| **Quality gates** | Every FR maps to a task and an SC; deviations recorded below. | ✅ |

**Result: PASS. No exceptions required; Complexity Tracking is empty.**

### Post-design re-check (after Phase 1)

Re-run against the finished `data-model.md` and the four contracts. Still PASS. Three points the
design tightened rather than loosened:

- **Principle II got stronger, not weaker.** Three things that could each have become a second source
  for one fact are pinned by a test: `webPath` beside `deepLink` (push-payload P4), the attention
  derivation shared by the screen and the evaluator (attention-occurrence A10), and the notification
  labels served from the one copy catalogue rather than restated in the console (preferences N10).
- **Principle IV survived the service worker**, which is the one new execution context in the slice.
  It holds **no credential** — it shows a notification and opens a URL; the page authenticates. A
  token placed in a service worker outlives the tab that put it there, which is why this is stated
  in three artifacts rather than one.
- ⚠ **One design choice was reversed during Phase 1 on constitutional grounds.** An earlier draft had
  the service worker map `type` → route, which is simpler and needs no server change. It would have
  put the console's route table in two places — the shape Principle II exists to forbid, and the one
  029 already resolved by having the server set both forms from one id. The server sets `webPath`.

⚠ One thing that would have been a violation and is not: adopting `web-push`/VAPID would have been a
**locked-technology swap requiring a constitution amendment**. R1 records it as rejected rather than
quietly taken.

---

## Project Structure

### Documentation (this feature)

```text
specs/059-shop-web-pwa/
├── spec.md
├── plan.md               # this file
├── research.md           # Phase 0
├── data-model.md         # Phase 1
├── quickstart.md         # Phase 1
├── contracts/            # Phase 1
│   ├── device-registration-v2.contract.md
│   ├── notification-preferences.contract.md
│   ├── push-payload.contract.md
│   └── attention-occurrence.contract.md
├── checklists/
│   └── requirements.md
└── tasks.md              # /speckit-tasks — NOT created here
```

### Source code (repository root)

```text
db/migrations/
└── <ts>_shop_web_push.sql              # NEW — widen 2 CHECKs, +1 column, +1 table

apis/edge-api/shared/src/lib/
└── devices.ts                          # MODIFIED — platform gains 'web'; muted types on read/write

apis/edge-api/notifications/src/
├── fcm/sender.ts                       # MODIFIED — branch on platform: data-only + webpush for web
└── worker/copy.ts                      # MODIFIED — +webPath, +attention types, +coalescing fields

apis/edge-api/shop/src/
├── functions/
│   ├── shop-devices-v1-post.ts         # MODIFIED — accept 'web' and preferences
│   └── shop-notification-prefs-v1-*.ts # NEW — read/update this device's preferences
├── attention/                          # NEW — the derivation, promoted out of today/
│   ├── derive.ts                       #   the ONE rule Today and the evaluator both call
│   ├── evaluator.ts                    #   diff vs stored state → enqueue intents
│   ├── repository.ts
│   └── __tests__/ + *.container.test.ts
├── today/service.ts                    # MODIFIED — calls attention/derive.ts (behaviour unchanged)
└── serverless.yml                      # MODIFIED — +2 routes, +1 scheduled evaluator

apps/shop-web/
├── vite.config.ts                      # MODIFIED — VitePWA({ strategies: 'injectManifest' })
├── index.html                          # MODIFIED — manifest link, theme-color, apple meta
├── public/                             # MODIFIED — maskable + 192/512 icons (from @effy/brand)
└── src/
    ├── sw.ts                           # NEW — THE single service worker (precache, push,
    │                                   #       notificationclick, coalescing, badge)
    ├── lib/
    │   ├── pwa.ts                      # NEW — registration + update-prompt state
    │   ├── install.ts                  # NEW — beforeinstallprompt / iOS instructions / dismissal
    │   ├── online.ts                   # NEW — connectivity state; the write guard
    │   ├── query-persist.ts            # NEW — IndexedDB persistence of the Query cache
    │   └── env.ts                      # MODIFIED — +VITE_FIREBASE_*, +VITE_VAPID_PUBLIC_KEY
    ├── features/notifications/         # NEW — settings screen, permission priming, registration
    └── routes/settings.notifications.tsx  # NEW

packages/brand/                         # MODIFIED — emit shop PWA icon profiles (192/512/maskable)

infra/
├── modules/amplify-web-app/            # MODIFIED — +custom_headers (default [], 048's pattern)
└── envs/dev/amplify-consoles.tf        # MODIFIED — +webmanifest in the rewrite allow-list (R10);
                                        #   +VITE_FIREBASE_*/VAPID env; +cache headers
```

**Structure Decision**: the existing monorepo layout, unchanged. The one deliberate placement call is
`apis/edge-api/shop/src/attention/` — the derivation is **promoted out of `today/`** so the screen
and the evaluator cannot answer "what needs attention" differently, which is the shape 054's
`availability` defect took and 058's Principle-II promotions fixed. The service worker stays
shop-web-local because caching policy and notification behaviour are per-surface, not cross-cutting.

---

## Phase sequencing

Ordered so each phase is independently verifiable and the riskiest unknown is proven early.

| Phase | Delivers | Gate before moving on |
|---|---|---|
| **0 — Backlog drain** ⚠ operator | 054/055/057/058's open `db-up`, `edge-deploy`, `core-deploy`, `apply` steps | The dev console answers from current code. **Nothing below is meaningful until this is done** (R15). |
| **1 — Installable shell** (US2, US5) | manifest, icons, `sw.ts` with precache only, install affordance, update prompt, offline state, persisted read cache, the two Terraform fixes | Installed on a real iPad from `shop.dev.effyshopping.com`; opens standalone, signed in, survives airplane mode |
| **2 — The pipe** (US1) | migration, `platform='web'`, sender branch, `webPath`, SW push + click + coalescing + badge, permission priming, settings screen | ⚠ **A real order, on a real iPad, with the console closed.** This is the first moment anything is proven; everything before it is inference. |
| **3 — Attention** (US3) | `attention/derive.ts` promoted, `shop_attention_state`, the evaluator, new notification types, per-kind coalescing | Each of the four kinds fires once, recurs correctly, and `refund_proposed` reaches only a manager |
| **4 — Control** (US4) | `muted_types`, preference routes, per-kind toggles, blocked-permission state, sign-out unregistration | Toggling one kind on one device changes only that device |
| **5 — The walk** (US6) ⚠ person | Capability-register walk; defect fixes each with a test that fails without the fix; register updated with observed state | Every row observed; every defect fixed or written down |

⚠ **Phase 0 is not optional and is not this slice's work.** It is listed because walking a console
whose backend is four deploys behind measures the wrong thing, and because the operator owns every
command in it.

---

## Key design decisions (from research)

| # | Decision | Why it is not the obvious choice |
|---|---|---|
| R1 | **FCM web push**, reusing the existing outbox/worker/sender | Most 2026 guidance says standalone VAPID, and for greenfield it is right. Rejected because this is not greenfield: the existing path already has retry, idempotency and dead-token pruning a parallel sender would have to re-earn. Also a locked technology. |
| R2 | **One** service worker, `injectManifest` | Firebase's SDK registers its own `firebase-messaging-sw.js` by default; beside Workbox that is a documented **continuous-reload loop**. |
| R3 | **Data-only** messages to web; the SW always displays | A `notification` block on web duplicates the banner and blocks `tag`, `data`, badge and the "already looking" check. ⚠ iOS revokes permission from a SW that shows nothing, so FR-029 is a platform rule, not a preference. |
| R4 | Click handled in the SW via `clients.matchAll` + a server-set `webPath` | ⚠ `fcmOptions.link` **does not work in an iOS home-screen PWA**, and the existing deep link is `effy://` which a SW cannot open. |
| R5 | Widen `platform`, **after auditing every reader** | 053 and 056 each shipped a defect through an enum widening. The audit found the sender **ignores `platform`** — it would silently send a mobile-shaped message to a browser. |
| R6 | A **scheduled evaluator**, not triggers, not per-write code | ⚠ `awaiting_pick` becomes true **by time passing** — there is no write to trigger on. Any event-driven design misses the most urgent kind. |
| R7 | Attention coalesces at the producer; **orders coalesce in the SW** by `tag` | The producer cannot batch orders without delaying the first one, which is what SC-001 measures. |
| R8 | Precached shell + persisted **read** cache; writes refused; **no API caching in Workbox** | A replayed pick is a claim about a shelf another operator may have emptied, and no conflict rule exists. Workbox-caching API responses would be a second server-state cache. |
| R10 | Fix the Amplify rewrite allow-list; generalise the module | ⚠ `manifest.webmanifest` is **not** in the allow-list — it would be rewritten to `index.html` with a **200**, and the console would simply not be installable, with no error anywhere. |
| R13 | Update **prompt**, plus a focus/interval check | `autoUpdate` swaps the page under a picker mid-list (FR-010). A console open all shift never navigates, so without the interval check a build could wait forever. |

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| ⚠ **iOS FCM token flakiness** — reports of the token being unobtainable until Safari is restarted, and of registrations lapsing after hours (R12) | Medium | Cannot be settled by research or by any test. Phase 2's gate is an observation on a real iPad, and the quickstart says so. If it proves unreliable, R1's rejected VAPID alternative is the documented fallback. |
| Two service workers slip in when Firebase's defaults change | Low | A test asserts exactly one `navigator.serviceWorker.register` call site, and that `getToken` is always passed `serviceWorkerRegistration`. |
| The sender sends a mobile-shaped message to a browser | **Was certain** | R5's branch, plus a test per platform pinning the emitted message shape. |
| Attention notifications become noise and get switched off | Medium | Per-kind toggles (R9), producer-side coalescing (R7), and `notif_opened` instrumented as the measure (R16). |
| The rewrite allow-list fix regresses another console | Low | It only *adds* an extension; both consoles share the local, and back-office's tests must pass **unmodified** — the proof 056/057 used. |
| Phase 0 is skipped and the walk measures stale code | **High** | A named gate; every command in it belongs to the operator. |

---

## Complexity Tracking

> No constitutional violations. This section is intentionally empty.

---

## Out of scope

Restated from the spec so tasks cannot drift into it: offline mutation queue · other surfaces ·
customer/driver notifications · app-store packaging · quiet hours · digests or escalation ·
multi-language · new attention conditions beyond the four that already exist.
