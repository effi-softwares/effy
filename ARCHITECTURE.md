# Effy — Application Architecture

How each application in the platform is structured **internally** — its layering, patterns, and the
conventions that hold the code together. This is the companion to the platform *shape* described in
[CLAUDE.md](CLAUDE.md) and [platform-brief.md](platform-brief.md) (what each surface is and does).
This doc answers a different question: **how is each app organized inside?**

This document is the **binding elaboration of Constitution Principle VI** (Layered Architecture &
Explicit Wiring). Every plan and implementation MUST conform to it. It is written generically — the
patterns are the law; concrete feature, service, and module names are decided per slice in `/plan`.

---

## Architecture at a glance

| Surface | Architectural style | Presentation / request pattern | Dependency wiring |
|---|---|---|---|
| Mobile apps (KMP) | **Clean Architecture** (data / domain / presentation per feature) | **MVVM** — a `ViewModel` exposing immutable observable state; the View calls its functions | Manual DI via one container |
| Backend services (serverless) | **Layered per-service** in a workspace monorepo | Handler → Service → Repository (+ event workers) | Cached module singletons + explicit imports |
| Customer web (SSR) | App-Router app — feature segments + a typed `lib/` service layer | Server Components for reads, client components for interaction | Context + client store + server-state cache |
| Operator / admin web (SPA) | **Feature-sliced SPA** (`features/*`) | Repository → query hooks → screen components | Server-state cache (+ router context) |
| Migrations | Flat, ordered, reversible SQL | `up` / `down` migration files | n/a |
| Infrastructure | **Module + per-environment-root** | Reusable modules composed by `envs/<env>` | Module inputs / outputs |

A handful of decisions repeat **by design** across every surface — they are what make the platform
feel like one system despite spanning three languages and three runtimes:

1. **Thin edge, logic in the middle, data access at the bottom.** Handler/UI → service/use-case →
   repository shows up in every backend service and (as presentation → domain ←
   data) every mobile feature. You always know where to look.
2. **Repository pattern with raw SQL — no ORM.** Every backend service hand-writes SQL inside repository
   modules; the mobile apps mirror this with a domain `Repository` interface and an HTTP-backed
   implementation. Wire shapes (DTOs / rows) are mapped **explicitly** to domain models and never
   escape the data layer.
3. **Explicit, greppable dependency wiring — no DI framework.** Backend services use cached module
   singletons and explicit imports; mobile wires the whole graph in one container. The dependency graph is always readable top-to-bottom.
4. **Auth at every boundary, pinned per pool.** Every client attaches a `Bearer` token; every backend
   verifies it against the correct user pool and structurally blocks cross-pool reuse.
5. **One event language.** Every service publishes the *same* event envelope to a shared topic;
   queue consumers are idempotent. This lets one service react to another without coupling.
6. **Unidirectional state on the clients.** Mobile uses MVVM with a single immutable, observable
   UI-state object per screen (state down, events up); web treats the server-state cache as the source of truth and keeps a
   client store only for genuine client state. Server data is never hand-cached in component state.
   ⚠ **No screen refreshes its data on a timer (071).** A screen reads when it opens, when it returns to the foreground,
   when its connection returns, when it is told something changed, and when the person asks. The telling is the live
   channel: the backend publishes the KIND of thing that changed (`@effy/edge-shared/live`, after commit, never
   throwing); web consoles invalidate the matching query keys (`features/live/routes.ts`), mobile ViewModels collect
   `LiveClient.changes(…)`. An update carries no data — the cache and the repositories stay the only source of it.

---

## Mobile apps (Kotlin Multiplatform + Compose)

All mobile apps share **one architecture with zero structural deviation** — a developer moves between
them freely. What differs is *which features exist*, not *how they're built*.

### Style: Clean Architecture, feature-sliced

Under the shared source set (`commonMain`), the top-level packages are:

```
app/         — DI container, root/nav ViewModels, navigation graph
core/        — cross-cutting: http/, platform/, presentation/ (the ViewModel base), theme/
features/    — one folder per feature, each with data/ + domain/ + presentation/
```

Each feature is split into the three Clean Architecture layers:

```
features/<feature>/
├── domain/                    # pure business contracts — no I/O, no framework
│   ├── <Feature>Repository.kt #   repository INTERFACE + a result/sealed type
│   ├── model/                 #   immutable domain models
│   └── usecase/               #   UseCase classes: suspend operator fun invoke()
├── data/                      # the I/O implementations
│   ├── Http<Feature>Repository.kt  #   client-backed implementation of the interface
│   └── dto/                   #   @Serializable DTOs + toDomain() mappers
└── presentation/             # MVVM: ViewModel + immutable UI state + screen composables
    └── <Feature>ViewModel.kt  #   a ViewModel exposing StateFlow<UiState> + action functions
```

