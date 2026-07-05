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
| Mobile apps (KMP) | **Clean Architecture** (data / domain / presentation per feature) | **MVVM** — unidirectional: a `ViewModel` base with State + Intent + Effect | Manual DI via one container |
| Hot-path API (Go) | **Layered, feature-sliced** (`features/` + a shared `platform/` layer) | Handler → Service → Repository | Manual DI at the entry point |
| Cold-path services (serverless) | **Layered per-service** in a workspace monorepo | Handler → Service → Repository (+ event workers) | Cached module singletons + explicit imports |
| Customer web (SSR) | App-Router app — feature segments + a typed `lib/` service layer | Server Components for reads, client components for interaction | Context + client store + server-state cache |
| Operator / admin web (SPA) | **Feature-sliced SPA** (`features/*`) | Repository → query hooks → screen components | Server-state cache (+ router context) |
| Migrations | Flat, ordered, reversible SQL | `up` / `down` migration files | n/a |
| Infrastructure | **Module + per-environment-root** | Reusable modules composed by `envs/<env>` | Module inputs / outputs |

A handful of decisions repeat **by design** across every surface — they are what make the platform
feel like one system despite spanning four languages and three runtimes:

1. **Thin edge, logic in the middle, data access at the bottom.** Handler/UI → service/use-case →
   repository shows up in the hot-path API, every cold-path service, and (as presentation → domain ←
   data) every mobile feature. You always know where to look.
2. **Repository pattern with raw SQL — no ORM.** Every backend hand-writes SQL inside repository
   modules; the mobile apps mirror this with a domain `Repository` interface and an HTTP-backed
   implementation. Wire shapes (DTOs / rows) are mapped **explicitly** to domain models and never
   escape the data layer.
3. **Explicit, greppable dependency wiring — no DI framework.** Backends wire dependencies by hand at
   the entry point; mobile wires the whole graph in one container; cold-path services use cached
   module singletons. The dependency graph is always readable top-to-bottom.
4. **Auth at every boundary, pinned per pool.** Every client attaches a `Bearer` token; every backend
   verifies it against the correct user pool and structurally blocks cross-pool reuse.
5. **One event language across backends.** Both backends publish the *same* event envelope to a shared
   topic; queue consumers are idempotent. This lets the cold path react to the hot path without
   coupling.
6. **Unidirectional state on the clients.** Mobile uses MVVM as a strict unidirectional state machine
   (State / Intent / Effect); web treats the server-state cache as the source of truth and keeps a
   client store only for genuine client state. Server data is never hand-cached in component state.

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
└── presentation/             # UI state machine
    └── <Feature>ViewModel.kt  #   extends the shared ViewModel base
```

**Dependency rule:** `presentation → domain ← data`. The domain layer depends on nothing; data
implements domain's interfaces; presentation talks to domain use cases. DTOs are mapped to domain
models via `toDomain()` and never leak out of `data/`.

### Presentation: MVVM as unidirectional data flow

The apps use **MVVM** implemented strictly: it is `ViewModel`-based, but state is a single immutable
object mutated only through a reducer, and the View communicates back exclusively via typed Intents.
One-off side effects (navigation, transient messages) are emitted separately so they fire once.

A shared base class in `core/presentation/` formalizes the contract (generic sketch):

```kotlin
abstract class BaseViewModel<UiState : Any, UiIntent : Any, UiEffect : Any>(
    initialState: UiState,
) : ViewModel() {
    private val _uiState = MutableStateFlow(initialState)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private val _effects = MutableSharedFlow<UiEffect>(extraBufferCapacity = 1)
    val effects: SharedFlow<UiEffect> = _effects.asSharedFlow()

    abstract fun onIntent(intent: UiIntent)
    protected fun updateState(reducer: (UiState) -> UiState) = _uiState.update(reducer)
    protected suspend fun emitEffect(effect: UiEffect) = _effects.emit(effect)
}
```

Each screen defines three types:
- **State** — one immutable `data class` holding everything the screen renders.
- **Intent** — a `sealed interface` of everything the user can do.
- **Effect** — a `sealed interface` of one-off side effects, delivered over a `SharedFlow`.

The View renders `uiState` (a `StateFlow`), sends `onIntent(...)`, and collects `effects`.

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

## Hot-path API (Go)

A single binary. **Layered and feature-sliced**, with a strict separation between **domain features**
and **shared infrastructure**.

### Style: feature packages + a platform layer

```
cmd/<entrypoint>/    # main, route registration, middleware

