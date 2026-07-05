# Effy Platform Brief

> **What this is:** The product/business framing for Effy — the reference every feature spec and the
> constitution draw from. It states WHAT Effy is and WHY, with just enough architecture context to
> anchor the constitution. Specs themselves stay tech-free; this brief is the product north-star.

---

## 1. The one-line summary
Effy is a **single-brand, vertically-integrated grocery + e-commerce delivery platform**. Customers
shop from one brand ("Effy"); fulfillment happens behind the scenes from **hidden internal stores**;
**drivers and back-office staff are Effy employees**. Built spec-first from a clean foundation.

## 2. The product model (what makes Effy specific)
- **One brand, no storefront marketplace.** Customers browse and buy from "Effy" — they never see,
  choose, or even know about individual stores.
- **Stores are hidden internal fulfillment nodes** (dark-store-like). They hold inventory and fulfill
  orders, but they are an internal concern, invisible to the customer.
- **Drivers and back-office staff are Effy employees.** They use internal apps; there is no public
  self-signup for these audiences.
- **Four audiences, four trust levels:** customer, driver, store/operator, admin/back-office.

## 3. The audiences & their core jobs
- **Customers** — browse the catalog, search, build a cart, check out, track orders, reorder.
- **Drivers** — receive dispatched deliveries, navigate, capture proof-of-delivery.
- **Stores / operators** — manage store profile, products, inventory, and fulfill orders (internal,
  hidden from customers).
- **Admin / back-office** — manage users / drivers / stores / catalog, with RBAC, audit, and
  merchandising (featured/recommended, category taxonomy).

## 4. Surfaces
The customer and store audiences each get **two surfaces kept at feature parity** (a native mobile
build and a native web build — both native because the team prefers a native web implementation over
a cross-platform web target).
- **Mobile (3):** customer app, driver app, shop (store-operator) app.
- **Web (3):** customer-web storefront, store-web operator console, back-office admin console.
- **Backends (2):** a Go hot-path API and a TypeScript serverless cold-path fleet.
- **Plus:** database (PostgreSQL) and infrastructure-as-code (Terraform).

## 5. What success looks like
A **complete, usable platform** where every audience's core flows work end-to-end —
**catalog → cart → checkout → orders → dispatch → delivery → proof-of-delivery** — and the six
surfaces stay consistent because cross-cutting logic, types, contracts, and design live in shared
packages. Adding a feature should be fast and land coherently across every surface that needs it.

## 6. Architecture choices (anchors for the constitution)
- **Monorepo + shared packages** as the single source of truth: design-system, api-client,
  shared-types, config. Cross-cutting changes happen once.
- **Dual-path backend:** latency-sensitive customer reads/transactions on the **hot path** (Go +
  Gin + pgx on Fargate); ops/admin/operator CRUD and async workers on the **cold path** (TS Lambdas).
  An **SNS → SQS** event backbone decouples the two and drives fulfillment fan-out.
- **Clean Architecture everywhere; MVVM on mobile** (KMP + Compose Multiplatform).
- **Auth:** four isolated AWS Cognito pools (customer / driver / store / admin), **passwordless
  EMAIL_OTP across all four**, per-pool JWT validation, no auth proxy. Admin pool has RBAC groups.
- **Data:** PostgreSQL 16, raw SQL, Goose migrations, **no ORM**.
- **Infra:** Terraform, multi-environment, remote state.
- **Observable & measurable from day one:** structured logs + Prometheus/Grafana metrics & alerts on
  the backends; Crashlytics crash reporting on mobile; PostHog product analytics (and web error
  tracking) across clients; push via FCM + APNs.
- **Design:** one design-system package — Jade brand (#0FB57E / fill #047857), native-feel mobile,
  dark mode required.

## 7. Constraints & context
- **Team:** solo / very small.
- **Environment:** dev only for now — **no production users or data yet.** A true clean build with no
  migration or cutover concerns.
- **Bias:** favor momentum. Ship one working vertical slice, learn, then scale the pattern.

## 8. First slice & sequencing (the de-risking control)
- **First slice: Auth + customer onboarding, end-to-end** (Cognito customer pool → KMP app + web →
  Go hot path → DB profile). Proves 4-pool auth + dual-path + monorepo + shared packages all at once,
  and unblocks everything else.
- **Second slice:** customer catalog browse (read-heavy hot path).
- Then build the remaining surfaces one vertical slice at a time, by business priority.
- **Rule:** don't build all six surfaces in parallel. One vertical slice proves the foundation before
  the pattern scales — so if an approach proves slow, we learn it in weeks, not months.

## 9. Non-negotiables (these become constitution articles)
- Spec-driven development for every feature. Monorepo with shared contracts as the source of truth.
- Dual-path backend discipline. 4-pool auth isolation with passwordless EMAIL_OTP. No ORM.
- Native-feel mobile. Jade brand + dark mode. One design system across all surfaces.

## Open questions parking lot
- OPEN: Order of surfaces after the customer slice (driver vs store vs back-office) — by business
  priority.
- OPEN: Per slice, decide in `/plan` how much to build fresh vs. lift from reference patterns.