**Dependency rule:** `presentation → domain ← data`. The domain layer depends on nothing; data
implements domain's interfaces; presentation talks to domain use cases. DTOs are mapped to domain
models via `toDomain()` and never leak out of `data/`.

### Presentation: MVVM (unidirectional, immutable state)

The apps use **MVVM**: each screen has a `ViewModel` that exposes a single **immutable, observable
UI-state object** (a `StateFlow<UiState>`), and the View invokes `ViewModel` functions for user
actions. State flows down; events flow up. The flow is unidirectional — the View never mutates state
directly, and the `ViewModel` never reaches into the View.

A screen's `ViewModel` (generic sketch):

```kotlin
class ExampleViewModel(private val repo: ExampleRepository) : ViewModel() {
    private val _state = MutableStateFlow(ExampleUiState())
    val state: StateFlow<ExampleUiState> = _state.asStateFlow()

    // User actions are ViewModel functions. Each launches on viewModelScope and updates the single
    // immutable state object with copy(); errors map to a closed, user-facing error type.
    fun load() {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { repo.fetch() }
                .onSuccess { _state.value = _state.value.copy(loading = false, items = it) }
                .onFailure { _state.value = _state.value.copy(loading = false, error = it.toUiError()) }
        }
    }
}
```

Each screen defines:
- **State** — one immutable `data class` holding everything the screen renders.
- **ViewModel functions** — the actions the user can take (`load()`, `submit()`, …).

The View renders `state` (a `StateFlow`, collected with `collectAsState`) and calls the `ViewModel`
functions. The `ViewModel` is obtained through the `viewModel { … }` factory (a real `ViewModelStore`,
so `viewModelScope` is cancelled on disposal). (A typed-Intent + one-off-Effect / MVI variant is **not**
required — see constitution v1.8.0.)

### Cross-cutting infrastructure (`core/`)

- **Networking** — one factory builds the HTTP client with content negotiation (JSON, ignore-unknown
  keys), timeouts, logging, and a **custom auth plugin** that attaches `Authorization: Bearer <token>`
  to every request. An app talking to more than one backend builds one client per base URL.
- **Auth bridge** — a token provider wraps the platform auth callback into a `suspend fun
  accessToken()`. The auth SDK itself lives behind a platform driver interface (`expect`/`actual`),
  implemented separately per native target.
- **Platform drivers** — `commonMain` declares native-capability interfaces (auth, payments, photo
  picker, …) as `expect`/`actual`; each native target provides the `actual` implementation. This is
  how shared code reaches native SDKs and OS facilities.
- **Navigation** — routes are type-safe `@Serializable` objects/classes in sealed hierarchies; the nav
  host owns the back stack and swaps the auth ↔ protected graphs based on session state.

### Dependency injection: one manual container

No DI framework. A single container holds every repository, use-case bundle, and store; a
`createDependencies(platformDrivers…)` function wires the whole graph by hand (generic sketch):

```kotlin
val httpClient = buildHttpClient(appConfig, tokenProvider(platformAuthDriver))
val featureRepository = HttpFeatureRepository(httpClient)
val featureUseCases = FeatureUseCases(getItems = GetItemsUseCase(featureRepository), …)
return Dependencies(featureRepository, featureUseCases, /* … */)
```

---

## Backend services (serverless)

**The platform has one backend** (constitution v3.0.0, Principle III). Every server behaviour —
public and customer reads, checkout and payment, operator and back-office workflows, asynchronous
workers — runs here. An always-on Go service once carried shopper traffic; feature 070 retired it.

A workspace monorepo: shared **packages** (libraries) + deployable **services**. Each service deploys
independently with its own config.

### Style: layered per-service, shared via packages

A sync HTTP service has a three-layer shape:

```
services/<service>/src/
├── functions/     # one handler file per route (+ a shared error/parse/auth helper)
├── service.ts     # domain logic + validation + any audit writes
├── repository.ts  # raw SQL via a tagged template + explicit row → domain mappers
├── validate.ts    # manual field validation → typed field errors (no schema lib)
└── types.ts       # domain types + a domain exception type
```

A handler owns its **own** auth check, parsing, and error mapping — **no middleware framework**
(generic sketch):

```typescript
export const handler = async (event) => {
  if (!hasAnyGroup(event, WRITE_GROUPS)) return error(403, "insufficient role");
  const body = parseJson<CreateInput>(event.body);
  if (!body) return error(400, "invalid json body");
  try { return created(await service.create(body, userId(event))); }
  catch (err) { return mapError("create item", err); }
};
```

