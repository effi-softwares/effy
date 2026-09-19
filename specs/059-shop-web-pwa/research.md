# Research — 059 Shop Console as an Installable, Notifying Production App

**Date**: 2026-09-19 · **Feeds**: [plan.md](plan.md) · **Spec**: [spec.md](spec.md)

This is the research deliverable the brief asked for. Every decision below is recorded as
**Decision / Rationale / Alternatives rejected**, and the ones that overturn something a reader
would otherwise assume are marked ⚠.

---

## R0 — What the codebase already has (measured, not assumed)

Before choosing anything, the existing plumbing was read. Four findings changed the shape of the
whole slice.

| Finding | Where | Consequence |
|---|---|---|
| ⚠ **`POST /shop/v1/devices` and `DELETE /shop/v1/devices/{token}` already exist**, on the cold path, built on a shared `devices.ts` used by three services | `apis/edge-api/shop/src/functions/shop-devices-v1-*.ts`, `apis/edge-api/shared/src/lib/devices.ts` | The registration API is **not new work**. 059 widens one enum rather than building an endpoint. |
| ⚠ **`shop_new_order` intents are already produced for every active staff member of every fulfilling shop** | `apis/core-api/internal/features/checkout/store.go:621-634` | US1 needs **no producer**. The decision to notify is made and stored; only the arrival is missing. |
| ⚠ **`device_token.platform` is `CHECK (platform IN ('android','ios'))`** | `db/migrations/20260823120000_observability_push.sql:33` | This single constraint is why every one of those intents resolves to zero tokens and is recorded `skipped`. It is the defect. |
| **Attention is derived on read from four independent queries; nothing records when a condition *began*** | `apis/edge-api/shop/src/today/service.ts` | US3 genuinely needs new state. It is the only part of this slice that does. |

Two further facts constrain the design rather than enabling it:

- **The notification worker ignores `platform` entirely** — it calls one `send()` for every token
  (`apis/edge-api/notifications/src/fcm/sender.ts:70`). Web needs a different message shape, so the
  sender must start branching. Small, but it is a behaviour change on a path that currently serves
  two live audiences.
- **The deep link is `effy://queue/<id>`** (`worker/copy.ts:59`) — a mobile custom scheme. **A
  service worker cannot open it.** See R4.

---

## R1 — Transport: FCM Web Push, not a standalone VAPID sender

**Decision**: deliver web notifications through **Firebase Cloud Messaging's web support**, reusing
the existing `notification_request` outbox, the existing scheduled worker, the existing
`firebase-admin` sender and the existing `device_token` table. A browser subscription is stored as
another row in `device_token` with `platform = 'web'`.

**Rationale**:

1. **The constitution locks it.** Technology Standards name "Push notifications: Firebase Cloud
   Messaging (FCM); APNs for iOS", and Principle VII requires push to "go through the platform
   notifications path … never ad hoc per feature". Introducing a second sender would be a locked-
   technology swap requiring an amendment, for a capability FCM already provides.
2. **It reuses the parts that are hard to get right.** Retry, the attempt cap, the `dedupe_key`
   uniqueness that makes a re-delivered producer event a no-op, and — most valuable — the
   **dead-token pruning** keyed on `messaging/registration-token-not-registered`, which is exactly
   what FR-028 asks for and which a hand-rolled sender would have to re-derive from raw 404/410
   responses.
3. **One credential, one console, one place an operator can look.** A second push vendor means a
   second secret, a second set of delivery statistics, and two answers to "was it sent?".
4. Under the hood FCM **is** the Web Push protocol for Safari and Firefox — Firebase has shipped
   Safari support since August 2023. Choosing FCM does not opt out of the standard; it puts a
   managed sender in front of it.

**Alternatives rejected**:

- ⚠ **Standalone VAPID via the `web-push` npm library.** This is what most 2026 write-ups recommend
  for a greenfield project, and for a greenfield project they are right: it is vendor-neutral, needs
  no client SDK at all (`PushManager.subscribe()` plus a `push` listener), and adds nothing to the
  bundle. **It is rejected here for one reason and one reason only — this is not greenfield.** The
  platform already sends push, to two audiences, through a path that has retry, idempotency and
  token-pruning built and tested. Adding a parallel mechanism to save a client SDK would put the
  shop audience on a delivery path with none of that, and would leave "did it send?" with two
  different answers. Recorded here rather than buried, because the recommendation is genuinely good
  advice that this codebase is the wrong shape for.