internal/
├── features/        # one package per domain — each owns handler + service + repository + types
└── platform/        # shared infrastructure — NOT domain logic:
    #   auth/ (per-pool JWT verifier + middleware), config/, db/ (one pool),
    #   logger/, httpx/ (JSON response/error helpers), events/ (event publisher),
    #   plus integration wrappers, scan helpers, asset URL resolution, health.
```

### The three-layer slice (per feature)

Handlers stay thin, services hold logic, repositories hold SQL (generic sketch):

```go
// handler.go — HTTP only: parse, call service, write response
func listItems(svc *Service) gin.HandlerFunc { /* … svc.ListPage(ctx, q) … */ }

// service.go — business rules: validate, clamp, orchestrate; no HTTP, no SQL
func (s *Service) ListPage(ctx context.Context, q ListQuery) (Page, error) { /* … s.repo.ListPage(ctx, q) */ }

// repository.go — SQL only: raw query constants + driver scanning
const qInsert = `INSERT INTO <table> (...) VALUES (...) RETURNING id, status, created_at`
```

SQL lives as named string constants in each repository (including row-locking reads such as `SELECT …
FOR UPDATE` where a transaction needs it). There is **no ORM and no query builder** — just the raw
driver. Services expose small interfaces for their collaborators so they're unit-testable with fakes.

### Request pipeline

Middleware installs, in order: request-ID → request logging → panic recovery → CORS → **per-pool
auth**. The auth middleware selects a JWT verifier by **URL path prefix**:

| Path class | Verifier |
|---|---|
| public reads (e.g. catalog) | none |
| customer-scoped routes | customer pool |
| driver-scoped routes | driver pool |
| store-scoped routes | store pool |
| service-to-service routes | a shared internal secret (constant-time compare) |

### Auth: per-pool JWT verification

One verifier is built per pool. Each fetches and caches the pool's signing keys, parses tokens
**RS256-only**, and validates issuer, audience/client, and expiry. Claims (subject, email, user type,
groups) are injected into the request context. **A missing pool configuration makes the matching
routes reject-all** rather than run unauthenticated. Group-based RBAC is enforced from the groups
claim.

### Wiring & config

Dependencies are constructed by hand at the entry point (pool, verifiers, event publisher, integration
clients, asset resolver) and handed to a `registerFeatures()` step that calls each feature's
`NewService(NewRepository(pool), …)`. Config is a single struct loaded from the environment; optional
integrations **degrade gracefully** when unset.

---

## Cold-path services (serverless)

A workspace monorepo: shared **packages** (libraries) + deployable **services**. Each service deploys
independently with its own config.

### Style: layered per-service, shared via packages

A sync HTTP service has the same three-layer shape as a hot-path feature:

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
| Events | An event publisher with the **shared envelope** (event type, id, dedup key, …) and an attribute used for topic filter policies. **The same envelope shape the hot path publishes** — the backends speak one event language. |
| Storage | Bucket-scoped helpers (presign upload/download, head, copy, delete). |
| Assets | Image lifecycle: presign to a pending location, then promote to fixed variants; resolve public URLs. |
| Notifications | Transactional **email + push** (FCM / APNs) sender + template renderer. |

### Two service shapes: sync HTTP vs async worker

- **Sync HTTP (ops / operator / admin CRUD)** — attaches to a shared HTTP gateway and gates each route
  with a **per-pool JWT authorizer** (admin pool for admin work, store pool for operator work), with
  group-based RBAC. Cold starts are accepted in exchange for one consistent ops stack.
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
├── (public)/    # server-rendered for SEO: storefront, product, search, cart
├── (auth)/      # public: sign-in/up, confirm, reset, legal
├── (account)/   # AUTH-GATED: profile, orders, addresses, checkout
└── layout + client providers
```

