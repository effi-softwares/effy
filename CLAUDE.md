# Effy (CLAUDE.md)

Effy is a **single-brand, vertically-integrated grocery + e-commerce delivery platform**. We build
it **spec-first** using **GitHub Spec Kit**. Read this before doing anything.

## What Effy is (the product model)
- Customers buy from **one brand: "Effy."** There is no marketplace of named storefronts.
- **Shops are hidden internal fulfillment nodes** (dark-store-like). Customers never see or pick a
  shop — the platform decides fulfillment behind the scenes.
- **Drivers and back-office staff are Effy employees**, working in internal apps (no public signup).
- Four audiences, each with its own trust level: **customer, driver, shop/operator, admin/back-office.**

### Driver logistics model (hub-and-spoke — settled 2026-08-22, feature 049)
Effy's own drivers are **not per-delivery couriers** (no Uber-Eats one-order-one-drop flow). They run a
**hub-and-spoke** operation built on 047's collection-run + operating-hub concepts:
- **Collection run (shops → hub):** an on-duty driver is assigned **packages to collect** and drives a
  round of fulfillment shops, picking up **all** assigned packages (both same-day and standard), then
  **checks them in at a single central Effy hub/warehouse**. Collection runs follow the **configurable
  collection schedule** 047 already defines (e.g. a 2 pm cutoff), which is what gates same-day
  eligibility at checkout.
- **Sortation is a known fact, not a manual step:** each package's method (**same-day vs standard**) is
  already chosen at **checkout** (047). The hub check-in surfaces the split; the driver does not
  classify anything.
- **Same-day delivery run (hub → customers):** the driver takes the **same-day** packages and does a
  multi-drop delivery round, completing each drop with proof.
- **Standard delivery is (mostly) an external carrier's job.** This **evolves 047's "Effy does all
  delivery"**: Effy drivers own **collection + same-day delivery**; a **standard** package's driver-app
  lifecycle **ends at "checked in at hub"**, after which it is handed to a third-party delivery company.
- **Work is typed tasks, not driver roles** (`collection` / `same_day_delivery`); one driver typically
  does a collection run then a same-day round in one shift, but neither is a hard-coded role.