- **A hosted notification vendor** (OneSignal, MagicBell, Knock). Fastest to a working demo, and the
  wrong trade for an internal console with an existing outbox: a recurring per-subscriber cost, a
  third party in the path of an operational alert, and operator PII-adjacent data leaving AWS for no
  capability the platform lacks.
- **Declarative Web Push** (Safari 18.4+, no service worker required). Genuinely simpler, and
  **Safari-only** — it would have to be built alongside the service-worker path for Chrome and
  Android, not instead of it. Two mechanisms for one capability, for a saving that only applies to
  one browser. Revisit if Chrome ships it.

---

## R2 — ⚠ One service worker, built with `injectManifest`

**Decision**: the console has **exactly one** service worker, authored by us, generated through
`vite-plugin-pwa` with `strategies: 'injectManifest'`. Firebase's messaging SW code is imported
*into* it. The client passes that registration explicitly:
`getToken(messaging, { vapidKey, serviceWorkerRegistration })`.

**Rationale**: the Firebase JS SDK's default behaviour is to register **its own**
`/firebase-messaging-sw.js`. Beside a Workbox service worker that is two service workers competing
for the same scope, and the documented symptom is **the app reloading itself continuously** after
every deploy (`vite-plugin-pwa` issue #777). It is a well-known, reproducible failure, not a
theoretical conflict.

`injectManifest` is required rather than preferred: `generateSW` produces a service worker we cannot
add a `push` or `notificationclick` handler to, and this slice's entire notification behaviour —
coalescing by tag, the badge, focusing an existing window — lives in those handlers.

**Alternatives rejected**:

- `generateSW` + a separate `firebase-messaging-sw.js`: the reload loop above.
- `workbox.importScripts` to pull Firebase in: works, but leaves the notification logic in a file
  Vite does not typecheck or bundle. `injectManifest` gives one TypeScript service worker.

⚠ **Consequence to carry into tasks**: `import.meta.env` is **not available in a service worker**.
Any Firebase config the SW needs must be injected at build time or passed from the page.

---

## R3 — ⚠ Data-only messages to web tokens; the service worker always displays

**Decision**: for `platform = 'web'`, the sender omits the FCM `notification` block and sends
**data-only**, with `webpush: { headers: { Urgency: 'high' } }`. The service worker's
`onBackgroundMessage` / `push` handler builds and shows the notification itself. Mobile keeps the
`notification` block exactly as it is today.

**Rationale**:

1. **A `notification` block on web makes the SDK display the message itself.** Combined with our own
   handler that is the classic **duplicate notification** bug — two identical banners for one event.
2. Everything FR-013 through FR-032 asks for lives in options the `notification` block cannot set:
   `tag` (which is how FR-020's coalescing works), `data` (which is how FR-014's click routing
   works), `badge`/`icon`, and the ability to decide **not** to show when the operator is already
   looking (FR-030).
3. ⚠ **iOS revokes notification permission from a site whose service worker receives a push and
   shows nothing.** This is documented Safari behaviour, and it makes "receive quietly and just
   refresh the data" unavailable as a design. Our handler shows something on **every** push by
   construction, which is FR-029 — the requirement exists because of this platform rule.

**Alternatives rejected**: sending `notification` + `data` and letting the SDK render — loses tag
coalescing, the badge and the visibility check, and duplicates on any browser where our handler also
fires.

---

## R4 — ⚠ Click routing in the service worker, not `fcmOptions.link`

**Decision**: `notificationclick` is handled in our service worker. It reads a **`webPath`** from
the message `data`, calls `clients.matchAll({ type: 'window', includeUncontrolled: true })`, and
**focuses and navigates an already-open console window** if one exists, falling back to
`clients.openWindow()`. `dataFor()` in the shared copy catalogue gains `webPath` beside the existing
`deepLink`, and a test pins that the two describe the same destination.

**Rationale**:

1. ⚠ **`fcmOptions.link` does not work in an iOS home-screen PWA** — a documented, reproduced
   limitation: iOS opens the app and ignores the link. Since iPads are this audience's primary
   device, the one mechanism FCM offers for "open this URL" is the one that fails on the device that
   matters most.
2. ⚠ **The existing deep link is `effy://queue/<id>`.** A service worker cannot open a custom
   scheme. The payload needs a web destination regardless of which mechanism opens it.
3. FR-014's "reuse an already-open window rather than opening another" is only expressible through
   `clients.matchAll` + `focus`. `openWindow` alone leaves an operator with a second console window
   per notification over a shift.

**Why `webPath` is set by the server rather than mapped in the service worker**: 029 hit this exact
fork and recorded the answer — *"web routes on `href`, mobile on `target`… so the server sets both
from one promotion id and a Go test pins that they agree."* Mapping in the SW would put the console's
route table in two places, and a route rename would break notifications silently.

**Alternatives rejected**: `fcmOptions.link` (broken where it matters); mapping type→route in the
service worker (two sources for one fact).

---

## R5 — ⚠ Widening `device_token.platform` to `'web'` — with a reader audit first

**Decision**: one migration widens the CHECK constraint to `('android','ios','web')`, and
`DEVICE_PLATFORMS` in `@effy/edge-shared` widens to match. **Every reader of `platform` is audited
and named in tasks before the widening lands.**

**Rationale**: the audit is not ceremony. **053 and 056 each shipped a defect through an enum
widening**, and 057 records the pattern a third time. The audit was run during research and the
result is small enough to state in full:

| Reader | File | Behaviour on a new value | Action |
|---|---|---|---|
| Registration validation | `shared/src/lib/devices.ts:55` | Rejects `'web'` with a 400 | **Must widen** |
| `RecipientToken.platform` | `shared/src/lib/devices.ts:31` | Type only; carried to the worker | Widen the type |
| The FCM sender | `notifications/src/fcm/sender.ts:70` | **Ignores `platform` entirely** — would send a mobile-shaped message to a browser | **Must branch** (R3) |
| Anything else | — | A repo-wide search found no other reader | — |

⚠ **The sender's row is the dangerous one.** It does not fail on an unknown platform; it silently
sends the wrong message shape. That is 056's `requireDriver` shape — a negative check that quietly
admits a new value — and it is why R3's branch is a correctness requirement, not a refinement.

**Alternatives rejected**: a separate `web_push_subscription` table. It would duplicate the
subject/audience/pruning/last-seen columns and force the worker to union two sources to answer "who
do I send to" — the two-sources-for-one-fact shape this repo has shipped five defects through.

---

## R6 — ⚠ Attention occurrences: a scheduled evaluator, not triggers, not per-write code

**Decision**: a new scheduled job re-derives each shop's attention set on a fixed interval, diffs it
against a stored `shop_attention_state`, and enqueues a `notification_request` for conditions that
are **newly** present. It calls **the same derivation the Today screen calls**, promoted into
`@effy/edge-shared` if needed — one rule, one place.

**Rationale — one fact settles it**: ⚠ **`awaiting_pick` becomes true by the passage of time, not by
a write.** An order ages into needing attention. There is no INSERT, no UPDATE, no transaction to
hang a trigger or a service call on. Any event-driven design would cover three of the four
conditions and silently miss the most time-critical one.

The remaining reasons confirm it rather than carry it:

- **A trigger cannot evaluate these predicates cheaply.** They are joins with thresholds and
  ordering (`days of cover`, `below reorder point`, refund-proposal derivation across tables). 058's
  triggers are constrained by a guard test to `pg_notify` + an `ON CONFLICT DO NOTHING` insert and
  nothing else — deliberately, and correctly. A predicate this shape does not belong in one.
- **Per-write application code is 054's `availability`-in-14-places defect**, which that slice fixed
  by moving the rule into one place and adding a guard that fails naming the file. Re-introducing it
  for attention would be undoing a lesson this repo paid for.
- **A poll costs almost nothing here.** The evaluator runs per shop on a small interval; 058's own
  research measured this workload and concluded rollups in Postgres at ≈$0/month at 10k orders.

**Occurrence identity** — what makes "once per occurrence, again on recurrence" answerable:

| Kind | Occurrence key | Why |
|---|---|---|
| `awaiting_pick` | one per shop | The operator's question is "is there a backlog", not "which orders" |
| `out_of_stock` | shop + product | A different product running out is a different event |
| `low_stock` | shop + product | Same |
| `refund_proposed` | shop + order | A proposal is per order; it is what the operator approves |

A row appears when the condition is first seen and is **deleted when the condition clears**, which
is what makes FR-019 (recurrence notifies again) fall out of the design instead of needing a rule.

**Alternatives rejected**: database triggers (cannot see time passing, and 058's guard forbids the
shape); per-write service calls (054's lesson); notifying from the Today read itself (a screen
nobody opens would then notify nobody — it is the *closed* console this slice exists for).

---

## R7 — Coalescing: two mechanisms, because the two sources are different

**Decision**:

- **Attention** coalesces **at the producer**. One evaluator run emits at most one notification per
  kind per shop — "3 products out of stock", not three notifications.
- **New orders** coalesce **at the service worker**, using `showNotification(..., { tag:
  'shop-new-order', renotify: true })` with a running count kept in IndexedDB, so twenty orders in a
  minute replace one banner reading "8 new orders to pick" rather than stacking twenty.

**Rationale**: the producer cannot coalesce orders — each order is a separate intent written by a
separate checkout transaction, and holding them back to batch would delay the first one, which is the
one SC-001 measures. The service worker is the only place that sees them arrive together. Conversely
the evaluator *does* see a whole attention set at once, and doing it there keeps the dedupe key
honest. This is also what satisfies SC-005 (≤5 interruptions in a 20-order minute) without slowing
SC-001 (<30 s for the first).

⚠ **`renotify: true` requires `tag`**, and silently does nothing without it.

**Alternatives rejected**: batching orders in the worker (delays the urgent case); no coalescing
(fails SC-005, and browsers now rate-limit senders whose notifications go unengaged — Chrome began
returning 429 to high-volume low-engagement senders in January 2026, so over-notifying risks the
ability to notify at all).

---

## R8 — Offline: precached shell + a persisted read cache, writes refused

**Decision**:

- **App shell**: Workbox precache of the build output — the operator gets the console, not a browser
  error page, when launching offline (FR-034).
- **Reads**: the TanStack Query cache is persisted to IndexedDB and restored on boot, so the last
  view is readable. Restored data is rendered with an explicit "last updated …" marker (FR-035).
- **Writes**: refused with a clear message while offline (FR-036). **No mutation queue.**
- **API calls are never Workbox-cached.** Server state is TanStack Query's job; a second cache in
  the service worker is two caches for one fact and would let a stale response answer a fresh query
  with nothing marking it stale.

**Rationale**: the operator chose "survive a dropout, refuse writes" (spec, Decisions taken). The
reason to *keep* refusing is stronger than convenience: a pick recorded on a tablet and sent an hour
later is a claim about a shelf **another operator may have emptied in between**, and the platform
has no conflict rule that could settle it. 054 already accepts a residual oversell window it cannot
close; a replayed pick would widen it invisibly.

**Alternatives rejected**: a background-sync mutation queue (out of scope, and unsound without a
conflict rule); caching API responses in Workbox (a second server-state cache); no precache at all
(installed icon opens a browser error — worse than a tab).

---

## R9 — Preferences live on the registration row, opt-out shaped

**Decision**: one `muted_types text[]` column on `device_token`, default `'{}'` (everything on).
Muting is per **registration**, which is per browser per device, satisfying FR-025.

**Rationale**: the preference is a property of "this device wants to be interrupted by this", which
is exactly what a registration is. 054 settled the columns-vs-side-table question on the same ground
— the worker reads this on every send, and a join to learn one small set is a join added to the one
path that must stay cheap.

**Why opt-out and not opt-in**: a type added later is **on** by default. For an operator console
that is right — the operator enabled notifications to be told things — and the wrong default is
recoverable in one tap, whereas a silently-off new alert is not discoverable at all.

**Alternatives rejected**: preferences per operator rather than per device (FR-025 explicitly wants a
manager's tablet and a picker's tablet to differ); a `notification_preference` table (a second table
to answer one question on the send path).

---

## R10 — ⚠ Two hosting facts that would each break this silently

**Decision**: fix both in Terraform, generalising the shared module rather than forking it.

1. ⚠ **The SPA rewrite would swallow `manifest.webmanifest`.** The console's rewrite
   (`infra/envs/dev/amplify-consoles.tf:30`) rewrites any path whose extension is not in an
   allow-list to `/index.html` **with status 200**. The list is
   `css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp` — **`webmanifest` is not in it**.
   The browser would fetch the manifest, receive HTML with a 200, and the console would simply not
   be installable, with no error anywhere. `js` and `json` *are* listed, so the service worker and a
   `.json`-named manifest would work by luck. **Fix the allow-list**, because the next console to
   want this will hit the same wall.
2. **No cache headers can be set today.** `infra/modules/amplify-web-app` has no `custom_headers`
   variable. Browsers cap service-worker script caching at 24 hours regardless, so SC-009 ("within
   one working day") holds without it — but relying on a browser default for a deploy-reach
   guarantee is the kind of unstated dependency this repo keeps finding later. Add `custom_headers`
   to the module with a default of `[]`, exactly as **048 generalised 042's module** by adding
   `platform`, `subdomain_prefix` and `custom_rules` with defaults that kept customer-web
   byte-identical.

**Alternatives rejected**: renaming the manifest to `manifest.json` to slip through the existing
allow-list — it works, and it leaves the trap armed for back-office and customer-web. Forking the
module — Principle II.

---

## R11 — Permission priming, and the one thing that must never happen

**Decision**: the console never calls `Notification.requestPermission()` on load. Notifications are
offered on an in-console settings surface that explains what would be sent; the browser prompt is
raised only from that deliberate click.

**Rationale**: a denied permission is **not recoverable in-app on any browser** — once an operator
blocks, nothing this slice builds can reach them again until they change a browser setting they will
never find. Priming exists to spend the one prompt well. Chrome and Safari both require a user
gesture in 2026 regardless, so this is also the only thing that works.

FR-026's "say so plainly when blocked outside the console" is the other half: presenting a toggle
that cannot take effect teaches the operator the feature is broken.

---

## R12 — Installation: prompt where the browser offers one, instructions where it does not

**Decision**: capture `beforeinstallprompt` on Chromium (Android, desktop) and surface an install
control. On iOS/iPadOS Safari, which fires no such event, show **explicit instructions** (Share →
Add to Home Screen), gated on `display-mode: standalone` being false, and dismissible with the
dismissal remembered (FR-006).

**Rationale**: ⚠ **on iPadOS the Push API is only available to a Home-Screen web app.** An operator
on an iPad who never installs cannot even be *asked* for notification permission — the API is
absent. That is why US2 is P1 and why the instructions are a functional requirement rather than
polish: on this audience's primary device, installation is the precondition for US1 existing at all.

⚠ **Known iOS behaviour to expect during the walk**: reports of the FCM token not being obtainable
until Safari has been closed and reopened after permission is granted, and of registrations lapsing
after some hours. Neither is fixable from our side; both must be **observed on a real iPad** before
this is called done, and the quickstart says so.

---

## R13 — Updates: prompt, do not auto-swap

**Decision**: `registerType: 'prompt'`. When a new build is waiting, the console shows an
unobtrusive "A new version is ready — reload" affordance. It also checks for an update on window
focus and at a fixed interval, so a tablet left open for days still finds one.

**Rationale**: FR-010 forbids swapping versions underneath an operator mid-action, and
`autoUpdate` + `clientsClaim` does exactly that — a picker half-way through a pick list gets the
page replaced. A console that is open for an entire shift never navigates, which is why the
focus/interval check is needed: without it, a build could sit waiting indefinitely and SC-009 would
fail on precisely the device that never closes the app.

**Alternatives rejected**: `autoUpdate` (violates FR-010); reload-on-navigation only (the console is
a SPA; an operator may not do a full navigation for hours).

---

## R14 — Bundle cost, and where it lands

**Decision**: accept `firebase/app` + `firebase/messaging` in the console, **loaded dynamically**
from the notification-settings path and the registration call, not from the app entry.

**Rationale**: shop-web is **login-gated and internal** — it already carries `recharts` (~400 KB)
for insights, and it has **no bundle budget gate**, unlike `customer-web` whose 174 KB guest budget
is the platform's tightest constraint. The cost is real but it is spent in the right place. Dynamic
import keeps it off the sign-in path, which is the one screen an operator waits on.

⚠ **This choice is not transferable to `customer-web`.** If a customer-facing push slice is ever
written, R1's reasoning must be re-run against that budget — the standalone VAPID path costs zero
client bytes, and there the trade may well go the other way.

---

## R15 — Verifying the existing console (US6)

**Decision**: the walk is driven by
[`docs/audiences/shop-capabilities.md`](../../docs/audiences/shop-capabilities.md), screen by screen,
against live dev data, recording **observed** state per capability. Defects found are fixed with a
test that fails without the fix (FR-039); anything deferred is written down with its reason.

**Rationale**: this is not a testing task, it is a *looking* task, and the repo's own record says why
— **039 shipped four live defects behind a fully green suite**, and 057/058 both state that nobody
has looked at any screen. 024's VectorDrawable defect and 058's `WriteTimeout` defect are both
"valid, compiling, tested, wrong only where it runs". No amount of additional automated coverage
substitutes.

⚠ **Scope note**: 054, 055, 057 and 058 each carry open operator steps (migrations, `edge-deploy`,
`core-deploy`) that must run **before** the walk can mean anything — walking a console whose backend
is two deploys behind measures the wrong thing. Those steps are prerequisites of US6, not part of it,
and the plan sequences them first.

---

## R16 — Path assignment (Principle III) and telemetry (Principle VII)

**Path**: everything new in this slice is **cold path**, and that is the doctrinal answer rather than
a convenience:

| Work | Path | Why |
|---|---|---|
| Device registration / unregistration | **Cold** — `edge-api/shop` | Already there. Low-frequency operator CRUD. |
| Notification preferences | **Cold** — `edge-api/shop` | Same. |
| Attention evaluator (scheduled) | **Cold** — a scheduled function | Async batch work; the exact shape 052's `receiptDrain` and 058's rollup job already use. |
| Sending | **Cold** — `edge-api/notifications` | Unchanged; the platform's one notification path. |
| Everything else | — | No new hot-path route. ⚠ 058's `GET /v1/shop/live` stays as the only shop read on core-api besides the refund, and this slice **does not add a second**. |

**Telemetry** (a plan adding a user-facing flow must declare it):

- **Product events** (PostHog, existing taxonomy, no PII): `pwa_install_prompted`,
  `pwa_installed`, `notif_permission_requested`, `notif_permission_result`,
  `notif_enabled` / `notif_disabled` (with type), `notif_opened` (with type — fired from the SW via
  a client message), `offline_entered` / `offline_recovered`, `sw_update_applied`.
- **Metrics**: the worker's existing send-outcome counters gain a `platform` label (**low
  cardinality — three values**); the evaluator emits run duration and notifications-enqueued-per-run.
- **Alerts**: an alarm on the evaluator failing repeatedly. ⚠ Deliberately **no alarm on web send
  failures** — a browser subscription expiring is normal and expected, and an alarm that fires
  weekly on healthy behaviour is an alarm that gets muted.
- ⚠ **`notif_opened` is the number that decides whether this slice was worth building**, and it is
  also the engagement signal browsers now rate-limit against (R7). It is not optional instrumentation.

---

## R17 — What was deliberately not resolved here

- **Quiet hours.** Shop opening hours are not modelled in a form this slice can read; 047's
  collection schedule is about cutoffs, not staffing. An operator who does not want interrupting
  turns notifications off. Recorded in the spec's assumptions rather than guessed at.
- **The VAPID key pair and the Firebase Web Push certificate** are operator-supplied. Per the
  constitution's real-world-identifier rule, the configuration must **fail loudly** when absent
  rather than default to anything. The existing sender's fail-open (`configured=false` → no-op)
  is the right precedent and is preserved.
- **iOS token-lifecycle flakiness** (R12) cannot be settled by research — only by observation on a
  real iPad.

---

## Sources

- [MDN — Push API best practices](https://developer.mozilla.org/en-US/docs/Web/API/Push_API/Best_Practices)
- [MDN — Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [Firebase — Sending to macOS/iOS Safari using the FCM JS SDK](https://firebase.blog/posts/2023/08/fcm-for-safari/)
- [Firebase — Use Firebase in a PWA](https://firebase.google.com/docs/web/pwa)
- [Chrome for Developers — Web Push interoperability wins](https://developer.chrome.com/blog/web-push-interop-wins)
- [vite-plugin-pwa — injectManifest](https://vite-pwa-org.netlify.app/guide/inject-manifest)
- [vite-plugin-pwa issue #777 — a second service worker causes constant reloads](https://github.com/vite-pwa/vite-plugin-pwa/issues/777)
- [Pushpad — iOS special requirements for web push](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications)
- [Apple Developer Forums — iOS PWA web push and `fcmOptions`](https://developer.apple.com/forums/thread/731081)
- [web-push-libs/web-push](https://github.com/web-push-libs/web-push) (the rejected alternative, R1)
- [MagicBell — PWA iOS limitations and Safari support](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
