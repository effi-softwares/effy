---
description: "Task list for 059 — Shop Console as an Installable, Notifying Production App"
---

# Tasks: Shop Console as an Installable, Notifying Production App

**Input**: Design documents from `/specs/059-shop-web-pwa/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: INCLUDED. The four contracts enumerate 41 named tests (C1–C8, P1–P12, A1–A11, N1–N10) and
the quickstart enumerates 12 negative proofs. They are part of the design, not an option.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable (different files, no dependency on an incomplete task)
- **[Story]**: the user story this serves (US1…US6)
- Every task carries an exact file path

## Path conventions

Monorepo, unchanged. `apps/shop-web/` · `apis/edge-api/{shop,shared,notifications}/` ·
`db/migrations/` · `infra/` · `packages/brand/`

---

## ⚠ Phase ordering note

Spec priorities are US1 (P1), US2 (P1), US3 (P2), US4 (P2), US5 (P3), US6 (P1). **US2 is built
before US1 despite both being P1**, because on iPadOS — this audience's primary device — the Push API
is only available to a Home-Screen web app, so US1 has **no route to the operator** until US2 ships
(research R12). This is a hard platform dependency, not a preference.

---

## Phase 1: Setup

**Purpose**: operator prerequisites and project initialisation. ⚠ Nothing downstream is meaningful
until T001–T003 are done.

- [ ] T001 ⚠ **OPERATOR**: drain the deploy backlog per [quickstart.md](quickstart.md) §0a — `make db-up ENV=dev`, `make apply ENV=dev`, `make core-image-push && make core-deploy ENV=dev`, then `make edge-deploy` for `fleet` → `admin` → `shop` → `inventory` → `orders` → `driver` → `customer` → `notifications`, in that order
- [ ] T002 ⚠ **OPERATOR**: verify the gate — sign in at `https://shop.dev.effyshopping.com`, confirm Today and Insights both answer from current code. **Stop if they do not.**
- [ ] T003 ⚠ **OPERATOR**: obtain the Firebase Web Push certificate (VAPID public key) and web app config from the Firebase console per [quickstart.md](quickstart.md) §0b. **Never inferred** — constitution, Real-World Identifiers.
- [X] T004 [P] Add `vite-plugin-pwa` and `firebase` to `apps/shop-web/package.json`; run `pnpm install`
- [X] T005 [P] Add `@tanstack/query-persist-client-core` and an IndexedDB persister to `apps/shop-web/package.json`
- [X] T006 Add `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_VAPID_PUBLIC_KEY` to the `REQUIRED` list in `apps/shop-web/src/lib/env.ts`, with accessors on `config`
- [X] T007 [P] Write `apps/shop-web/src/lib/__tests__/env.test.ts` asserting a **named** failure when `VITE_VAPID_PUBLIC_KEY` is absent (fail loudly — constitution)
- [X] T008 [P] Document the new `VITE_*` keys in `apps/shop-web/.env.local.example` and in `specs/007-shop-web/contracts/config.contract.md`

---

## Phase 2: Foundational (blocking)

**Purpose**: the migration and the shared-contract changes every story below depends on.

**⚠ CRITICAL**: no user-story work begins until this phase is complete.

### The reader audit — before the widening, not after

- [X] T009 ⚠ Audit every reader of `device_token.platform` and record the result in a comment block at the head of `db/migrations/<ts>_shop_web_push.sql`. Research R5 found three; **confirm nothing has been added since**. 053 and 056 each shipped a defect through an enum widening.
- [X] T010 ⚠ Audit every reader of `notification_request.type`. Confirm `worker/copy.ts`'s `COPY` is still a `Record<NotificationType, …>` so an unhandled type is a **compile error** — no `default:` branch, no `as NotificationType`.

### The migration

- [X] T011 Create `db/migrations/<ts>_shop_web_push.sql` per [data-model.md](data-model.md): widen `device_token_platform_check` to include `'web'`
- [X] T012 In `db/migrations/<ts>_shop_web_push.sql`, widen `notification_request_type_check` with `shop_awaiting_pick`, `shop_out_of_stock`, `shop_low_stock`, `shop_refund_proposed`
- [X] T013 In `db/migrations/<ts>_shop_web_push.sql`, add `device_token.muted_types text[] NOT NULL DEFAULT '{}'`
- [X] T014 In `db/migrations/<ts>_shop_web_push.sql`, create `public.shop_attention_state` with `UNIQUE (shop_id, kind, subject_key)` and the partial index on `notified_at IS NULL`. ⚠ `subject_key` is `NOT NULL text`, **not** a nullable uuid — see T081
- [X] T015 In `db/migrations/<ts>_shop_web_push.sql`, add the dev-only `-- +goose Down` step (drop the table, restore both CHECKs, drop the column); add table/column `COMMENT`s naming 059 and the FRs