### Shared packages

| Package role | What it provides |
|---|---|
| DB client | A cached client (one connection per container) reused across warm invocations. |
| HTTP helpers | Response builders + claim extractors that read the gateway authorizer context. |
| Logger | A structured-logging singleton tagged with the function name. |
| Events | An event publisher with the **shared envelope** (event type, id, dedup key, …) and an attribute used for topic filter policies. Every service publishes this one envelope. |
| Storage | Bucket-scoped helpers (presign upload/download, head, copy, delete). |
| Assets | Image lifecycle: presign to a pending location, then promote to fixed variants; resolve public URLs. |
| Notifications | Transactional **email + push** (FCM / APNs) sender + template renderer. |

### Two service shapes: sync HTTP vs async worker

- **Sync HTTP (every audience)** — attaches to one of **two HTTP gateways** and gates each route with
  the **per-pool JWT authorizer** for its audience, with record-backed authorization inside the
  handler. The **shared** gateway serves customer, driver, shop and public routes; the **staff**
  gateway serves back-office and carries only the back-office authorizer (075, constitution v3.2.0),
  so the audience boundary holds per gateway as well as per route. A service used by two audiences
  on two gateways is two stacks from one source directory (`inventory`). How full each gateway is
  is measured and alarmed ([docs/api/path-assignment.md](docs/api/path-assignment.md)). **Public routes** (catalogue reads, cart preview,
  health) simply omit the authorizer; an authorizer is per-route and all-or-nothing, so a capability
  offered to both guests and signed-in shoppers is two routes. Services are split **by audience and
  domain** — one audience per service is preferred. Cold starts are accepted.
  - **Shopper-facing services connect as a dedicated, connection-limited database role**, so a burst
    of shopper traffic is refused at the database (and answered as a retryable 503) rather than
    exhausting the connections staff, shop and driver services share.
  - **Logic needed by more than one service lives in the shared library**, on its own import path
    where it carries a heavy dependency — the payment module is the example: three services move
    money, one module implements it.
- **Async event workers** — no HTTP auth:
  - A **webhook** with its own endpoint and **no authorizer** (it verifies a provider signature
    instead), then publishes a domain event.
  - **Queue consumers** that subscribe to domain events and act (create downstream records over an
    internal endpoint, render and send notifications, …).

Both worker kinds are **idempotent**: a processed-events table claims each dedup key with
`INSERT … ON CONFLICT DO NOTHING`; on failure the claim is released so the queue retry reprocesses
safely.

### Config, validation, deploy

Everything is configured from the **parameter store** at deploy time (DB URL, bucket names, gateway /
authorizer ids, topic / queue ARNs, secrets). Validation is **manual** to keep bundles small. Each
function is bundled individually and gets a **per-function least-privilege role**.

---

## Customer web (SSR)

App-Router app. SSR for public / SEO pages, client interactivity for cart and checkout. Code splits
into route segments, feature UI, and a typed service layer (`lib/`).

### Routing: file-based segments + route groups

```
app/
├── (shop)/      # PUBLIC, server-rendered for SEO: storefront, product, search, cart
├── (auth)/      # public: sign-in/up, confirm, reset, legal — the ONLY place the auth SDK is configured
├── (account)/   # AUTH-GATED: profile, orders, addresses, checkout
└── layout + client providers
```

Route groups share a layout without adding URL segments. Public pages are **Server Components** that
fetch at render time (cached, with tag-based revalidation); interactive pieces are client components
(forms, cart, the payment form).

**The auth SDK is quarantined to `(auth)`.** Configuring it in the root layout — which is what the
vendor's own docs suggest — puts it in the **shared client chunk that every page loads**, including
guest pages, and blows the public-surface bundle budget by construction. Guest routes read session
state **server-side only**; a dependency rule fails the build if a guest route imports it.

### Data layer: dual fetch clients

- A **server-side** client: read-only, supports cache tags + revalidation; used by Server Components
  for public reads (no auth).
- A **browser-side** client: full CRUD, pulls a fresh token before each request, no-store.

Domain wrappers sit on top, with DTO→domain converters.

### State