Route groups share a layout without adding URL segments. Public pages are **Server Components** that
fetch at render time (with incremental revalidation); interactive pieces are client components (forms,
cart, the payment form).

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
- **SSR auth guard:** edge middleware runs the auth server-context per request to guard the auth-gated
  segment and redirect unauthenticated users (preserving a validated `next` target).

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
- **Server-state cache only** — no separate client store. The session itself is a query; mutations
  update the cache directly. Each feature's `repo.ts` calls the fetch wrapper; its `queries.ts` wraps
  those calls and invalidates on success.
- **Forms** use a form library + schema validation, colocated with the form.
- A **shared data-table layer** (sorting, client *or* server pagination, filtering, selection) is added
  where a console is list/CRUD-heavy; form/detail-heavy consoles skip it.

---

## Migrations

Intentionally tiny: a folder of **ordered, reversible plain-SQL files** plus a task runner. No app
code, no app coupling.

- Each file is numbered with `up` / `down` sections.
- **Two schemas:** an operational schema (customers, drivers, stores, products, inventory, images,
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
│                #   web hosting, DNS, certs, metrics stack — Prometheus + Grafana on ECS)
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
  (FCM service account, PostHog project keys, Grafana admin) live in **secrets**, with their non-secret
  config (PostHog host, Grafana URL) in the parameter store.

---

## Observability, Telemetry & Notifications

Beyond structured logs, the platform carries three cross-cutting concerns — **operational
observability** (is the system healthy?), **product analytics** (how do users behave?), and **outbound
notifications** (how do we reach users?). Each is a first-class capability with a defined home.

| Capability | Tool | Surfaces | Where it plugs in |
|---|---|---|---|
| **Metrics** | Prometheus + Grafana | backends + infra | Hot-path API exposes `/metrics`; Prometheus scrapes it; Grafana dashboards + alerts. Cold-path metrics via CloudWatch. |
| **Crash reporting** | Crashlytics | mobile apps | A `core/platform/` native driver (Android + iOS): init + non-fatal logs. |
| **Web error tracking** | PostHog | web apps | Runtime errors/exceptions captured alongside analytics. |
| **Product analytics** | PostHog | all clients (mobile + web) | A shared analytics capability emitting a typed event taxonomy. |
| **Push notifications** | FCM (+ APNs for iOS) | mobile apps | Device-token registration → the notifications worker's push channel. |
| **Structured logs** | platform logger | backends | One structured-logging singleton per backend (see above). |

### Operational metrics (Prometheus + Grafana)

The hot-path API exposes a **`/metrics` endpoint** in the Prometheus exposition format, fed by a
**metrics middleware** in the `platform/` layer (a sibling to the logger): request rate / latency /
error counts, DB-pool saturation, and per-feature business counters. **Prometheus** and **Grafana**
run **self-hosted on ECS/Fargate** (their own infra modules) with persistent storage; Prometheus
scrapes the API's `/metrics`, and Grafana hosts the dashboards and **alerts** on customer-facing
flows. Cold-path Lambda metrics come from **CloudWatch**, surfaced in the same Grafana via a CloudWatch
datasource. **No PII and no high-cardinality values in metric labels** — labels are bounded dimensions
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
  (FCM on Android, APNs-via-FCM on iOS) and registers it through a hot-path endpoint, which persists it
  to a **device-tokens table** (keyed by the authenticated subject).
- **Sending.** The cold-path **notifications worker** gains a **push channel** alongside email: on the
  relevant domain events it looks up the recipient's tokens and sends targeted push (order updates to
  customers, dispatch to drivers). It stays **idempotent** like every other worker.
- **Config.** FCM service-account credentials live in secrets; iOS delivery is via APNs configured
  through FCM. (Web push is a possible future channel; out of scope for now.)

---

## Why the platform feels coherent

Despite four languages and three runtimes, the same handful of decisions repeat by design:

1. **Thin edge, logic in the middle, data access at the bottom** — the same slice everywhere.
2. **Repository pattern, raw SQL, no ORM** — wire shapes mapped explicitly to domain models.
3. **Explicit dependency wiring** — no DI container anywhere; the whole graph is greppable.
4. **Auth everywhere, pinned per pool** — cross-pool token reuse is structurally blocked.
5. **One event language across backends** — a shared envelope + idempotent consumers.
6. **Unidirectional state on the clients** — MVVM (State/Intent/Effect) on mobile; the server-state
   cache as the source of truth on web, with a client store only for genuine client state.