### Shared contracts (Principle II)

- [X] T016 Widen `DevicePlatform` and `DEVICE_PLATFORMS` to include `'web'` in `apis/edge-api/shared/src/lib/devices.ts`
- [X] T017 Add `mutedTypes` to `DeviceRegistration` in `apis/edge-api/shared/src/lib/devices.ts`; accept it **only** for `platform: 'web'`, replacing wholesale when the key is present and leaving it untouched when absent (contract C4/C5)
- [X] T018 Extend `RecipientToken` in `apis/edge-api/shared/src/lib/devices.ts` to carry `mutedTypes`, and filter by it in the worker's recipient resolve
- [X] T019 Add `webPath` to `NotificationCopy` and `dataFor()` in `apis/edge-api/notifications/src/worker/copy.ts`, beside the existing `deepLink`, per [push-payload contract §3](contracts/push-payload.contract.md)
- [X] T020 Add the four attention types to `NotificationType` and `COPY` in `apis/edge-api/notifications/src/worker/copy.ts`, each with `title`, `body`, `deepLinkPath`, `webPath`, `tag`, `group`

### Terraform (research R10)

- [X] T021 ⚠ Add `webmanifest` to the rewrite allow-list regex in `local.spa_rewrite_rules`, `infra/envs/dev/amplify-consoles.tf:30`. Without this the manifest returns **HTML with a 200** and the console is silently not installable
- [X] T022 [P] Add a `custom_headers` variable (default `[]`) to `infra/modules/amplify-web-app/variables.tf` and wire it in `main.tf` — 048's generalisation pattern, so customer-web stays byte-identical
- [X] T023 Pass `custom_headers` from `infra/envs/dev/amplify-consoles.tf` setting a `no-cache`-family `Cache-Control` on `/sw.js` and `/manifest.webmanifest`
- [X] T024 Add the five `VITE_FIREBASE_*`/`VITE_VAPID_PUBLIC_KEY` values to the shop-web `env_vars` in `infra/envs/dev/amplify-consoles.tf`, sourced from operator-supplied variables with **no defaults**
- [X] T025 [P] Run `terraform -chdir=infra/envs/dev validate` and `fmt -check`

### Foundational tests

