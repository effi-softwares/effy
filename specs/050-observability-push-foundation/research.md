# Research: Observability & Push Foundation (Phase 0)

Decisions that resolve the Technical Context. Each: **Decision · Rationale · Alternatives**. Sources
are the official docs read during specification (FCM HTTP v1, FCM at-scale, Crashlytics, PostHog
KMP/Next.js/proxy, Firebase pricing).

---

## R1 — Backend FCM send: `firebase-admin` (Node), HTTP v1 under the hood

**Decision**: The notifications worker (cold path, Node) sends via the **`firebase-admin`** SDK using a
**service-account key** — `messaging().sendEach([...])` for per-token targeting. This is the FCM **HTTP
v1** API (OAuth2 bearer, the only supported API; legacy server-key API is retired).

**Rationale**: `firebase-admin` mints and refreshes the OAuth2 access token, batches multi-recipient
sends, and surfaces the exact `messaging/registration-token-not-registered` error the token-pruning
rule (FR-018) depends on. It lives only in the worker (off every user path), so its bundle weight is
irrelevant. At-scale guidance (600K quota-tokens/min bucket; back off on 429 `retry-after`) is handled
by batching + the worker's retry.

**Alternatives**: raw HTTP v1 with `google-auth-library` (more code, must hand-roll token minting/error
mapping — no benefit here); the legacy FCM server-key API (**retired**, non-starter).

## R2 — Mobile FCM: native SDKs behind `expect`/`actual`, not a KMP wrapper lib

**Decision**: Each app implements `PushTokenProvider` with **`expect`/`actual`** over the native SDKs —
Android `com.google.firebase:firebase-messaging` (+ a `FirebaseMessagingService`), iOS
`FirebaseMessaging` (APNs token handed to FCM). Same pattern as `AuthDriver`/`PaymentDriver`.

**Rationale**: Firebase has **no first-party KMP support**; the community wrappers (KMPNotifier,
KFirebaseMessaging) are third-party and would add an unvetted dependency for what is ~1 interface. The
codebase already owns the native-driver pattern for exactly this kind of platform capability.