- A lightweight **client store** for genuine client state only — the session union (checking /
  signed-out / signed-in / error) and the cart (persisted to local storage, snapshotting each line so
  a later price change doesn't silently mutate the cart).
- The **server-state cache** for all server data (orders, addresses, profile).

### SSR auth guard: optimistic proxy + an authoritative Data Access Layer

**Amended by 011** (was: "edge middleware runs the auth server-context per request to guard the
auth-gated segment"). Next.js 16 renames `middleware.ts` → **`proxy.ts`** (Node runtime, not Edge),
and its own authentication guide is explicit that a proxy check **"should not be your only line of
defense… the majority of security checks should be performed as close as possible to your data
source."** It further warns against auth checks in **layouts**, which do not re-render on navigation.
So the guard is **two-tier**:

- **`proxy.ts` — optimistic only.** A cookie-presence check on the auth-gated segments, to redirect
  early and preserve a **validated** `next` target (same-origin relative path; reject `//…` and any
  scheme — open redirect is the standard bug here). Its matcher is an **allowlist of protected
  segments**, so public routes never run it. It performs **no** database or network check.
- **A Data Access Layer (`lib/dal.ts`, `import 'server-only'`) — authoritative.** It verifies the
  session and consults the platform's own record (status is platform-owned and decides access), and it
  is called by **every** protected page, Server Action, and Route Handler. **Server Actions are treated
  as public endpoints, because that is what they are.**

### Personalization without losing the cache

A personalized fragment (cart badge, "Hi <name>") **must not** make a public page dynamic. The page
body is cached (`use cache`) and prerenders into a **static shell**; the personalized fragment is a
**Server Component inside `<Suspense>`** that reads cookies at request time and **streams in**. One
response, no extra client JS, no layout shift, and the public content stays cacheable and indexable.
**`cookies()`/`headers()` are never called above a Suspense boundary** — doing so defers the whole app
to request time and silently destroys the static shell for every page.

---

## Operator / admin web (SPA)

Client-only SPAs (no SSR; all auth in the browser), **feature-sliced**:

```
src/
├── features/<domain>/   # the core unit:
│   ├── repo.ts          #   API repository over one authed fetch wrapper + DTO↔domain
│   ├── queries.ts       #   server-state hooks (query/mutation) + query keys
│   ├── model.ts         #   types / domain models
│   └── <Screen>.tsx     #   the screen(s)
├── lib/                 # authed fetch wrapper, auth config, the server-state client, helpers
├── components/ui/       # design-system components
└── router + entry
```

### Routing & state

- Routes are a **programmatic tree**: a public auth layout (sign-in / verify) plus a **protected
  layout** whose `beforeLoad` ensures a session and redirects to sign-in otherwise. The router context
  carries the server-state client so route loads can prime data.
- **Server-state cache for all server data; a minimal client store (TanStack Store) for genuine
  client state only** (theme, command-palette, hotkey scope) — server data is never hand-cached
  there. The session itself is a query; mutations update the cache directly. Each feature's
  `repo.ts` calls the fetch wrapper; its `queries.ts` wraps those calls and invalidates on success.
- **Forms** use a form library + schema validation, colocated with the form.
- A **shared data-table layer** (sorting, client *or* server pagination, filtering, selection) is added
  where a console is list/CRUD-heavy; form/detail-heavy consoles skip it.

---

## Migrations

Intentionally tiny: a folder of **ordered, reversible plain-SQL files** plus a task runner. No app
code, no app coupling.

- Each file is numbered with `up` / `down` sections.
- **Two schemas:** an operational schema (customers, drivers, shops, products, inventory, images,
  orders, payments, deliveries, …) and an admin schema (back-office accounts + audit log).
- **Run out-of-band**, never inside an app binary — locally against a developer database, and in CI as
  a pre-deploy step (the DB credential is fetched from the parameter store with decryption so it never
  lands in shell history).

---

## Infrastructure

Structured as **reusable modules composed by per-environment roots** (the standard "module +
env-root" layout — deliberately not one monolithic root with workspaces, and not a wrapper tool).

```
infra/
├── bootstrap/   # one-time, LOCAL state: creates the remote-state bucket + lock
├── modules/     # reusable building blocks, one concern each (network, db, compute, registry,
│                #   auth pools, object storage, topic, queues, parameter store, secrets,
│                #   web hosting, DNS, certs)
├── envs/        # per-environment roots that wire modules together (dev / staging / prod)
└── scripts/
```

- **Module design:** each module takes inputs, produces outputs, and **never calls another module** —
  composition happens only in the env roots, keeping the dependency graph flat and explicit.
- **State:** remote, with a lock, provisioned once by `bootstrap/` (which runs on local state — the
  chicken-and-egg solution).
- **The infra ↔ app contract is the parameter store.** Infra *writes* parameters (DB URL, bucket
  names/ARNs, pool ids, gateway/authorizer ids, topic/queue ARNs); the backends and migrations *read*
  them. Adding or renaming a parameter is a breaking change to that contract. Telemetry credentials
  (FCM service account, PostHog project keys) live in **secrets**, with their non-secret
  config (PostHog host) in the parameter store.

---

## Observability, Telemetry & Notifications

Beyond structured logs, the platform carries three cross-cutting concerns — **operational
observability** (is the system healthy?), **product analytics** (how do users behave?), and **outbound
notifications** (how do we reach users?). Each is a first-class capability with a defined home.

| Capability | Tool | Surfaces | Where it plugs in |
|---|---|---|---|
| **Metrics and alerts** | CloudWatch | backend + infra | Services emit embedded-format metrics through one shared helper; alarms are declared in Terraform and notify the alerts topic. |
| **Crash reporting** | Crashlytics | mobile apps | A `core/platform/` native driver (Android + iOS): init + non-fatal logs. |
| **Web error tracking** | PostHog | web apps | Runtime errors/exceptions captured alongside analytics. |
| **Product analytics** | PostHog | all clients (mobile + web) | A shared analytics capability emitting a typed event taxonomy. |
| **Push notifications** | FCM (+ APNs for iOS) | mobile apps | Device-token registration → the notifications worker's push channel. |
| **Structured logs** | platform logger | backend | One structured-logging singleton per service (see above). |

### Operational metrics (CloudWatch)

Services emit **CloudWatch embedded-format metrics** through one shared helper: per-feature business
counters under a namespace per service (`Effy/<Service>`). Request rate, errors and duration come
from the platform's built-in per-function metrics — one function per route makes them
per-operation. **Alarms** on customer-facing flows are declared in Terraform beside the environment
and notify the existing alerts topic, whose endpoint is the operator's approved operational
mailbox. There is no self-hosted metrics stack and no `/metrics` endpoint; none was ever built.
**No PII and no high-cardinality values in metric dimensions** — dimensions are bounded
(route, status class, feature), never user ids or free text.

### Crash & error reporting

- **Mobile — Crashlytics.** Crash and non-fatal reporting on all three apps via a `core/platform/`
  `expect`/`actual` driver (init + a `logNonFatal()` entry point), implemented per native target —
  exactly like the auth / payments / photo-picker drivers. Build-time, Crashlytics needs the Android
  Gradle plugin and iOS dSYM upload (configured per app, not in shared code). **No PII** in crash keys
  or breadcrumbs beyond the authenticated subject id.
- **Web — PostHog.** The web apps route runtime errors / exceptions to PostHog (the same SDK used for
  analytics), so web error tracking and product analytics share one pipeline.

### Product analytics (PostHog)

Every client — the three mobile apps and the three web apps — emits product events through a **shared
analytics capability** (on mobile, a thin `core/platform/` driver over the PostHog SDK; on web, the
PostHog browser SDK behind a small wrapper). Events follow a **typed, shared event taxonomy** so names
stay consistent across surfaces (screen / page views; funnels such as catalog → cart → checkout;
feature usage). Analytics is **consent-respecting** and carries **no PII** beyond the authenticated
subject id. Product analytics (behavior) is kept conceptually separate from operational metrics
(system health) — different tools, different audiences.

### Push notifications (FCM + APNs)

Push is an **outbound channel of the notifications path**, not an ad-hoc per-feature call:

- **Token registration.** A mobile app obtains its device token via a `core/platform/` native driver
  (FCM on Android, APNs-via-FCM on iOS) and registers it through the customer (or driver / shop) service, which persists it
  to a **device-tokens table** (keyed by the authenticated subject).
- **Sending.** The **notifications worker** gains a **push channel** alongside email: on the
  relevant domain events it looks up the recipient's tokens and sends targeted push (order updates to
  customers, dispatch to drivers). It stays **idempotent** like every other worker.
- **Config.** FCM service-account credentials live in secrets; iOS delivery is via APNs configured
  through FCM. (Web push is a possible future channel; out of scope for now.)

---

## Why the platform feels coherent

Despite three languages and three runtimes, the same handful of decisions repeat by design:

1. **Thin edge, logic in the middle, data access at the bottom** — the same slice everywhere.
2. **Repository pattern, raw SQL, no ORM** — wire shapes mapped explicitly to domain models.
3. **Explicit dependency wiring** — no DI container anywhere; the whole graph is greppable.
4. **Auth everywhere, pinned per pool** — cross-pool token reuse is structurally blocked.
5. **One event language** — a shared envelope + idempotent consumers.
6. **Unidirectional state on the clients** — MVVM (immutable observable state) on mobile; the server-state
   cache as the source of truth on web, with a client store only for genuine client state.