- **One hub for now** (matches 047's single operating-hub point); multi-hub is deferred.

## Platform shape (the vision)
The full platform is **six client surfaces + two backends + DB migrations + infrastructure**. The
customer and shop audiences each get **two surfaces kept at parity** (a native mobile build and a
native web build).

- **Mobile (3):** `customer` / `driver` / `shop` — Kotlin Multiplatform + Compose Multiplatform
  (shared iOS/Android), **Clean Architecture + MVVM**, Ktor client, AWS Amplify (Cognito).
- **Web (3):** `customer-web` (Next.js 16 SSR, customer storefront), `shop-web` (Vite SPA, shop
  operator console), `back-office` (Vite SPA, internal admin) — React 19 + TypeScript, shadcn/ui +
  Tailwind v4, the TanStack suite (Router/Query/Table/Form/Store/Virtual/DevTools/Hotkeys),
  client state via TanStack Store (no Zustand; constitution v1.4.0), AWS Amplify.
- **Backend — dual path:**
  - **Hot path:** Go + Gin + pgx/v5 on Fargate (ARM64) — latency-sensitive customer reads &
    transactions (catalog, profile, addresses, orders/checkout when built).
  - **Cold path:** Node + TypeScript Lambdas (Serverless Framework v3) — ops/admin/operator CRUD and
    async/event workers.
  - **Event backbone:** both backends publish domain events to one SNS topic; per-consumer SQS queues
    subscribe with filter policies (the fulfillment fan-out).
- **Data:** PostgreSQL 16, **raw SQL**, Goose migrations, **no ORM.** Two schemas: `public`
  (operational) and `admin` (back-office accounts + audit).
- **Infra:** Terraform, multi-env, remote state (S3-native lockfile — ⚠ **no DynamoDB lock table**;
  the platform's only DynamoDB table is 035's OTP issuance counter). AWS-native: Cognito, RDS,
  ECS/ECR, Lambda, S3, SNS/SQS, SES, Amplify Hosting.
- **Observability & telemetry:** Prometheus + Grafana (metrics/dashboards/alerts, self-hosted on
  ECS); Crashlytics (mobile crash reporting); PostHog (product analytics + web error tracking on all
  clients); push via FCM (+ APNs for iOS) through the notifications path.

## Architecture rule
**Clean Architecture everywhere.** In the KMP apps, the presentation layer is **MVVM**
(`ViewModel` + lifecycle-aware state, coroutines/Flow). Cross-cutting concerns (types, design
tokens, API client, config) are **shared packages** — the single source of truth — never copy-pasted
per surface.

## Architecture (the spine)
Every surface is organized the same way internally. The full, **binding** reference is
[ARCHITECTURE.md](ARCHITECTURE.md) (constitution Principle VI) — read it before building any feature.
The spine in five rules:
- **Three-layer slice per feature:** thin edge (handler / UI) → service / use-case → repository.
  Clean-Architecture direction — domain depends on nothing, data implements it, presentation consumes it.
- **Repository pattern, raw SQL, no ORM.** Wire shapes (DTOs / rows) are mapped explicitly to domain
  models and never leak past the data layer.
- **No DI framework** — dependencies are wired explicitly and greppably (by hand at the entry point,
  one mobile container, or cached module singletons).
- **Unidirectional client state** — mobile MVVM (a ViewModel exposing immutable, observable state; the View calls its functions for user actions);
  web treats the server-state cache as the source of truth, with a client store only for genuine
  client state. Never hand-cache server data in component state.
- **One event language across backends** — both publish the same event envelope; consumers are idempotent.

## Observability & telemetry
Observable and measurable from day one (constitution Principle VII; full detail in
[ARCHITECTURE.md](ARCHITECTURE.md)):
- **Backends:** structured logs + a `/metrics` endpoint (Prometheus) → Grafana dashboards & alerts;
  Lambda metrics via CloudWatch into the same Grafana.
- **Mobile:** Crashlytics crash reporting via a `core/platform/` native driver.
- **Clients (all six):** PostHog product analytics through a shared, typed event taxonomy; web apps
  also route runtime errors to PostHog. No PII in telemetry beyond the auth subject id; analytics is
  consent-respecting.
- **Push:** device tokens registered via the hot path; the notifications worker sends push (FCM/APNs)
  alongside email — never ad hoc per feature.

## Decisions locked
- **Region: `ap-southeast-2` (Sydney).** Moved from `ap-southeast-1` (Singapore) on 2026-07-12 — dev
  was destroyed and re-provisioned from scratch (no data kept), and the Terraform state bucket moved
  with it (`effy-apse2-tfstate`). `ap-southeast-1` is empty. Region is config, never a literal: it
  flows from `var.aws_region` / the `/effy/<env>/region` SSM contract. **Four values pin a region
  outside Terraform** and must be changed by hand on any future move — the Lambda
  Parameters-and-Secrets **layer ARN** (its AWS-owned account id differs per region), the embedded
  **RDS CA bundle** (`apis/edge-api/shared/src/lib/rds-ca.ts`, region-rooted chain), each
  `serverless.yml` `provider.region`, and (010) any **ACM certificate behind CloudFront/Amplify**,
  which **must** live in **`us-east-1`** regardless of the platform's region — the regional API
  Gateway certificate correctly follows `var.aws_region`, but a CloudFront-fronted one cannot.
  **Route 53 hosted zones are global and have no region** — they survive a region move untouched.
  Runbook: [infra/envs/README.md](infra/envs/README.md).
- **Domain: `effyshopping.com`** (registered at **GoDaddy**; DNS authority delegated to Route 53).
  The apex is **production's, and reserved** — nothing is deployed there. Every environment gets a
  **delegated child namespace** it fully owns (`dev.effyshopping.com`), created by its own env root
  along with its own `NS` delegation record in the parent — so destroying an env removes both
  together and leaves no dangling delegation. The parent zone lives in a **new `infra/global/`
  root** (`make global-apply`), deliberately outside the `ENV=` workflow so `make destroy ENV=dev`
  can never take the platform's apex with it. Registrar control is an **out-of-code dependency**:
  Terraform can rebuild every zone and record, but not the domain.
- **Repo shape:** MONOREPO (Turborepo + pnpm for JS/TS; Go lives alongside with its own module; each
  KMP app is its own Gradle build). Reason: solo/small team → consistency across surfaces is the #1
  need; shared packages (design-system, api-client, shared-types, config) are the whole point.
- **Methodology:** Spec Kit (official CLI), with a product Brief up front.
- **Mode of work:** Claude WRITES all the code — scaffolding plus app/service/infra source, task by
  task per the plan. The USER runs every risky / outward-facing operation manually: deployments,
  `terraform apply`/`tf-bootstrap`, DB migrations, and anything touching live AWS. Claude authors
  Terraform, migration SQL, and Lambda source but does NOT run `terraform apply`, migrations, or any
  command that provisions cloud resources or mutates live state — it hands those steps to the user
  with exact commands to run.

## Prohibited values (hard rules)

- ⚠ **`techsupport+claudeone@phantm.com` MUST NEVER appear anywhere in this project.** Not in
  Terraform variables or `.tfvars`, not in `serverless.yml`, not as an SNS/alarm endpoint, not as a
  test fixture, seed, doc example, spec, or commit message. It is the address attached to the
  assistant's session — **not** an address the operator chose for this platform.
- **The general rule it stands for:** a real-world identifier — an email address, a phone number, a
  domain, an account id, a notification endpoint — is **asked for**, never inferred from session
  metadata, the git user, or anything else the environment happens to expose. An identifier being
  *visible* is not consent to *use* it.
- **When the value is unknown, fail loudly.** A required variable with no default, or a validation
  that refuses a placeholder, is correct. Filling the gap with a plausible guess is not — a wrong
  outward-facing value that silently works is worse than a build that stops, because it reaches real
  people before anyone notices.
- **The approved Effy mailboxes**, when a feature needs one:
  - **`workspace-admin@effyshopping.com`** — the operator's own account. **Operational** endpoints:
    alarm notifications, vendor/account contacts, anything aimed at whoever runs the platform.
  - **`hello@effyshopping.com`** — an alias on that same account, and the **customer-facing** one.
    Anywhere a person outside Effy will see it: reply-to on automated mail, support contact in the UI.
  - Both land in one inbox, so the choice is about what the address *says*, not where it goes. ⚠ They
    are approved for platform use — not a licence to invent a **third** address. Anything else is
    asked for.
- Enforced mechanically in `infra/envs/dev/variables.tf` (a validation block on `alert_email` that
  rejects the banned address) and by constitution v1.12.0.

## Workflow (the method)
```
Brief (product framing, user-authored)  →  /constitution (technical law, once)
   →  /specify <feature>  (WHAT/WHY, zero tech)
   →  /plan <feature>     (HOW, tech, cites constitution)
   →  /tasks <feature>    (ordered, checkable)
   →  /implement          (build task by task, verify vs acceptance criteria)
```
Discipline: specs have ZERO tech. A gap found later sends you BACK to fix the earlier artifact.

## Order of operations
1. The **Brief** (platform-brief.md) captures the product.
2. **/constitution** encodes the technical law (dual-path, monorepo, no-ORM, native-feel mobile,
   a MONOCHROME neutral ramp with no brand hue (v1.11.0; retired Effy Emerald #065f46 + terracotta
   #d0735a, and Jade #0FB57E before it), 4-pool auth isolation with passwordless EMAIL_OTP).
3. First slice: **Auth + customer onboarding** end-to-end (proves 4-pool auth + dual-path +
   monorepo, and unblocks everything else). Catalog browse is the recommended second slice.
4. Do NOT pre-build the monorepo scaffold ahead of the specs — let each feature's plan drive what
   gets scaffolded.

## Auth
AWS Cognito, **four isolated pools**: customer / driver / shop / admin. **Credentials are
per-audience** (constitution v1.7.0, amended by 011):
- **Driver / shop / admin** — **strictly passwordless email one-time code**, admin-provisioned (no
  self-signup). **There are no passwords on the platform's internal audiences.** ⚠ Since **035** the
  code is **issued by the platform itself** (a Cognito custom challenge), not by Cognito's managed
  `EMAIL_OTP` factor — whose length is fixed at **eight** digits and configurable by nothing. Every
  code on the platform is now **six** digits (constitution v1.11.1: the phrase names the credential,
  not the vendor mechanism).
- **Customer** — the only audience Effy does not employ, and the only one open to the public: **open
  self-registration** with **three credential routes — email+password, email OTP, and Google
  federated sign-in**. All three MUST converge on **one profile / one `sub`** (a federated identity is
  **linked into the native profile**), and **linking requires a provider-asserted *verified* email** —
  linking on an unverified email is an account-takeover primitive, not a convenience.

**Pools MAY define RBAC groups** surfaced via the `cognito:groups` JWT claim: the
admin pool defines `admin` / `manager` / `csa`; the shop pool defines `shop_manager` /
`shop_staff`; customer and driver define none. The claim is the **origin of role assignment**;
where a platform staff record exists it is **authoritative for the access decision** (role, status,
scope). Frontends authenticate against Cognito directly via Amplify; backends
validate JWTs per pool and pin the issuer — there is **no auth proxy**, and a token issued for one
pool is structurally rejected by services scoped to another.

## Design system (one source of truth)
⚠ **THE PLATFORM IS NO LONGER MONOCHROME.** On operator direction (design project `951bb710`,
`theme-adoption-prompt.md`) the **"Effy Shop Console" appearance identity was adopted PLATFORM-WIDE**,
reversing constitution v1.10.0 → v1.13.0 and features 026 / 041. One file carries it —
`packages/design-system/src/tokens.css` — and 057's shop-scoped `tokens/shop.css` was **DELETED**
rather than left restating the same values (two files declaring one palette is the
two-sources-for-one-fact shape this repo has shipped five defects through). ⚠ **Recorded win**: 017's
SC-004 web-px == mobile-dp parity, which 057 broke for shop-web, is **restored**.
- ⚠ **THE DARK BASE IS NEAR-BLACK NEUTRAL, NOT THE ADOPTED NAVY INK** (2026-09-17). The `.dark`
  block now carries **the design's own values**, read from `Effy Shop Console.dc.html` via DesignSync
  — **not** `dark-theme-update-prompt.md`, which the design has since moved past. Ground `#151515`,
  rail `#111111` (**recessed**, darker than the content ground), muted/secondary `#212121`, hover
  `#232323`, **border `#2a2a2a`**, input `#383838`, text `#fafafa`/`#a3a3a3`. **No blue tint in any
  neutral**; the light block is byte-identical throughout.
  ⚠ **THE PROMPT'S RAMP WAS BUILT AND REJECTED IN BETWEEN**: it bound `--muted`, `--border`,
  `--accent` and every hover to **one** value (`#404040`) on a `#262626` ground, so nothing had a
  hierarchy and everything had an edge — the operator report was *"borders are too much"*. The design
  steps those four roles by ~12 points each, and `--border` is a **1.27:1 hairline** again. Borders
  are deliberately **not** contrast-tested; a 3:1 border is a slab on every surface.
  The **light block is byte-identical** to before. Hues lifted to their 400-level equivalents so they
  carry on grey, and every `-soft` is now grey mixed with the hue rather than a saturated dark, so a
  tinted chip sits on the base instead of reading as a coloured card.
- **`--brand` / `--primary` — cobalt `#1d4ed8` light / `#60a5fa` dark — THE one action colour.** Both
  names resolve to the same value on purpose (`--primary` is the shadcn vocabulary the primitives
  consume, `--brand` the role name screens read). ⚠ The hue **LIFTS** in dark rather than inverting —
  unlike the retired neutral accent, a hue reads against both grounds. Plus `--brand-soft/-mid/-ink`.
  ⚠ The grey rebase also **ended the dark-only split** between them (the navy ground had needed a
  brighter `#7a9cff` for brand TEXT); they are now one value in **both** appearances.
- ⚠ **TWO VALUES DEVIATE FROM THE DESIGN'S DARK BLOCK, both forced by a guard.** `--ring`
  `#5a5a5a`→`#636363` (the design's is **2.65:1** on its own ground, under the 3:1 WCAG 1.4.11 bar —
  the same correction the light ring already carries). And `--success`, specified as green-400, is
  **byte-identical to the retired 024 customer splash ground** and turns `check-no-emerald.sh` red —
  057 hit the same collision on the same token and refused it too — so it is `#4cd97b`. ⚠ Naming the
  retired hex **in a comment** is itself a hit; the sweep does not strip comments.
- ⚠ **`check-tokens.mjs` GAINED TWO GUARDS, each from a defect committed during this change.**
  (1) **The residue after comment-stripping must still be CSS**: a glob written as `--chart-` + `*/`
  inside a comment **closes it**, and the remaining prose became stylesheet source — every token guard
  passed (they all strip comments first) and only the customer-web **production build** failed, quoting
  a phrase several lines past the fault. (2) **Every ratio written in a comment must match the
  recomputed one**: the dark block was re-derived three times and on one pass **thirteen** annotations
  were stale — plausible numbers describing pairs that had moved. Both proven by breaking them.
- **Three bounded non-brand hues**: `--accent2` (orange) is **attention and time pressure ONLY** —
  notification dots, unread badges, cut-off chips, deliberately rare; `--violet` and `--teal` are the
  second and third data-viz series and the avatar tints, **never interactive**.
- **Four state semantics**, each with a `-soft` tint it is written on: `--destructive`, `--success`,
  `--warning`, plus the neutral `muted`. The closed status mapping is **in-progress → brand ·
  complete → success · waiting/at-risk → warning · failed/refunded → destructive · inert → muted**.
  ⚠ `--success` and `--warning` keep **NO `-foreground` pair**: they may be text ON THEIR TINT but
  never a fill with a label on it (`check-tokens.mjs` enforces the absence).
- ⚠ **FOUR VALUES TUNED from the source, all for contrast**, all required by the adoption prompt's own
  4.5:1 rule: `--accent2` light `#d6650c`→`#b4550a` (3.36:1 on its own tint), `--teal` light
  `#0b8577`→`#0a7d70` (4.08:1), `--ring` light `#8eadee`→`#7993ca` (2.24:1 — failed even the 3:1 UI
  bar). Dark passes unchanged at every pair. ⚠ The sign-in panel fills with `--primary`, **not**
  `--brand`: the reference's `background:var(--brand); color:#fff` measures **2.62:1 in dark**.
- **Radius: a four-step scale** read off the design's own declarations, not its `--radius` literal —
  **sm 4 (checkboxes) / md 6 (inputs, nav, in-row) / lg 8 (buttons, icon chips) / xl 10
  (containers)**. Pills (badges, status chips, progress) are `rounded-full`, a shape not a step.
- **NO GRADIENTS. Flat fills only.** Cards are **bordered, never shadowed**; the only shadows are on
  floating layers (dialog, popover, sheet, select, dropdown, chart tooltip).
- **Type: Geist / Geist Mono.** ⚠ NOT self-hosted (no woff2 to commit) — loaded from Google Fonts by
  the two consoles' `index.html`. `--font-sans` names **self-hosted General Sans second**, which is
  what keeps `customer-web`'s typography intact without adding a request to a public storefront.
- **Theme mechanics**: `data-theme="light"|"dark"` on the document element is the persisted,
  authoritative switch; the `.dark` class is **derived from it in the same statement** (Tailwind's
  `dark:` variants resolve off a class). Restored **before first paint** by an inline script in each
  console's `index.html`. Dark mode required, user-selectable (Light / Dark / Follow-System).
- **RETIRED**: Effy Emerald `#065f46` + terracotta `#d0735a`, Jade `#0FB57E` / `#047857`, and the
  041 monochrome ramp. The first two are still swept by `scripts/check-no-emerald.sh` /
  `check-no-jade.sh`.
- **Guards** (`pnpm --filter @effy/design-system test`): `check-tokens.mjs` (key-set parity, the
  four-step radius scale, **WCAG AA on every pair incl. each solid against its own `-soft` tint**,
  the no-`-foreground` rule), `check-component-shape.mjs` (controls never pills, badge always is,
  containers ≥ buttons ≥ controls), and ⚠ **`check-token-usage.mjs`** — scans 306 files and fails if
  a colour utility names a token `@theme` does not declare, because **Tailwind emits no rule at all
  for an unknown utility** and the element renders as nothing with no error anywhere.
- **Mobile**: the three Compose themes regenerate from `tokens.css` and take the cobalt accent and
  the neutral-grey ground. ⚠ The new hues (`--brand-*`, `--accent2`, `--violet`, `--teal`, `--warning`)
  are **web-only** — `gen-compose-theme.mjs`'s token list is unchanged, deliberately. Mobile must
  still feel native (iOS HIG / Android Material); fat-finger targets + micro-animations are
  requirements. Design refs: Uber / Bolt / foodpanda / eBay.

**Design reference & layout doctrine (constitution v1.9.0, Principle V):**
- **Reference platforms** — Effy is **"Uber Eats + eBay, food-first."** For any feature's business
  logic, data model, entities, or UI/UX, look to how Uber Eats (food, menus, modifiers, discovery)
  and eBay (rich product entities, item-specifics, category taxonomy, search/filter) solve the same
  problem; adapt to Effy's single-brand hidden-fulfillment model; prefer the industry-standard,
  production-grade pattern. Food and food-related products get priority.
- **No card layouts** — do NOT use card-style containers or metric/summary cards to lay out content,
  and no metric cards at the top of pages, **unless a card is genuinely the right pattern and no
  better layout exists** (record the justification in the plan). Prefer tables, lists, sectioned
  pages, tabs, and detail rows.

## Mobile apps (scaffolded)
Three KMP + Compose Multiplatform apps live under `apps/`, each an **independent Gradle build** with
the standard three-module layout (`shared` + `androidApp` + `iosApp`) and package root
`com.effyshopping.<app>.mobile`:
- `apps/customer-mobile` — `com.effyshopping.customer.mobile` — the customer shopping app.
- `apps/driver-mobile` — `com.effyshopping.driver.mobile` — the driver delivery app.
- `apps/shop-mobile` — `com.effyshopping.shop.mobile` — the shop-operator app (the "shop" audience;
  the mobile app is named `shop`).

Baseline stack: **Kotlin 2.4.0, Compose Multiplatform 1.11.1, AGP 9.0.1, minSdk 24 /
compileSdk + targetSdk 36**. ⚠ **ALL THREE APPS MUST PIN THE SAME TRIO — `composeMultiplatform`,
`kotlin` AND `material3` — AND THE DRIVER APP ONCE DID NOT.** Commit `6c7beaf` bumped it to CMP 1.12.0
/ Kotlin 2.4.20 and left `material3` at 1.11.0-alpha07; material3 1.11 calls
`foundation.style.StyleScope.border(Dp, Color)`, whose signature changed in foundation 1.12, so every
screen with an `OutlinedTextField` — starting with **sign-in** — died at launch with
`kotlin.internal.IrLinkageError`. Gradle resolved, Kotlin compiled, host tests passed: Kotlin/Native
defers an unresolved symbol to RUNTIME. All three are currently the base KMP template (commonMain
`Greeting`/`Platform` stubs); each feature's stack is layered in per that feature's plan/tasks.

## Current status
Built so far: the **infrastructure** (four Cognito pools, dev DB, shared HTTP gateway), the
**migration workflow**, the **cold path** (`apis/edge-api/{shared,admin,shop,customer}`), and **all
three web surfaces** — `apps/back-office` (005), `apps/shop-web` (007) and **`apps/customer-web`
(011 — the first PUBLIC surface, Next.js 16 SSR)** — on the shared packages
`@effy/{design-system,shared-types,api-client,web-kit}`.

**Two of the three KMP mobile apps are now built** (KMP + Compose, Clean Architecture + MVVM, native
Amplify auth behind a `commonMain` `AuthDriver`; a formal `ViewModel → UseCase → Driver/Repository`
domain layer): **`apps/customer-mobile` (013)** and **`apps/shop-mobile` (014 — signed off, EMAIL_OTP
only, single-token, the RBAC manager gate, tablet-first)**. ⚠ **`apps/driver-mobile` is BUILT TOO** —
049 gave it the full hub-and-spoke operation and **060 gave it its appearance** (all 45 design screens,
cobalt). ⚠ **MapLibre was ADOPTED AND THEN REMOVED in the same feature** — it aborted the app under
Xcode's debug build (SIGABRT on its own render thread) and `MapLibreAbsentGuardTest` keeps it out; the
map is a **schematic**, not cartography. This sentence said "OpenStreetMap via MapLibre + OpenFreeMap"
and had been false since that removal. ⚠ The sentence here previously read *"remains the base
template"*, which had been **false since 049** and is the same stale-claim shape that left the app out of
the shared asset pipeline for four features (see 060 T019). All three mobile apps share a **production
navigation shell** (015 — `packages/mobile-kit`:
adaptive bottom-bar/rail + per-tab back stacks; customer guest-first with deferred sign-in, shop login-first;
built on stable Material 3, Nav3-migration-ready). Still the **documented vision**: the **catalog** (there
are no product tables anywhere yet — spec'd as **016-shop-product-catalog**),
**cart / checkout / payment**, the hot path's **cloud deployment** — ✅ **DONE for dev as
040-core-api-deploy**: `core-api` was local-Docker-only; it now runs as a cheapest single-task Fargate
service + ALB (no autoscaling, default-VPC public subnets, no NAT, ~$30/mo), **DEPLOYED and LIVE at
`core-api.dev.effyshopping.com`**, with customer-mobile wired to it. ⚠ Acceptance walk (health/secret-
sweep/cost-audit SC proofs), customer-web repoint + CORS, container CI/CD, and the commit are pending;
prod bring-up carries recorded dependencies (apex cert/record, private DB + NAT). Sign-off:
[specs/040-core-api-deploy/SIGNOFF.md](specs/040-core-api-deploy/SIGNOFF.md). Still ahead: the
**event backbone**.

Everything gets built **slice by slice**, each driven by its own spec → plan → tasks. Don't build all
surfaces in parallel: one vertical slice proves the foundation before the pattern scales.

## Feature history (read on demand)

Every feature's build record — what changed, defects found, what was verified, and the operator
steps still open (deploy order, migrations, walks) — lives in [FEATURE-HISTORY.md](FEATURE-HISTORY.md),
newest first. ⚠ **Before working on or near a feature, read its entry there** (search for its number);
the entries carry gotchas and deploy-ordering rules that the code does not. Slices 001–003 are under
"Previous slices" at the end of that file. Per-feature artifacts are in `specs/<feature>/`.

Features recorded:

- **065-driver-item-manifest** — Driver Item Manifest & Temperature Classes
- **063-driver-work-assignment** — Driver Work Assignment & Wave Planning
- **059-shop-web-pwa** — Shop Console as an Installable, Notifying Production App
- **058-shop-today-insights** — Shop Console: Today & Insights
- **057-shop-web-redesign** — Shop Console Redesign
- **056-driver-management** — Back-Office Driver Management
- **055-refunds-cancellation** — Refunds & Cancellation
- **054-product-inventory** — Product Inventory (Shop-Managed Stock)
- **053-order-lifecycle-completion** — Order Lifecycle Completion
- **052-order-confirmation-invoice** — Order Confirmation & Emailed Receipt
- **050-observability-push-foundation** — Platform Observability & Push Notification Foundation
- **049-driver-mobile-app** — Driver Delivery App (the 6th & final client surface)
- **048-console-web-cicd** — Internal Console Continuous Deployment (Shop-Web & Back-Office)
- **047-delivery-shipping-engine** — Delivery Zones & Shipping-Fee Engine
- **046-customer-feedback** — Customer Feedback (listening channel)
- **042-customer-web-cicd** — Customer Storefront Continuous Deployment (dev)
- **041-monochrome-console-redesign** — Monochrome Consoles & Shop Mobile: Unified Dashboard Identity
- **039-customer-home-redesign** — Customer Web Home: Merchandised Landing Redesign
- **038-email-template-system** — Platform Email Template System
- **035-six-digit-otp** — Platform-Wide Six-Digit One-Time Codes
- **033-customer-saved-items** — Customer Saved Items: a watchlist
- **029-promotional-banner-carousel** — Promotional Banners: Fixed Canvas, Template & Offers Carousel
- **028-mobile-home-merchandising** — Customer Mobile Home: Sectioned Merchandising & Search Entry
- **027-customer-cart-sync** — Customer Cart Synchronisation, Promotions & Order Rules
- **024-brand-icons-splash** — Brand Marks: App Icons, Splash Screens & Favicons
- **020-shop-order-fulfillment** — Shop Order Fulfillment (Receive → Pick → Handoff)
- **019-customer-commerce-flow** — Customer Commerce Flow (Browse → Order)
- **017-platform-theme-tokens** — Platform Theme & Design Tokens Refresh
- **015-mobile-app-shell** — Mobile App Shell & Navigation (Customer + Shop)
- **014-shop-mobile-foundation** — Shop Mobile Foundation (Bootstrap)
- **013-customer-mobile-foundation** — Customer Mobile Foundation
- **012-customer-profile-management** — Customer Profile Management
- **011-customer-storefront-web** — Customer Storefront (Bootstrap)
- **010-domain-dns-foundation** — Platform Domain & Per-Environment Namespaces
- **009-shop-management** — Back-Office Shop Management
- **007-shop-web** — Shop Web Foundation (Bootstrap)
- **006-first-admin-bootstrap** — First Admin Bootstrap (Operator Break-Glass)
- **004-backend-bootstrap** — A3 cold-path decomposition (implemented + live in dev)
- **005-back-office-web** — Back-Office Web Foundation (Bootstrap)

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/065-driver-item-manifest/plan.md
<!-- SPECKIT END -->