- [X] T026 [P] Write contract tests C1, C2, C3 in `apis/edge-api/shared/src/lib/devices.test.ts` — `'web'` accepted, `'windows'` refused naming the field, `mutedTypes` on `ios` refused
- [X] T027 [P] Write contract tests C4, C5, C6 in `apis/edge-api/shared/src/lib/devices.test.ts` — omitted `mutedTypes` preserved, `[]` clears, same token re-points one row
- [X] T028 [P] Write test P4 in `apis/edge-api/notifications/src/worker/copy.test.ts` — `webPath` and `deepLink` agree for **every** type (029's pinning)
- [X] T029 ⚠ Verify contract test C8 and the unmodified-suite proofs: `pnpm --filter @effy/edge-customer test` and `@effy/edge-driver` pass **with their expectations unchanged**

**Checkpoint**: the schema accepts a browser, the contracts carry a web destination, the manifest can be served. User stories may begin.

---

## Phase 3: User Story 2 — Installable console (Priority: P1) 🎯 Enables US1 on iPad

**Goal**: the console installs to a home screen, opens standalone and branded, restores the session,
and keeps itself current.

**Independent test**: install from `shop.dev.effyshopping.com` on a real iPad, launch from the home
screen, confirm standalone + signed in + on Today, under 60 seconds (SC-003).

### Icons and manifest

- [X] T030 [P] [US2] Add PWA icon profiles (192×192, 512×512, and a **maskable** 512 at ≤61.1% occupancy) for the shop colourway to `packages/brand/src/compositions.mjs`; regenerate with `make brand-gen`
- [X] T031 [P] [US2] Run `make brand-check` (`packages/brand/scripts/`) and confirm it fails-and-names when an icon in `apps/shop-web/public/` is stale (024's drift guard)
- [X] T032 [US2] Configure `VitePWA` in `apps/shop-web/vite.config.ts` with `strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'`, `registerType: 'prompt'`, and the manifest (name "Effy Shop", `display: 'standalone'`, `orientation: 'landscape'` hint, theme/background colour from existing tokens — **no new token**)
- [X] T033 [US2] Add the manifest link, `theme-color`, and `apple-mobile-web-app-*` meta tags to `apps/shop-web/index.html`, keeping the existing pre-paint appearance script and `noindex` intact (FR-008)

### The single service worker

- [X] T034 ⚠ [US2] Create `apps/shop-web/src/sw.ts` with `precacheAndRoute(self.__WB_MANIFEST)` and a navigation fallback to the app shell. **Precache only in this phase** — push handlers arrive in US1
- [X] T035 ⚠ [US2] Add an offline fallback document (`apps/shop-web/public/offline.html`) and serve it from the navigation route in `apps/shop-web/src/sw.ts`, so an installed app launched offline renders **the console's own** offline state, never the browser's error page (FR-034)
- [X] T036 ⚠ [US2] Assert in `apps/shop-web/src/lib/__tests__/pwa.test.ts` that there is **exactly one** `navigator.serviceWorker.register` call site (research R2 — a second service worker is a documented continuous-reload loop)
- [X] T037 [US2] Verify no API route is precached or runtime-cached, in `apps/shop-web/src/sw.ts` and the `workbox` options in `apps/shop-web/vite.config.ts` (research R8 — server state belongs to TanStack Query, and a second cache is two sources for one fact)

### Registration, update prompt, install affordance

- [X] T038 [US2] Create `apps/shop-web/src/lib/pwa.ts` — register the SW, expose `needsRefresh`/`updateServiceWorker`, and check for updates on **window focus** and on an interval (FR-011; a console open all shift never navigates)
- [X] T039 [US2] Build the update prompt UI in `apps/shop-web/src/components/console/UpdatePrompt.tsx` using design-system primitives; **never auto-swap** (FR-010)
- [X] T040 [US2] Create `apps/shop-web/src/lib/install.ts` — capture `beforeinstallprompt` on Chromium, detect iOS Safari + `display-mode: standalone`, persist dismissal in `localStorage`
- [X] T041 [US2] Build the install affordance in `apps/shop-web/src/features/notifications/InstallCard.tsx` — native prompt on Chromium, explicit Share → Add to Home Screen instructions on iOS, hidden once installed or dismissed (FR-006)
- [X] T042 [US2] Mount `UpdatePrompt` and the install affordance in the console shell, `apps/shop-web/src/routes/app.tsx`

### US2 tests

- [X] T043 [P] [US2] Test in `apps/shop-web/src/lib/__tests__/install.test.ts`: dismissal is remembered; the affordance is hidden in standalone mode
- [X] T044 [P] [US2] Test in `apps/shop-web/src/lib/__tests__/pwa.test.ts`: a waiting worker surfaces the prompt and is **not** activated without the operator's action
- [ ] T045 ⚠ [US2] **OPERATOR**: walk [quickstart.md](quickstart.md) §1a (the manifest returns `application/manifest+json`, **not** HTML), §1b (install on iPad, SC-003 timed), §1c (sign-in inside the installed window, FR-005), §1d (Android), §1e (update reaches an installed device, SC-009)

**Checkpoint**: the console is installable and current. On iPad, notification permission is now requestable at all.

---

## Phase 4: User Story 1 — A new order reaches a closed console (Priority: P1) 🎯 MVP

**Goal**: a paid order raises a notification on an operator's device within 30 seconds, and opens
the console on that order.

**Independent test**: console closed, iPad locked, place a paid order — notification arrives, opens
that order in one action (SC-001, SC-002).

### The sender branch

- [X] T046 ⚠ [US1] Branch `send()` on `platform` in `apis/edge-api/notifications/src/fcm/sender.ts`: mobile keeps its current message **byte-for-byte**; web gets **data-only** plus `webpush: { headers: { Urgency: 'high', TTL: '600' } }` and **no `notification` key** ([push-payload §1](contracts/push-payload.contract.md))
- [X] T047 [US1] In `apis/edge-api/notifications/src/fcm/sender.ts`, carry `title`, `body`, `tag`, `group` and `webPath` inside `data` for web, all as **strings** (FCM rejects non-strings silently)
- [X] T048 [P] [US1] Write tests P1, P2 in `apis/edge-api/notifications/src/fcm/sender.test.ts` — web emits no `notification` key, mobile does; every `data` value is a `string`
- [X] T049 ⚠ [US1] Verify test P12: `pnpm --filter @effy/edge-notifications test` passes with the **mobile send expectations unmodified**

### Registration from the console

- [X] T050 [US1] Create `apps/shop-web/src/features/notifications/messaging.ts` — **dynamically import** `firebase/app` and `firebase/messaging`, call `isSupported()`, and call `getToken(messaging, { vapidKey, serviceWorkerRegistration })` passing **our** registration (research R2/R14)
- [X] T051 [US1] Create `apps/shop-web/src/features/notifications/api.ts` — `POST`/`DELETE /shop/v1/devices` through `@effy/api-client` with `platform: 'web'`
- [X] T052 ⚠ [US1] Permission priming in `apps/shop-web/src/features/notifications/EnableNotifications.tsx` — explain what will be sent, then request permission **only** from a deliberate click. **Never on load** (FR-023, research R11)
- [X] T053 [US1] Create the settings route `apps/shop-web/src/routes/settings.notifications.tsx` and its screen, using **sectioned rows, not cards** (Principle V)

### Service-worker push handling

- [X] T054 ⚠ [US1] Add the `push` handler to `apps/shop-web/src/sw.ts`, wrapped in `event.waitUntil`. **Always call `showNotification`, including on a malformed payload** — iOS revokes permission from a service worker that receives a push and shows nothing (FR-029)
- [X] T055 ⚠ [US1] Add the FR-030 visibility check to `apps/shop-web/src/sw.ts` — skip the notification only when a client on the target path has `visibilityState === "visible"`; post a refresh message instead. A background tab is **not** an operator looking
- [X] T056 [US1] Add the IndexedDB counter and `tag`-based coalescing in `apps/shop-web/src/sw.ts`: `{ tag, renotify: true }`, title "N new orders to pick" (FR-020, research R7)
- [X] T057 [US1] Add `navigator.setAppBadge` / `clearAppBadge` driven by the counter (FR-032)
- [X] T058 ⚠ [US1] Add the `notificationclick` handler to `apps/shop-web/src/sw.ts` — `clients.matchAll({ type: 'window', includeUncontrolled: true })`, then `focus()` + `postMessage({ navigate: webPath })`, else `openWindow()`. ⚠ Without `includeUncontrolled` a window loaded before the SW took control is invisible and a **second** console opens
- [X] T059 [US1] Handle the `navigate` message in `apps/shop-web/src/lib/pwa.ts` by routing through TanStack Router — **not** `client.navigate()`, which is a full document load that discards the Query cache and the operator's place
- [X] T060 [US1] Reset the counter and badge on `notificationclick` and `notificationclose` in `apps/shop-web/src/sw.ts`

### US1 tests

- [X] T061 [P] [US1] Write tests P5, P6, P7 in `apps/shop-web/src/__tests__/sw.test.ts` — malformed payload still shows; visible client suppresses; **background** client does not
- [X] T062 [P] [US1] Write test P8 in `apps/shop-web/src/__tests__/sw.test.ts` — 20 pushes → one notification titled "20", with both `tag` and `renotify` set
- [X] T063 [P] [US1] Write tests P9, P10 in `apps/shop-web/src/__tests__/sw.test.ts` — click with a client focuses and posts; click without one calls `openWindow` exactly once
- [X] T064 [P] [US1] Write test P3 in `apis/edge-api/notifications/src/worker/copy.test.ts` — every `webPath` matches a route declared in `apps/shop-web/src/routes/`
- [X] T065 [P] [US1] Write test P11 in `apis/edge-api/notifications/src/worker/copy.test.ts` — no emitted body contains a customer name, address, email or order total (FR-013, FR-031)
- [ ] T066 ⚠ [US1] **OPERATOR**: deploy (`make db-up ENV=dev`, `make edge-deploy SERVICE=shop`, `SERVICE=notifications`, push shop-web to `dev`), then walk [quickstart.md](quickstart.md) §3a–§3f. ⚠ **§3b is the first moment anything in this slice is proven**; everything before it is inference. Repeat 20× for SC-001

**Checkpoint**: a closed console notifies. The defect live since 050 is closed. **This is the MVP.**

---

## Phase 5: User Story 3 — Attention notifications (Priority: P2)

**Goal**: each of the four attention conditions notifies once when it appears, again if it recurs,
and never floods.

**Independent test**: drive each condition, confirm one notification, confirm silence while it
persists, confirm a second on recurrence.

### Promote the derivation (Principle II)

- [X] T067 ⚠ [US3] Extract the attention derivation from `apis/edge-api/shop/src/today/service.ts` into `apis/edge-api/shop/src/attention/derive.ts` — **one rule, two callers**. If the screen and the evaluator ever derive separately, an operator is notified about something the console does not list
- [X] T068 [US3] Rewire `apis/edge-api/shop/src/today/service.ts` to call `derive.ts`; behaviour unchanged
- [X] T069 ⚠ [US3] Verify test A10: `pnpm --filter @effy/edge-shop test` — the **Today tests pass unmodified**. That is the proof the promotion changed nothing

### State and evaluator

- [X] T070 [P] [US3] Create `apis/edge-api/shop/src/attention/repository.ts` — read/insert/delete/`last_seen_at`-bump on `public.shop_attention_state`, raw SQL, no ORM
- [X] T071 ⚠ [US3] Create `apis/edge-api/shop/src/attention/evaluator.ts` — diff `current` against `stored`; **DELETE cleared rows** (this is what makes FR-019 fall out of the design rather than needing a rule); INSERT appeared; enqueue per the [attention-occurrence contract](contracts/attention-occurrence.contract.md)
- [X] T072 ⚠ [US3] In `apis/edge-api/shop/src/attention/evaluator.ts`, build `dedupe_key` from the **occurrence id**, never the product or order id. A product that goes out, is restocked and goes out again is two occurrences; keying on the product id lets the uniqueness that makes retries safe swallow the recurrence
- [X] T073 ⚠ [US3] In `apis/edge-api/shop/src/attention/evaluator.ts`, emit **one intent per kind per run**, not per item — a single stock count can drop forty products below threshold (FR-020)
- [X] T074 [US3] In `apis/edge-api/shop/src/attention/evaluator.ts`, resolve recipients at enqueue time from `shop_staff` (active only, FR-016); filter `shop_refund_proposed` to `shop_manager` via the **platform record**, reusing Today's `canRefund` — never the claim (FR-022)
- [X] T075 [US3] In `apis/edge-api/shop/src/attention/evaluator.ts`, run each shop's pass in **one transaction**; log-and-skip a shop that throws so one shop's bad data cannot silence every other (053's drain lesson)
- [X] T076 [US3] Create the scheduled handler `apis/edge-api/shop/src/functions/attention-evaluate.ts`, mirroring `insights-rollup.ts`
- [X] T077 [US3] Register it in `apis/edge-api/shop/serverless.yml` with a `schedule:` rate, and add a config-contract test asserting the declared env vars exist (035's undeclared-env-var defect)

### US3 tests

- [X] T078 [P] [US3] Write tests A1, A2 in `apis/edge-api/shop/src/attention/__tests__/evaluator.test.ts` — new condition enqueues once; a second run enqueues nothing
- [X] T079 [P] [US3] Write test A3 in `apis/edge-api/shop/src/attention/__tests__/evaluator.test.ts` — condition clears then recurs → a **second** intent
- [X] T080 [P] [US3] Write test A4 in `apis/edge-api/shop/src/attention/__tests__/evaluator.test.ts` — 40 products below threshold → **one** intent per recipient
- [X] T081 ⚠ [P] [US3] Write test A8 in `apis/edge-api/shop/src/attention/__tests__/evaluator.test.ts` — `awaiting_pick` (empty `subject_key`) run twice inserts **one** row. With a nullable uuid, `NULL <> NULL` makes the `UNIQUE` useless and this notifies on every run
- [X] T082 [P] [US3] Write tests A5, A7 in `apis/edge-api/shop/src/attention/__tests__/evaluator.test.ts` — `refund_proposed` not enqueued for `shop_staff`; nothing enqueued for a stood-down operator
- [X] T083 [P] [US3] Write test A9 in `apis/edge-api/shop/src/attention/__tests__/evaluator.test.ts` — one shop throwing leaves the others processed
- [X] T084 [US3] Write container test A11 in `apis/edge-api/shop/src/attention/repository.container.test.ts` — concurrent runs produce no duplicate intents, against the real migrations
- [ ] T085 ⚠ [US3] **OPERATOR**: `make edge-deploy SERVICE=shop ENV=dev`, then walk [quickstart.md](quickstart.md) §4a–§4g. ⚠ **§4e and §4f are the pair that matters**; §4g is what a real stock take will find if this walk does not

**Checkpoint**: all four conditions notify correctly and quietly.

---

## Phase 6: User Story 4 — The operator controls what interrupts them (Priority: P2)

**Goal**: notifications are enabled, disabled and tuned per device, and a blocked permission is
stated rather than hidden behind a toggle that cannot work.

**Independent test**: mute one kind on one device; that device goes quiet for it, the operator's
other device does not.

- [X] T086 [P] [US4] Create `apis/edge-api/shop/src/functions/shop-notification-prefs-v1-get.ts` — returns `registered`, `platform`, `mutedTypes` and `availableTypes` per the [preferences contract](contracts/notification-preferences.contract.md)
- [X] T087 ⚠ [US4] Serve `availableTypes` **from `worker/copy.ts`**, not a console-local list — the labels are notification copy and copy has one catalogue (Principle II, test N10)
- [X] T088 [P] [US4] Create `apis/edge-api/shop/src/functions/shop-notification-prefs-v1-patch.ts` — replaces `mutedTypes` wholesale; ⚠ returns an **identical `404`** for "not yours" and "no such token", so the route is not an oracle
- [X] T089 [US4] Register both routes in `apis/edge-api/shop/serverless.yml` behind the existing shop authorizer
- [X] T090 [US4] Build the per-kind toggles in `apps/shop-web/src/features/notifications/NotificationSettings.tsx` — sectioned rows, design-system `Switch`, no cards
- [X] T091 ⚠ [US4] In `apps/shop-web/src/features/notifications/NotificationSettings.tsx`, render the four permission states distinctly (FR-026) — `default` → priming; `granted` + registered → toggles; `granted` + unregistered → "Enable on this device"; **`denied` → a plain statement and no toggle**. A toggle that silently does nothing teaches the operator the console is broken
- [X] T092 [US4] Unregister on sign-out in `apps/shop-web/src/features/auth/` — `DELETE /shop/v1/devices/{token}` **before** the Cognito session clears (the call needs the token it is about to lose); proceed with sign-out even if it fails (FR-027)
- [X] T093 [US4] Clear the persisted Query cache on sign-out in `apps/shop-web/src/features/auth/` (the shared-tablet edge case)
- [X] T094 [P] [US4] Write tests N1–N5 in `apis/edge-api/shop/src/functions/notification-prefs.test.ts`
- [X] T095 [P] [US4] Write tests N6, N10 — a muted kind is not enqueued for that registration; `availableTypes` labels match `worker/copy.ts`
- [X] T096 [P] [US4] Write tests N7, N8, N9 in `apps/shop-web/src/features/notifications/__tests__/` — `denied` renders no toggle; sign-out deletes **before** the session clears; the cache is cleared
- [ ] T097 ⚠ [US4] **OPERATOR**: walk [quickstart.md](quickstart.md) §5a–§5g, including §5g — an operator who never enables notifications must see **no behaviour change at all** (SC-012)

**Checkpoint**: the operator is in control, and cannot be silently mis-served.

---

## Phase 7: User Story 5 — The console survives a bad network (Priority: P3)

**Goal**: a dropout is survivable and honest — reads stay, marked stale; writes are refused, never
faked.

**Independent test**: load, disconnect, navigate, attempt a write, reconnect. No dead end; nothing
falsely reported as saved.

- [X] T098 [P] [US5] Create `apps/shop-web/src/lib/online.ts` — connectivity state from `navigator.onLine` plus request outcomes, exposed through TanStack Store (genuine client state)
- [X] T099 [US5] Create `apps/shop-web/src/lib/query-persist.ts` — persist and rehydrate the **existing** TanStack Query cache to IndexedDB. ⚠ It is that cache rehydrated, **not a second one** (research R8)
- [X] T100 [US5] Wire persistence into the query client in `apps/shop-web/src/lib/query-client.ts`, with a max age and a buster keyed on the app version
- [X] T101 [US5] Add the offline banner to the console shell, `apps/shop-web/src/routes/app.tsx`, distinguishable from every other error state (FR-033)
- [X] T102 [US5] Mark restored data as last-known — a "last updated …" line in `apps/shop-web/src/features/today/`, `features/fulfillment/` and `features/catalog/` list screens (FR-035)
- [X] T103 ⚠ [US5] Add the write guard to the shared mutation path in `apps/shop-web/src/lib/` — refuse while offline with a clear message; **never optimistically report success** (FR-036). No queue: a pick replayed an hour later is a claim about a shelf another operator may have emptied, and no conflict rule exists
- [X] T104 [US5] Refetch on reconnect in `apps/shop-web/src/lib/query-client.ts` so recovery needs no manual reload (FR-037)
- [X] T105 [P] [US5] Write tests in `apps/shop-web/src/lib/__tests__/online.test.ts` — offline refuses a mutation and records nothing; reconnect triggers a refetch
- [X] T106 [P] [US5] Write a test in `apps/shop-web/src/lib/__tests__/query-persist.test.ts` asserting the persisted cache is cleared on sign-out
- [ ] T107 ⚠ [US5] **OPERATOR**: walk [quickstart.md](quickstart.md) §2a–§2e. ⚠ Be adversarial about §2c — "refused" and "silently did nothing" look identical for two seconds; verify against the database that nothing was written

**Checkpoint**: a dropout no longer looks like a broken console.

---

## Phase 8: User Story 6 — Every console feature verified by a person (Priority: P1)

**Goal**: every capability the register claims for `shop-web` is exercised against live data and
every defect found is fixed.

**Independent test**: the register states an **observed** result for every row.

⚠ **This phase has almost no code tasks, and it is the one the operator's own record says matters
most**: 039 shipped four live defects behind a fully green suite.

- [ ] T108 ⚠ **OPERATOR**: walk sign-in, Today and Insights on an installed iPad in **landscape**, light and dark, per [quickstart.md](quickstart.md) §6; record PASS or the defect per capability
- [ ] T109 ⚠ **OPERATOR**: walk the order console — list, filters, CSV export, detail, per-line picking, part pick, Fulfil, cancel, print pick list, refund
- [ ] T110 ⚠ **OPERATOR**: walk the catalog — list, product detail's four tabs, the Activity sheet, the add-product wizard, archive
- [ ] T111 ⚠ **OPERATOR**: walk stock — rules, movements, shop default threshold, start-tracking
- [ ] T112 ⚠ **OPERATOR**: walk team, shop identity and appearance (Light / Dark / Follow-System)
- [ ] T113 ⚠ **OPERATOR**: walk keyboard-only navigation and focus visibility across the six main screens
- [ ] T114 [US6] Fix each defect found in its own file under `apps/shop-web/src/`, **each with a test that fails without the fix** in the adjacent `__tests__/` directory (FR-039)
- [ ] T115 [US6] Record any defect deliberately deferred, with its reason, in `specs/059-shop-web-pwa/SIGNOFF.md` — a known defect left silently in place is not permitted (SC-011)
- [ ] T116 [US6] Correct any capability claim that proves impossible in `docs/audiences/shop-capabilities.md` and `specs/059-shop-web-pwa/spec.md`, rather than simulating the behaviour (FR-040)
- [ ] T117 [US6] Update `docs/audiences/shop-capabilities.md` §059 with the **observed** state of every row, plus the new PWA and notification capabilities and their `shop-mobile` column

**Checkpoint**: the console's claims and its behaviour agree.

---

## Phase 9: Polish & cross-cutting

- [X] T118 [P] Add the nine product events from [research.md](research.md) R16 to the console's telemetry taxonomy — `pwa_install_prompted`, `pwa_installed`, `notif_permission_requested`, `notif_permission_result`, `notif_enabled`, `notif_disabled`, `notif_opened`, `offline_entered`/`offline_recovered`, `sw_update_applied`
- [X] T119 ⚠ [P] Emit `notif_opened` from the service worker via `postMessage` to a client. It is the number that decides whether this slice was worth building, **and** the engagement signal browsers rate-limit against (research R7/R16)
- [X] T120 [P] Add a `platform` label to the worker's existing send-outcome counters in `apis/edge-api/notifications/src/worker/drain.ts` (three values — low cardinality, Principle VII)
- [X] T121 [P] Add evaluator run-duration and intents-enqueued metrics in `apis/edge-api/shop/src/functions/attention-evaluate.ts`, and a CloudWatch alarm on repeated whole-run failure in `infra/envs/dev/`. ⚠ Deliberately **no alarm on web send failures** — an expiring browser subscription is normal, and an alarm that fires weekly on healthy behaviour gets muted
- [X] T122 Execute negative proofs NP1–NP6 from [quickstart.md](quickstart.md) §7 **by breaking each thing** — `infra/envs/dev/amplify-consoles.tf`, `apis/edge-api/notifications/src/fcm/sender.ts`, `apps/shop-web/src/sw.ts` — and confirming the named test fails
- [X] T123 ⚠ Execute negative proofs NP7–NP12 the same way — `apis/edge-api/shop/src/attention/evaluator.ts`, `db/migrations/<ts>_shop_web_push.sql`, `apps/shop-web/src/lib/pwa.ts`, `apis/edge-api/notifications/src/worker/copy.ts`. **NP7 and NP8 are the two most likely to survive review**, because each leaves a fully green suite and a feature that looks like it works
- [X] T124 Run the full machine gate per [quickstart.md](quickstart.md) §7 — `pnpm -r typecheck` (expect 19/19), `pnpm -r test`, `CONTAINER_TESTS=1` for edge-shop, design-system and brand guards, `terraform validate`/`fmt`
- [X] T125 ⚠ Confirm `make tokens:check` is **unchanged** across `packages/design-system/compose*/` — the mechanical proof no token moved and no mobile Compose theme was touched
- [X] T126 ⚠ Confirm the four unmodified-suite proofs: `back-office` (190), `edge-customer`/`edge-driver` device tests, `edge-notifications` mobile sends, `edge-shop` Today tests
- [X] T127 [P] Write `specs/059-shop-web-pwa/SIGNOFF.md` recording what was walked, what was found, what was fixed and what was deferred
- [ ] T128 ⚠ **OPERATOR**: the commit (per `CLAUDE.md`, Claude does not commit)

---

## Dependencies

### Phase order

```
Phase 1 Setup  ──▶  Phase 2 Foundational  ──┬─▶ Phase 3 US2 ──▶ Phase 4 US1 ──┬─▶ Phase 5 US3 ─┐
   (T001–T008)         (T009–T029)          │      (MVP enabler)  (MVP)        │                ├─▶ Phase 8 US6 ──▶ Phase 9
                                            └─────────────────────────────────┴─▶ Phase 6 US4 ─┤     (T108–T117)   (T118–T128)
                                                                               └─▶ Phase 7 US5 ─┘
```

### Hard dependencies

| Dependency | Why |
|---|---|
| **T001–T002 before everything** | Walking a console four deploys behind measures the wrong thing |
| **T009/T010 before T011–T015** | The reader audit precedes the enum widening — 053 and 056 each shipped a defect the other way round |
| **Phase 3 (US2) before Phase 4 (US1)** | ⚠ On iPadOS the Push API exists **only** for a Home-Screen app. Not a preference — a platform rule |
| **T034 before T054–T060** | The push handlers live in the service worker US2 creates |
| **T067–T069 before T070–T077** | The evaluator calls the promoted derivation; promoting it afterwards means writing it twice |
| **Phase 4 before Phase 6 (US4)** | There is nothing to control until something notifies |
| **Phases 3–7 before Phase 8** | The walk covers the finished console |

### Independent after Foundational

- **Phase 5 (US3)**, **Phase 6 (US4)** and **Phase 7 (US5)** touch disjoint files and can proceed in
  parallel once Phase 4 lands.
- **Phase 7 (US5)** depends on Phase 3's service worker but on **nothing** in US1/US3/US4 — it can
  start as soon as T034 is done.

---

## Parallel execution examples

**Phase 2 — after T011–T015:**
```
T016 ─┐
T022 ─┼─ different files: edge-shared, terraform module, tests
T025 ─┤
T026 ─┘
```

**Phase 4 — the sender and the console are disjoint:**
```
T046–T049  (apis/edge-api/notifications/)   ║   T050–T053  (apps/shop-web/src/features/notifications/)
```

**Phase 5 — once T071 exists, every test is independent:**
```
T078 ║ T079 ║ T080 ║ T081 ║ T082 ║ T083
```

**Phase 9 — all telemetry tasks are disjoint:**
```
T118 ║ T119 ║ T120 ║ T121
```

---

## Implementation strategy

### MVP — stop here and it is worth having

**Phase 1 → Phase 2 → Phase 3 (US2) → Phase 4 (US1)** = T001–T066.

That delivers an installable console that notifies an operator about a new order when nobody is
looking, and closes a defect that has been live since 050. Everything after it improves the
experience; nothing after it is required for the console to be materially better than it is today.

### Increments

| Increment | Phases | Delivers |
|---|---|---|
| 1 | 1–4 | **MVP** — installable, new-order notifications |
| 2 | 5 | All four attention conditions |
| 3 | 6–7 | Operator control; offline honesty |
| 4 | 8–9 | The walk, telemetry, negative proofs, sign-off |

### ⚠ Two things to resist

1. **Deferring Phase 8.** It is the reason "every feature should work exactly" is in the brief, and
   it is the phase with no code and no satisfying output. Every prior slice deferred it; that is why
   054, 055, 056, 057 and 058 all carry "nobody has looked at any screen".
2. **Treating the negative proofs (T122–T123) as a formality.** Each is a defect this repo has
   shipped a version of. NP7 (keying the dedupe on a product id) and NP8 (a nullable `subject_key`)
   both leave a green suite and a feature that looks like it works.

---

## Task summary

| Phase | Story | Tasks | Count |
|---|---|---|---|
| 1 — Setup | — | T001–T008 | 8 |
| 2 — Foundational | — | T009–T029 | 21 |
| 3 — Installable console | US2 (P1) | T030–T045 | 16 |
| 4 — New-order notifications | US1 (P1) | T046–T066 | 21 |
| 5 — Attention | US3 (P2) | T067–T085 | 19 |
| 6 — Control | US4 (P2) | T086–T097 | 12 |
| 7 — Offline | US5 (P3) | T098–T107 | 10 |
| 8 — The walk | US6 (P1) | T108–T117 | 10 |
| 9 — Polish | — | T118–T128 | 11 |
| **Total** | | | **128** |

**Operator-owned**: T001, T002, T003, T045, T066, T085, T097, T107, T108–T113, T128 — **17 tasks**.
Per `CLAUDE.md`, Claude writes the code and the operator runs every deploy, migration and live walk.