**Alternatives**: KMPNotifier / KFirebaseMessaging (drop a third-party lib on the critical push path —
rejected for the same reason we don't use a KMP Firebase-Auth wrapper).

## R3 — Mobile Crashlytics: native SDKs behind `expect`/`actual`, with the KMP dSYM upload fix

**Decision**: `CrashReporter` `expect`/`actual` over Firebase Crashlytics native SDKs. Android: the
`firebase-crashlytics` Gradle plugin. iOS: the Firebase iOS SDK **plus an Xcode Run-Script build phase
that uploads the shared KMP framework's dSYM** (`upload-symbols -gsp GoogleService-Info.plist -p ios
<Shared.framework.dSYM>`), copying the framework out of its symlinked path first (the documented KMP
gotcha, or upload fails with "Path is not a .dSYM").

**Rationale**: This is the industry-standard KMP Crashlytics setup; without the extra dSYM step, Kotlin/
Native crash traces are unreadable (fails FR-004). `logNonFatal()` and `setSubject(sub)` map directly
to `recordException` / `setUserId`.

**Alternatives**: CrashKiOS/other KMP crash libs (extra dependency; Crashlytics is the locked standard).

## R4 — Mobile analytics: native PostHog SDKs behind `expect`/`actual` (not the 0.x KMP SDK)

**Decision**: `AnalyticsDriver` `expect`/`actual` over **`posthog-android`** and **`posthog-ios`**.
Config: `autocapture=false`, `captureScreenViews=false` (we emit typed screen events ourselves),
`personProfiles=identified_only`, **session replay OFF**, init on a background dispatcher, batched flush.

**Rationale**: The official **`posthog-kmp` SDK is early-access (0.x, "API may change between minor
versions")** and merely delegates to these same native SDKs. Betting the whole platform's analytics on
a 0.x lib is unjustified when the native SDKs are stable and the driver is thin. Manual screen/event
emission keeps the taxonomy typed and PII-free (autocapture on a commerce app risks capturing input
text — forbidden).

**Alternatives**: `posthog-kmp` (revisit once it reaches 1.0 — the driver interface makes swapping it a
data-layer-only change); Firebase Analytics (not the locked analytics tool; PostHog is).

## R5 — Device-token registration endpoint: per-audience **cold path**

**Decision**: `POST /{audience}/v1/devices` + `DELETE /{audience}/v1/devices/{token}` on **edge-customer,
edge-shop, edge-driver**, each behind its own pool's authorizer, all writing one shared `device_token`
table.

**Rationale**: Refines ARCHITECTURE.md's single "hot-path endpoint". Shop and driver have **no hot
path** (cold-path pools); a hot-path endpoint could not serve them without breaking auth isolation
(Principle IV). Registration is a low-frequency write → cold path is correct per Principle III. Uniform
across audiences, minimal blast radius. Recorded in plan Complexity Tracking.

**Alternatives**: one hot-path (core-api) endpoint for all (breaks isolation for shop/driver); a
hot-path endpoint for customer + cold for the others (asymmetric, no benefit — registration isn't
latency-sensitive).

## R6 — Push trigger mechanism: a **polled `notification_request` outbox** worker (SNS-ready)

**Decision**: Producers append a row to `notification_request(recipient_sub, audience, type, payload
jsonb, dedupe_key, status)` when the triggering state change commits (in the **same transaction**);
a scheduled cold-path worker (`rate(1 minute)`, the 049 precedent) drains `status='pending'`, resolves
device tokens, sends, and sets `status='sent'`. Idempotency = `UNIQUE(dedupe_key)` at insert + a
per-recipient dedupe within the row's fan-out.

**Rationale**: The **SNS/SQS event backbone does not exist yet** (CLAUDE.md "still ahead"; the driver
`assignmentSweep` polls for exactly this reason). The transactional outbox is the correct, idempotent
interim and is the canonical migration source to SNS later — when the backbone lands, the worker
becomes an SQS consumer and the producers publish instead of INSERT, **with no change to the payload
contract or recipients logic**. Reusing `event_outbox` was rejected: it is core-api-only and
semantically an *event* log, whereas this is a *notification intent* (recipient already resolved), which
keeps recipient logic at the producer that knows it.

**Alternatives**: build SNS/SQS now (separate, larger slice — out of scope); drain the existing
`event_outbox` (couples cross-backend producers to a Go-owned table; wrong granularity).

## R7 — Producers of notification intents (who writes the outbox row)

**Decision**: Each state change writes its own intent, in-transaction:
- **core-api (hot, Go)** — order → `paid`: intent `order_paid` to the order's customer.
- **edge-shop (cold)** — a `shop_fulfillment` is created: intent `shop_new_order` to that shop's staff;
  fulfillment → `ready_for_pickup`: intent `order_ready` to the customer.
- **edge-driver (cold)** — run assigned: intent `run_assigned` to the driver; delivery → out/complete:
  `order_out_for_delivery` / `order_delivered` to the customer.

**Rationale**: The producer already holds the recipient identity and runs in the transaction that makes
the fact true — the only place the intent can be recorded atomically (no lost or phantom notification).

**Alternatives**: a central mapper polling many status tables (fragile, races the writers).

## R8 — Shared event taxonomy across six surfaces without a shared KMP module

**Decision**: The **event-name taxonomy is the single contract** ([contracts/telemetry-taxonomy](contracts/telemetry-taxonomy.contract.md)):
the web `StorefrontEvent` union + `docs/telemetry/*` remain the human SSOT; each mobile app declares a
`sealed class AnalyticsEvent` mirroring it; a **drift check** (a host test asserting the app's event
names ⊆ the documented set) keeps them aligned — the same mechanism already used for web↔mobile taxonomy
parity and for generated content (`LegalContent`).

**Rationale**: The three KMP apps are **independent Gradle builds** and already duplicate per-app code
(`AuthDriver`); introducing a shared published KMP module is a large, separate change. Principle II is
satisfied by the **names/shapes** being the single contract, enforced mechanically, not by sharing
Kotlin source.

**Alternatives**: a new shared KMP analytics module (scope creep; revisit platform-wide later); free
strings at call sites (violates FR-007 — un-typed events).

## R9 — Web: initialise the existing wrappers + first-party reverse proxy

**Decision**: (a) **customer-web** — wire a consent affordance that calls the existing consent-gated
`initAnalytics()` (the code exists; nothing calls it) and add screen/pageview + the new
`notification_opened` events; keep the **dynamic import** (protects the 174 KB gate). (b) **consoles**
(shop-web, back-office) — call `telemetry.init()` at bootstrap (internal, employees, on by default).
(c) **Reverse proxy** — customer-web uses a Next `rewrites` proxy under a **non-obvious first-party
path** (never `/analytics`,`/tracking`,`/posthog`) to the region host; consoles proxy similarly (or
direct — internal, blocker-agnostic, decided in tasks).

**Rationale**: The web analytics stack is already built and PII-safe; it has simply never been switched
on (CLAUDE.md 033/039 carry-forward). A first-party proxy is PostHog's documented anti-blocker standard
and improves reliability without deceptive naming (FR-028).

**Alternatives**: turn on with the raw provider host (ad-blockers silently drop data); a static import
(regresses the guest bundle gate — explicitly rejected in the existing code comments).

## R10 — Consent model + platform-wide kill switch

**Decision**:
- **Customer** (public): analytics is **consent-gated** — no PostHog network call before consent (the
  existing design). A lightweight consent choice (accept/decline) is added; decline = SDK never loads.
- **Internal** (shop, driver, back-office): analytics **on by default** (employees, disclosed), still
  zero PII; a per-user opt-out where required by policy.
- **Crash reporting**: on for all (safety-critical), still zero PII beyond `sub`.
- **Kill switch**: a public bootstrap flag **`/effy/<env>/telemetry/enabled`** (SSM, surfaced to clients
  at startup via config) that gates client init **before** any SDK loads — no app release needed
  (FR-026). PostHog's own `opt_out` covers per-user.

**Rationale**: Matches the constitution ("consent-respecting", "no PII beyond sub") and AU jurisdiction;
the out-of-band flag is a true kill switch because it prevents load, unlike a PostHog feature flag
(which requires PostHog already loaded).

**Alternatives**: EU-style mandatory banner everywhere (over-scoped for AU + internal employees);
kill-switch as a PostHog flag only (can't stop the SDK from loading).

## R11 — Performance guardrails (SC-005)

**Decision**: Mobile — init all three drivers **off the main thread** on a background dispatcher after
first frame; analytics/crash calls are async/batched; no synchronous network on any user action;
push-token registration is debounced and fire-and-forget. Web — dynamic import + consent gate (already
in place) keep PostHog off the guest critical path; the **bundle gate (174 KB) is re-run** and must not
regress. Backend — the worker is scheduled and off every request path; the one hot-path producer is a
single indexed INSERT inside an existing transaction. **Session replay OFF** (CPU/network/PII).

**Rationale**: The user's explicit constraint. Every measured budget (≤50 ms cold-start delta, no
bundle/Web-Vitals regression) is verified, not assumed.

**Alternatives**: eager init on the main thread (startup regression); session replay on (perf + PII
risk — deferred, opt-in).

## R12 — Regions, pricing, secrets & config layout

**Decision**: PostHog project region matches jurisdiction (**operator selects**; host recorded as
config). Firebase **FCM + Crashlytics are free** (Spark & Blaze — no message cap), so cost is not a
gate; the Firebase project stays on the plan the operator picks. Config split per the platform contract:

- **Secrets** (Secrets Manager): FCM **service-account JSON**; any PostHog **personal/server** key.
- **Params** (SSM `/effy/<env>/...`): `telemetry/posthog_host`, `telemetry/posthog_project_key`
  (client-embeddable), `telemetry/enabled` (kill switch), `notifications/fcm_project_id`.
- **Build-time client files**: Android `google-services.json`, iOS `GoogleService-Info.plist` — sourced
  per app/env, **git-ignored**, a **missing file fails the build loudly** (FR-031).

**Rationale**: Straight application of the platform config contract + Real-World-Identifiers rule; every
provider value is operator-supplied (quickstart), nothing inferred.

**Alternatives**: committing config files (leaks project identifiers; violates FR-031); baking keys into
source (violates FR-030).

---

### Resolved unknowns

No `NEEDS CLARIFICATION` remain. The three spec-level defaults (surface scope, session replay off,
consent model) are confirmed here (all-six for analytics; replay OFF, R11; consent model, R10).
