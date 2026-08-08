# Effy (CLAUDE.md)

Effy is a **single-brand, vertically-integrated grocery + e-commerce delivery platform**. We build
it **spec-first** using **GitHub Spec Kit**. Read this before doing anything.

## What Effy is (the product model)
- Customers buy from **one brand: "Effy."** There is no marketplace of named storefronts.
- **Shops are hidden internal fulfillment nodes** (dark-store-like). Customers never see or pick a
  shop — the platform decides fulfillment behind the scenes.
- **Drivers and back-office staff are Effy employees**, working in internal apps (no public signup).
- Four audiences, each with its own trust level: **customer, driver, shop/operator, admin/back-office.**

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
**MONOCHROME — there is NO brand hue** (constitution v1.10.0 → **v1.11.0**, feature 026). A ten-step
neutral ramp `#1A1A1A` … `#FFFFFF` carries every accent role, and the accent **INVERTS between
appearances**: near-black `#1A1A1A` on light, near-white `#F5F5F5` on dark, each taking the other as
its label. A hue reads against both grounds; a neutral one does not, so a single accent value would be
invisible in one mode. Exactly **TWO** semantic colours exist alongside the ramp — error `#e01010` and
success `#0C9409` (success is a **non-text indicator only**, 4.00:1). **No third hue may be
introduced**; the sole exception is a third-party sign-in mark whose provider requires its own
colours, which is an asset, not a token. Typeface **General Sans**, plus spacing/radius scales —
shared across all surfaces via one design-system package.
**RETIRED**: Effy Emerald `#065f46` + terracotta `#d0735a` (v1.11.0) and Jade `#0FB57E` / fill
`#047857` (v1.10.0). Both are swept out of live source by `scripts/check-no-emerald.sh` and
`scripts/check-no-jade.sh`. **Dark mode required, and user-selectable (Light / Dark / Follow-System).** Mobile must feel native (iOS HIG / Android Material); fat-finger touch
targets + micro-animations are requirements, not optional polish. Design refs: Uber / Bolt /
foodpanda / eBay.

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
compileSdk + targetSdk 36**. All three are currently the base KMP template (commonMain
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
only, single-token, the RBAC manager gate, tablet-first)**. **`apps/driver-mobile` remains the base
template.** Both built mobile apps now share a **production navigation shell** (015 — `packages/mobile-kit`:
adaptive bottom-bar/rail + per-tab back stacks; customer guest-first with deferred sign-in, shop login-first;
built on stable Material 3, Nav3-migration-ready). Still the **documented vision**: the **catalog** (there
are no product tables anywhere yet — spec'd as **016-shop-product-catalog**),
**cart / checkout / payment**, the hot path's **cloud deployment** (`core-api` was local-Docker-only by
decision — its go-live is its own slice, now **spec'd + built as 040-core-api-deploy**: cheapest
single-task Fargate + ALB at `core-api.dev.effyshopping.com`, no autoscaling, operator apply/deploy
pending), and the **event backbone**.

Everything gets built **slice by slice**, each driven by its own spec → plan → tasks. Don't build all
surfaces in parallel: one vertical slice proves the foundation before the pattern scales.

## Active feature

**039-customer-home-redesign — Customer Web Home: Merchandised Landing Redesign.** 🚧 **84/94 tasks —
every section BUILT and machine-verified. Not deployed, not committed, NOT WALKED BY A PERSON.**
Sign-off record: [specs/039-customer-home-redesign/SIGNOFF.md](specs/039-customer-home-redesign/SIGNOFF.md).

Turns the storefront home into a **longer merchandised landing** adapting an operator-supplied grocery
reference: image-led hero, category shortcuts, interleaved rails, promotional offer panels, an
app-awareness band and a newsletter. A **presentation slice over data the platform already serves** —
zero `core-api` changes, zero storefront DTO changes (FR-003) — plus one new capability, the newsletter.
- **Six sections cost +1.0 KB.** `/` went **171.7 → 172.7 KB** against a 174 KB gate. Every section is a
  server component; the only client boundary is the newsletter form. ⚠ The plan claimed 170.5 KB /
  3.5 KB headroom; it was **171.7 / 2.3** — a third less room than the constraint was written against.
- **⚠⚠ EVERY EMAIL'S PLAIN-TEXT PART WAS HTML-ESCAPED**, in the shared `email-kit` render path.
  Handlebars turns `=` into `&#x3D;`, so a tokenised URL became `…?token&#x3D;ABC`. Harmless in HTML
  (clients decode entities in attributes); **in text/plain nothing decodes it**. Double opt-in would
  have failed for every plain-text reader **with no error anywhere** — send succeeds, mail arrives, link
  is visible, confirmation never happens. Invisible until a template first needed a query parameter.
- **⚠ The offers block was wired to a placement that does not exist.** Spec, contract and tasks all said
  `placement === "offers"`; `BannerPlacement` is `"carousel" | "inline"`. It would have matched nothing
  and rendered as **absent** — a *valid* state under FR-018, so it would not have looked like a bug.
- **⚠ THE PLATFORM'S FIRST COLOURED CHROME**, on operator direction: three value panels in `#F95F09` /
  `#374128` / `#6BB252`. A recorded Principle V exception (**FR-005a**), bounded exactly as 024 bounded
  the mobile splash grounds — component-local, **never design tokens**, not named for a role.
  **`tokens:check` passes unchanged**, which is the mechanical proof it did not enter the design system;
  deleting one constant is the entire revert. ⚠ The reference's own panels **fail WCAG AA** with white
  text (orange **3.15:1**, green **2.59:1**), so the fills are exact and the *foreground* is adapted per
  panel — ratios computed in the test, not asserted in a comment.
- **⚠ FOUR DEFECTS FOUND ONLY BY LOOKING.** An orphaned divider; a **backwards phone layout**
  (`order-first` is unprefixed, so it applied at every breakpoint while `lg:` made desktop look right);
  the **CTA hierarchy vanishing in dark mode** (the monochrome accent inverts, the photograph does not);
  a scrim bleaching the artwork. All four were live with a fully green suite. **These tests were not
  wrong — layout, contrast and hierarchy are not properties a DOM assertion can see.**
- **⚠ TWO REQUIREMENTS HAD IMPLEMENTATION AND NO COVERAGE.** FR-035's abuse resistance had **no test at
  all**. FR-033's input preservation was **broken**: React resets an uncontrolled form once its action
  completes, so the field cleared on every outcome — including the failure whose whole point is that the
  address survives, while the message read "your address is still here".
- **⚠ The hero asset resolution was a defect documented as behaviour.** A module-scope `const` meant a
  long-running dev server cached `null` forever; the operator dropped the artwork in and kept seeing the
  placeholder. `public/hero/README.md` had *written that down as expected*. A supported empty state
  indistinguishable from a bug is worse than no fallback.
- **FR-002 is now mechanical.** The header/nav/product-card/footer lock was a comment; `make
  storefront-locks` is a sha256 baseline that fails and names what drifted (proven by breaking it).
- **Data**: one forward-only migration `20260807115924_newsletter_subscriber.sql` — `public.
  newsletter_subscriber`, **no FK to `customer`** (research R8: conflating them would make subscribe an
  account-existence oracle). **Email**: a seventh live template, `newsletter-confirmation`.
  **Backend**: `apis/edge-api/customer/src/newsletter/` — two **public** routes, cold path.
  ⚠ FR-035's gateway throttle was **unbuildable where the plan put it** (stage `route_settings` is
  Terraform-owned) and was narrowed to a per-address SQL cooldown, with the residual per-source gap
  recorded rather than hidden.
- **Verified**: `pnpm -r typecheck` **14/14** · `pnpm -r test` **14/14** · customer-web **351** ·
  edge-customer **134** · email-kit **52** · `make email-check` **8 templates** · **44 e2e** on a
  production build · `storefront-locks` · `brand-check` · `check-tokens`/`tokens:check` unchanged ·
  bundle gate **10 routes**.
- **⚠ Open (10)**: the newsletter's three operator steps — commit the migration + `make db-up`,
  `make edge-deploy SERVICE=customer`, and the live walk (**gated on 038 being deployed**; also needs
  `/effy/dev/web/site_url`, or the confirm link points at localhost) — plus **five deferred UI reviews**
  and the commit. ⚠ **Six findings that are NOT 039's** are recorded in its quickstart so they are not
  mistaken for it: three storefront e2e specs stale since **025**, two `a11y` tests referencing a
  removed delivery control (**verified against a clean HEAD build**), `SaveControl` at **36×36 on web**
  (033 raised the mobile one and never the web one), 8×8 carousel dots, the hero **not preloaded** while
  three below-the-fold banners are, and **PostHog never initialised on customer-web** — which is why
  039 declared five telemetry events and ships **one**. Spec/artifacts:
  [specs/039-customer-home-redesign/](specs/039-customer-home-redesign/); parity register:
  [docs/audiences/customer-capabilities.md](docs/audiences/customer-capabilities.md) §039.

**038-email-template-system — Platform Email Template System.** 🚧 **97/134 tasks — every authoring
and wiring phase BUILT and machine-verified; only operator deploy/walks + telemetry-doc remain. Not
deployed, not committed.**

Moves the platform's email from **plain-text strings assembled inside two Lambdas** to one designed,
guarded system — a new shared package **`@effy/email-kit`** (65 files). Every message the platform can
send is defined in **one typed catalogue**, authored in **MJML**, compiled at build time to
**committed, drift-guarded artifacts**, and rendered with **Handlebars** at send. The premise needed
correcting first: ⚠ **the platform had never sent an HTML email** (both existing mailers built a
`string[]` and set only a text body), and ⚠ **four of the six live message types are sent by Cognito
itself**, not by platform code.
- **The design derives from the monochrome tokens, generated not transcribed** — a change to
  `tokens.css` reaches email with no hand edit (SC-020). ⚠ **A hueless ramp is the design's biggest
  asset in the inbox**: for a zero-saturation colour, lightness-inversion and channel-inversion
  produce the same value, so the ramp is **mathematically immune** to the hue distortion that mangles
  branded email in forced dark mode — it flips end-for-end and stays legible. The exposure is the two
  semantic colours (never the sole carrier of meaning) and **partial** inversion (every text colour
  declares its own background).
- **Cost was not a decision input** — every architecture costs ~$20/mo at 200k emails. The constraint
  that chose the shape is the **5-second Cognito trigger wall**: three of four audiences have no
  password, so a slow render is a sign-in outage. That ruled out runtime MJML (100 MB+ deps), React
  Email (a documented ~80 MB/function bundle regression), and any queue hop on the sign-in path.
  ⚠ Proven: the auth Lambda bundle carries **neither the MJML compiler nor** (for the render-only
  interceptor) **the SES client**.
- **All six live messages are on the system.** `edge-auth`'s sign-in code and `edge-customer`'s
  password-changed notice **delegate** to it (both hand-rolled mailers deleted — zero email content
  left in a request handler); Cognito's four (sign-up, reset, verify, MFA) are branded by a **new
  `CustomMessage` interceptor** on all four pools that ⚠ **NEVER throws** — any failure returns the
  event unmodified so Cognito falls back to its default, because a throw breaks sign-up/recovery.
  ⚠ The platform **never sees the Cognito codes**: the templates emit Cognito's `{####}` placeholder,
  which it substitutes after the trigger returns (a security property, not a limitation).
- **A seventh template — `order-confirmation` — is the commerce proof** (template only, no call site,
  FR-062): a line-item table that survives the Word engine, a totals block, money formatting, proven
  **under render with a 25-item basket at ~33 KB** against Gmail's 102 KB clip.
- ⚠ **Two size budgets, not one**: Gmail's ~102 KB, and ⚠ **~20,000 characters for the four
  Cognito-sent templates** — five times tighter, and confirming the exact figure against a live pool
  is the top open non-operator item (**T125**). The first compiled template came out at 24,336 chars
  (over) before restructuring; MJML's **~2.5 KB per `mj-section`** is what spends the budget.
- **Guards, all fail-and-name-the-template** (`make email-check`): drift, size (both budgets), missing
  text part, banned techniques, nested `@`-rules, contrast **in three passes** (light · dark · forced-
  invert), the mid-tone-band ban, placeholder integrity, `{####}` placement, category/unsubscribe.
  The typed catalogue makes an **unsubscribable sign-in code** and a **wrong-vars call site** fail to
  **compile**. A config-contract test in each edge service reads the **real `serverless.yml`** (the
  fifth guard of 035's defect), self-checked against email-kit's exported `MAIL_ENV_KEYS`.
- **⚠ Defects found by building, all fixed**: internal commentary (incl. phishing reasoning) was
  shipping **inside customer email** (MJML `keepComments` defaults true); **every message carried a
  request to `fonts.googleapis.com`** (MJML auto-injects Google Fonts for the "Roboto" fallback) — a
  privacy leak on the platform's most sensitive mail; **the dark restatement did nothing** because
  MJML puts `css-class` on the `<td>` while the colour is on an inner element; and **the receipt
  button was invisible in dark mode** (same nested-element class of bug on the fill).
- **Data**: one forward-only migration adds nullable `public.email_delivery_event.template_id`; 037's
  consumer reads the SES `effy-template` tag into it. ⚠ NULL means "sent by Cognito, or pre-038" —
  data, not a gap. **Infra**: the `CustomMessage` trigger in the cognito module (one
  `aws_lambda_permission` per pool, two-stage ARN), three new SSM keys
  (`ses/reply_to_internal`, `mail/nonprod_allowlist`, `mail/postal_address`, the last two
  operator-supplied with a placeholder-refusing validation), and a **`custom_message_fallback`
  alarm** (the one blind spot the interceptor introduces — a branded message silently falling back).
- **Verified**: `pnpm -r typecheck` **14/14** · `pnpm -r test` (**7 email templates**, ~55 email-kit
  tests, 20 interceptor tests, all edge + web suites) · `make email-check` · `terraform validate`/`fmt`
  · retired-hue guards · the bundle proofs. **Not walked by a person** anywhere.
- ⚠ **Open**: the two-stage trigger-ARN deploy + live walks (all four audiences, the fail-safe proven
  by causing it), the **client-matrix walk** (nothing open-source renders the Word engine — the one
  thing no test substitutes for), **T125** (measure Cognito's real limit), and the order-confirmation
  wiring (a later slice). Telemetry metric-filters (T126) deferred with rationale — the sign-in send
  is already metered by `otp_send_failed`. Spec/artifacts:
  [specs/038-email-template-system/](specs/038-email-template-system/); parity register:
  [docs/audiences/customer-capabilities.md](docs/audiences/customer-capabilities.md) §038.

**035-six-digit-otp — Platform-Wide Six-Digit One-Time Codes.** ✅ **CONCLUDED (PARTIAL BY DESIGN)
2026-08-04 — 93/128 tasks. DEPLOYED TO DEV AND PROVEN LIVE on one surface.** Sign-off record:
[specs/035-six-digit-otp/SIGNOFF.md](specs/035-six-digit-otp/SIGNOFF.md).

**The platform now issues its own sign-in code**, and a real person has signed in with one
(customer-mobile, iOS simulator, live dev pools). Passwordless sign-in delivered **8** digits while
sign-up confirmation, password reset and both step-up flows delivered **6**.
- **⚠ IT WAS NOT COSMETIC.** `shop-mobile` filtered and truncated code input to six characters, so a
  real 8-digit code was cut to its first six and submitted — **passwordless sign-in there could not
  succeed**, and nothing on screen said why. Two of the platform's own UIs already told users the
  code was six digits. ⚠ D23 (011) recorded "do NOT hardcode a length"; the rule held on the three
  web surfaces and was **broken on both mobile ones**.
- **⚠ THE LENGTH IS NOT CONFIGURABLE — anywhere.** Not on the pool, the app client,
  `SignInPolicyType`, `EmailMfaConfigType`, the message templates, or the Terraform provider schema;
  the Amplify team closed the request as a Cognito-side limitation. A **Custom Email Sender** trigger
  cannot help either — it receives the code Cognito already generated and has **no response field to
  return a different one**, so emailing our own would lock out every user. The only route is a
  **custom challenge**, which is what **supersedes D23** (recorded in place in 011's research).
- **⚠ THE DESIGN STORES ALMOST NOTHING.** The code lives in the shopper's inbox and as a **keyed hash
  in `challengeMetadata`** — the only channel that survives between `CreateAuthChallenge`
  invocations, since `privateChallengeParameters` starts empty on every retry. Attempt counting is
  free from `session[]`. **No Goose migration.** The only persisted state is one hourly counter over a
  *hashed* address — the platform's **first DynamoDB table**, a recorded exception to the locked
  PostgreSQL standard (⚠ the decisive reason is not latency: edge Lambdas reach RDS today *only*
  because the dev DB is publicly accessible, which `edge-network.tf` calls invalid for prod).
- **⚠ FR-013 IS NOT BUILDABLE IN A LAMBDA.** The trigger event's `callerContext` has exactly two
  fields and **neither is an IP**. Per-source limiting is an **AWS WAF** rate rule on each pool
  (~$6/mo). ⚠ WAF **cannot** see email addresses, so FR-012 (per-address, DynamoDB) and FR-013 are
  **two mechanisms, not one**.
- **Data**: none. **Infra**: `apis/edge-api/auth` (4 triggers, all four pools, **104 tests**),
  DynamoDB counter, WAF, 4 alarms, operator-seeded HMAC secret. Internal pools **drop
  `ALLOW_USER_AUTH`** entirely; ⚠ **customer keeps it** because passwordless `SignUp` requires it, so
  the managed 8-digit flow stays reachable there by raw API — a **consistency gap, not a privilege
  escalation** (T003b would close it).
- **⚠ FOUR DEFECTS OF MY OWN, three found by my own tests and one on the first deploy**: (1) a
  **brute-force BYPASS** — success was checked before the attempt cap, so `[wrong,wrong,wrong,correct]`
  issued tokens; (2) `normalizeOtp` **truncated**, which FR-004 forbids — and **no test covered it**,
  because the one test touching normalisation used a string with exactly six digits and passed
  identically before and after the bug; (3) `NotAuthorizedException` now means two things, and the
  code route showed **password wording to passwordless shoppers**; (4) ⚠ **the audience map read four
  env vars `serverless.yml` never declared** — every pool resolved "unknown", no email was ever sent,
  and **100 passing tests missed it because they set those vars themselves**. That is 027 R13 / 029 /
  033's failure mode a fourth time; a **config-contract test** now reads the real `serverless.yml`.
- **⚠ ONE TASK IN MY OWN PLAN WAS WRONG AND WAS REVERSED**: T071 would have removed `autoSignIn` from
  sign-up, costing customers a **second** code — the `ConfirmSignUp` code is already six digits and
  untouched (FR-003).
- **Governance**: constitution **1.11.1** (PATCH — "EMAIL_OTP" names the **credential**, not the
  vendor enum); both audience registers updated; `verify-pool-credentials.sh` **extended** (⚠ it would
  have reported ✓ PASS while four pools gained a new first-factor flow).
- **Verified**: 13/13 typecheck · **997 JS/TS tests** · 86 shop-mobile + 238 customer-mobile ·
  Android **and** iOS compile incl. `compileTestKotlinIosSimulatorArm64` (which 033 found had never
  run) · `terraform validate`/`fmt` · `depcruise` · both mobile guards · `tokens:check` unchanged ·
  bundle **byte-identical** on all nine guest routes. **Six negative proofs.**
- **⚠ ~~BLOCKING FOR PRODUCTION — DELIVERABILITY~~ — CORRECTED 2026-08-05 by 037.** This entry said
  **"SES is in SANDBOX"** and named it the platform's headline production blocker. **It was already
  false when 037 began**, and nobody had re-tested: unrestricted sending was **GRANTED** (review case
  `178578384200127`, 50,000/day at 14/sec) and `dev.effyshopping.com` was verified with DKIM and a
  working custom MAIL FROM. A stale blocker left standing is worse than no note at all — it hides the
  real ones. Of the three items it listed: (a) production access — **already granted**; (b) a website
  on the apex — **no longer a prerequisite** (the request was approved without one), though the apex
  is still bare; (c) ⚠ **bounce visibility — REAL, and now built by 037**: a configuration set with an
  SNS event destination, an idempotent consumer, `public.email_delivery_{status,event}`, a back-office
  view and an audited two-part repair. The note called it "a product defect deserving its own slice";
  it got one.
- **⚠ Open**: 4 of 5 surfaces unwalked — ⚠ **shop-mobile most of all**, since its broken sign-in
  (SC-001) is the defect that justified the slice and is still unconfirmed on a device. The 10-check
  table (attempt cap, expiry, supersession, rate limit, 8-digit paste refusal, log-leak sweep) is
  **unobserved everywhere**; SC-007 timing parity is structural, not measured; `email_verified`
  (FR-020) uninspected; **T001 was never run**; and ⚠ **Android has never been looked at across 028,
  029, 033 — and now 035.** Spec/artifacts: [specs/035-six-digit-otp/](specs/035-six-digit-otp/).

**033-customer-saved-items — Customer Saved Items: a watchlist.** 🚧 **183/214 tasks — every feature phase BUILT and machine-verified except telemetry;
operator walks + commit pending.**

Replaces the half-built favourites capability **entirely** — its behaviour, its stored data, and every
trace of it on all three customer surfaces. It was not unbuilt; it was **built wrong**, in two ways
that made a shopper trust it and then be misled.
- **⚠ THE HEART LIED.** Nothing on the platform could answer "is this product already saved?", so every
  surface assumed *not saved* on every render — `FavoriteButton` opened `useState(false)` and its own
  comment admitted it. A shopper who saved something yesterday saw an empty heart today, tapped it (a
  no-op `PUT`), tapped again — and **silently un-saved the thing they were trying to save**. Fixed by
  **one bulk membership read per screen** (`GET /v1/saved/ids`), never an `isSaved` boolean on catalogue
  reads, which would make every product response shopper-specific and destroy the static shell.
- **⚠ AND `available` WAS CATALOGUE STATUS, NOT PURCHASABILITY.** With hidden fulfilment and zone-scoped
  delivery a product can be `status='active'` and still unreachable at the shopper's address, so the
  list invited people into a checkout that refused them. Replaced by a **five-way verdict** in ONE SQL
  statement. The DTO deliberately **omits `available`** — carrying both would leave two fields
  disagreeing about one question.
- **⚠ IT IS A WATCHLIST, NOT A WISHLIST**, and that was researched rather than assumed. Tesco and
  Sainsbury's auto-populate "favourites" from purchase history (nobody taps a heart); the AU tap-a-heart
  list (Woolworths, Coles) is a **price-and-availability watchlist**. **Buy It Again is named as a
  RESERVED SIBLING** so a later slice need not rename this one. Uber Eats' "Lists" are shareable
  merchant curation and **do not transfer** to single-brand hidden fulfilment.
- **Data**: one migration `20260802052141_customer_saved_items.sql` — creates `customer_saved_item`,
  **DROPS `customer_favorite`**. ⚠ Old saved items are **not carried forward** (FR-005): they hold no
  save-time price, and migrating them would fabricate a baseline never observed. ⚠ `cart_saved_item`
  (027's set-aside) is a **different table**, untouched, suite green.
- **⚠ GUEST SAVING IS THE FEATURE'S CENTRAL BET.** The sign-in wall is the single biggest documented
  reason saved-item features go unused, and the predecessor put one on the very first tap. A guest now
  saves freely, the list **survives a restart** on both surfaces, and it joins the account by an
  idempotent union on sign-in — **including the federated (Google) return**, omitting which is how a
  Google sign-in silently drops the guest list.
- **⚠ FOUR OF MY OWN DEFECTS, CAUGHT BEFORE SHIPPING**: (1) `SavedItemDTO` extended
  `StorefrontProductCardDTO`, which requires `available` — the very field being replaced — and **my
  key-set test passed because I wrote the expectation from my own struct instead of the contract**,
  which is 029's exact failure mode. (2) The merge defaulted a missing price to `"0"`, which would have
  reported **every merged item as a massive price drop**; now nullable, falling back to the product's
  current price. (3) FR-039 was unmet on mobile — the postcode was read lazily, so changing location
  left every verdict stale. (4) A sort control with no UI to change it.
- **⚠ RESEARCH R12 WAS WRONG**, and is corrected: FR-008 was recorded as "blocked at the contract"
  because the order line carried no `productId`. **It has since 019** — only the mobile *domain model*
  dropped it, the same mapper-discards-what-the-backend-sends shape that hid `brand`/`badges`.
- **⚠ TWO SPEC AMENDMENTS, both on measured evidence rather than convenience.** **FR-007**: the control
  is **omitted from the web search-results grid only** — `/search` had 0.1 KB against a 174 KB gate and
  the control costs 0.7; four reclaim attempts recovered 0.2 (one made it *worse*). **The budget was not
  raised.** **FR-053**: a barred shopper is refused the list too — the platform's barred gate is uniform
  and a carve-out would be a second, weaker authorization path.
- **⚠ AMENDED 2026-08-02 (Phase 11, operator direction): THE MOBILE LIST IS NOW A CART-SHAPED LIST.**
  It was a two-column product grid; it is now a **vertical list of detail rows built from `CartRow`'s
  own composition**, with **pull-to-refresh in every state** (new **FR-068**). The grid's R18
  justification held for a *catalogue* surface, where a photograph answers "which of these do I want?";
  this screen answers **"what changed, and can I buy it yet?"**, and every part of that answer is TEXT —
  price now, price at save time, one sentence per verdict — which a half-width tile column wraps into
  ragged lines. It also ends an **unjustified parity split**: `customer-web`'s list always was a list.
  **⚠ Wiring the row closed two gaps that had been TICKED AND NOT BUILT**: T132/T133 claimed
  add-to-cart on both surfaces while `AddAllSavedToCart` had **no mobile call site**, and the undo
  affordance (FR-017/FR-018) was published by `SavedViewModel` and **rendered by nothing**, so a
  mis-tap on the list was unrecoverable. **⚠ And it surfaced a third**: removing the grid left
  `TileSaveControl` with **no call site at all**, which exposed that the mobile home/browse/search
  tiles had **never** been wired to it — **FR-007's tile placement was unbuilt on mobile** and the
  parity register's ✅ was optimistic. Also fixed: the loading state wrapped an **empty `Column`**,
  which has nothing to scroll, so the refresh gesture it was wrapped in **could not fire**.
- **⚠ FR-007 CLOSED THE SAME DAY (Phase 11b): the heart is now on every mobile tile.** Home's rails and
  `SearchScreen` — which **is** search, browse, category and "see all" in one screen — go through one
  `rememberSavedTiles`, where the three rules that make a tile heart honest live: **one membership read
  per screen** (FR-020, never one per tile), **one mirror every control reads** (FR-013, so two tiles
  for one product cannot disagree), and **a refusal that is actually said** — the guest cap refuses
  deliberately, and a refusal a shopper cannot see is indistinguishable from a bug. **⚠ The read is
  signed-in only**: a guest's would `401`, and `LoadSavedMembership` **`adopt()`s** its answer, so an
  empty one would **wipe the device list**. **⚠ And the control's touch target was 32 dp, not 48** —
  `toggleable` on a 24 dp icon with 4 dp padding, directly under a comment claiming it cleared the
  constitution's minimum. Harmless on one detail screen; **load-bearing in the corner of a tile**,
  where a miss navigates away from the thing being saved. Now a 48 dp box around a 32 dp scrim.
  ⚠ Still unwired: product detail's **"More like this"** rail, which draws a bespoke tile instead of
  `EffyProductCard` — the fix is the shared tile, not a second heart (T197).
- **⚠ AND THE BULK ADD HAD NEVER ADDED ANYTHING (Phase 11c).** An operator screenshot showed
  "**0 items added to your cart**" with all three products refused as "couldn't be added right now".
  Cause: `AddAllToCart` derived its per-item change id as **`changeID + ":" + productID`**, and
  `public.cart_change_log.change_id` is a **uuid** column — so **every** insert failed with `invalid
  input syntax for type uuid`, the cart errored on every item, and `cartReason`'s default reported each
  as `unavailable`. **The shopper was told their products were the problem when the request never
  reached the cart.** Now a **UUIDv5** over (fixed namespace, `changeID:productID`) — still one id per
  (batch, product), still deterministic, so a retry is still recognised as a retry.
  **⚠ The test was watching it happen**: `TestAddAllToCart_GivesEachItemItsOwnChangeID` asserted only
  that the ids DIFFER, which `"chg:a"`/`"chg:b"` do, because `fakeCart` takes a `string` and accepts
  anything — **the fixture agreed with the code instead of with the database**, 027 R13's lesson
  recurring. It now parses each id as a uuid (proved by reverting the fix) and pins retry determinism.
  **Layout, same screenshot**: "Add everything available to cart" moved from the list's first item to a
  **fixed bottom bar** (it scrolled away and sat furthest from the thumb); the bulk result became a
  **toast** with counts plus a per-row `skipNote` where the reason can be acted on — FR-052 still met,
  nothing omitted; "0 items added" now reads "Nothing could be added to your cart"; and the
  `SnackbarHost` became a bottom **overlay** instead of a column child that pushed content down.
- **⚠ DOES ADDING TO THE CART REMOVE THE SAVED ITEM? NO — and that is now written down (FR-050/FR-050a,
  Phase 11d).** Two genres of list behave oppositely and this platform has one of each: a **staging**
  list (the cart's own set-aside, 027) is *consumed* when its item moves to the cart; a **watchlist** is
  not. eBay's Watchlist, Amazon's Wish List and the Woolworths/Coles favourites are the second kind, and
  Principle V names **eBay** as this capability's reference. Groceries are re-bought weekly — Tesco and
  Sainsbury's derive favourites from purchase history precisely so the list is never consumed — and
  **removing the entry would destroy the save-time price the watch is measured against**, so the next
  drop could not be reported. **⚠ But keeping it exposed a hazard**: a repeat add **increments the
  quantity**, so a row still saying "Add to cart" invites a tap that silently buys two. **FR-050a**:
  the row now reads **"In your cart · View"** / **"N in your cart · View"** (the count matters — it is
  how a shopper catches the double tap), the **bottom bar becomes "Go to cart"** once everything
  available is in there (the bulk add is *not* idempotent across taps — each tap is a new batch), and
  the screen `syncCart()`s on arrival because it now renders from that mirror. **⚠ Deliberately not a
  quantity stepper**: that is the grocery-tile pattern, and quantity is the cart's business — a stepper
  here would make two screens responsible for one number.
- **⚠ `saveditems`' 25 container-backed tests are RED on this branch, and were before any of this
  work** — `repository_test.go` seeds `public.delivery_pricing_rule`, which the delivery withdrawal
  (`a478734`) dropped. The "25 container-backed" claim below is **stale**; T206 tracks it. Those are
  exactly the tests that would have caught the uuid defect.
- **⚠ AND THE iOS TEST SUITE HAD NEVER COMPILED.** Three backtick test names in this slice's own
  `commonTest` files contain a **comma**, which **Kotlin/Native forbids in a declaration name** while
  the JVM accepts it — so `testAndroidHostTest` was green and `:shared:iosSimulatorArm64Test` failed at
  `compileTestKotlinIosSimulatorArm64` with `Name contains illegal characters: ","`. Every "iOS
  compile" claim in this slice covered the **main** compilation only, never the tests. Commas replaced
  with dashes; **iOS now runs 217 tests, 0 failures — the same count as Android**.
- **Verified**: Go build/vet/gofmt + all packages (**~65 saveditems tests, 25 container-backed**) ·
  **492 mobile tests** · **242 customer-web tests** · iOS + Android compile · `pnpm -r typecheck` 12/12 ·
  `depcruise` · `cm-guard` · `cm-tokens-check` · all six routes within budget. Phase 11 re-verified
  `:shared:compileAndroidMain` · `:shared:testAndroidHostTest` · `:shared:compileKotlinIosSimulatorArm64` ·
  `mobile-guard`. Phase 11b added `:androidApp:assembleDebug`.
- **⚠ Open**: **Phase 8 telemetry is unbuilt and CUTTABLE** — and PostHog has **never been initialised
  on customer-web**, so `capture()` has always been a no-op platform-wide, making **SC-012/SC-013
  unmeasurable**. Mobile telemetry deferred a **twelfth** slice. **22 operator walks** remain, incl.
  ⚠ `make db-up` (**destroys the old saved data**), the five-observer verdict test, the colour-free
  SC-009 test, force-quit persistence, iOS process-death restore, and **Android, which has never been
  looked at across 028/029/033**. Spec/artifacts: [specs/033-customer-saved-items/](specs/033-customer-saved-items/);
  parity register: [docs/audiences/customer-capabilities.md](docs/audiences/customer-capabilities.md) §033.

**029-promotional-banner-carousel — Promotional Banners: Fixed Canvas, Template & Offers Carousel.**
✅ **CONCLUDED (PARTIAL BY DESIGN) 2026-08-01 — 78/89 tasks** (62/73 at sign-off + Phase 9's 16/16
post-sign-off fix). Sign-off record:
[specs/029-promotional-banner-carousel/SIGNOFF.md](specs/029-promotional-banner-carousel/SIGNOFF.md).
⚠ **"Concluded" closes the slice; it does not make the 11 open tasks true.** All eleven are operator
walks — **T051 (the bypass test) is still the most important open item on the platform**, and
**Android has still never been looked at** across 028 *and* 029.

Gives 028's advertising facet a canonical shape and a second placement. **The first real promotional
banners this platform has ever rendered** now appear on a device.
- **One canvas definition** — `packages/shared-types/src/banner-canvas.json` (1200×600, 2:1, 150 KB,
  marked text zone). In `shared-types`, **not** `design-system`: an admin Lambda importing a UI package
  to learn two numbers is wrong. Consumed by the seeder, the admin service, the console and the mobile
  renderer — **no literal `1200` appears in any of them** (Principle II).
- **⚠ Nothing is ever cropped, by construction.** FR-013 read like it needed crop arithmetic; locking
  the ratio at **both** ends (artwork 2:1 AND render box 2:1) removes the case entirely. That is
  exactly why the **server-side conformance check** — a ranged GET reading real dimensions from header
  bytes, which **refuses rather than resizes** — matters more than any rendering code here.
- **A dedicated offers carousel** (`HomeBlock.Offers`) distinct from 028's between-sections placement,
  via a new `banner_placement` column. A promotion is in one or the other, **never both** (FR-027).
- **Data**: one migration `20260731104629_promo_banner_placement.sql`.
- **⚠ THE OPERATOR HALF HAS STILL NEVER BEEN WALKED.** Every banner that exists was seeded straight
  into the database — which is **precisely the bypass path quickstart §2a exists to prove is refused**.
  So **T051 is the most important open item on the platform**: until someone presigns a URL, PUTs a
  wrong-shaped image and confirms the save is **REFUSED**, **FR-004 is decorative** and SC-002 rests on
  the seeder's arithmetic, not on enforcement. **T050** (console walk, SC-001 unmeasured) and **T054**
  (exhaustion take-down) are likewise unwalked. **⚠ Android has still never been looked at** — 028
  recorded that exact gap and asked it not be repeated; it was repeated.
- **⚠ Two live defects found and fixed, both structural.** (1) **The scrim was white** — it was
  `colorScheme.surface`, so light mode bleached the photo and put dark type on a white film over a busy
  image. The real error: **the artwork is the same picture in both appearances**, so the thing making
  type legible over it cannot be the thing that inverts. Now fixed dark + fixed light type, both ramp
  steps, no new colour. Its gradient was also bottom-left→top-right — **weakest exactly where the
  bottom-anchored title sits** — now vertical. (2) **⚠ `GET /v1/storefront/home` was intermittently
  503-ing the whole storefront** at exactly 3.007 s: `Home()` issued **8 strictly serial queries** and a
  Sydney RDS round trip **measures 135 ms** from local `core-api` → ~1.08 s of pure latency, **46% of a
  3 s budget**, so a cold pool tipped it over. **This is 027's defect recurring on the READ path** —
  027 recorded it, fixed the cart *write* path, and left this one untouched. Now two waves (ordering
  held outside the goroutines; the server owns section order), `-race` clean. **Measured 1.37 s →
  0.39–0.62 s.**
- **⚠ Also**: `pnpm -r test` was green while `typecheck` FAILED — **vitest does not run `tsc`**; caught
  only because the "Done" count fell 12→11, so counting reporting packages is now part of the sweep.
- **⚠ POST-SIGN-OFF DEFECT, FIXED 2026-08-01 — the banner tap went nowhere useful.** Found by the
  operator on device. `banners()` set `Target: {Kind: "search"}` for **every** promotion, so a tap
  opened the **unfiltered store** — the Search tab by another name — carrying **none of the
  promotion's facts** (no code, no terms). The real cause is in the **data model, not the
  navigation**: `promo_code` has **no product or category scoping**, so a whole-cart discount has no
  set of qualifying products to filter to. **A cart-level code is a message, not a place.** Fixed with
  a `promotion` target + a **promotion detail screen**, served by a new public hot-path read
  `GET /v1/storefront/promotions/:id` that **re-applies the same visibility predicate Home used**
  (shared as a SQL const so they cannot drift) — a promotion that expired or was exhausted between the
  Home read and the tap answers **404 → "this offer has ended", with no retry affordance**, never void
  terms. 028 gains **FR-034a/FR-034b**, which *narrow* FR-034 rather than contradict it: that rule
  protects **content** a shopper could miss, and a promotion detail restates the banner.
  **⚠ The test that should have caught it asserted the defect** — `banner_test.go` demanded
  `Kind == "search"`, encoding the same misreading as the code; and the cross-language wire contract
  pinned `{"kind":"sale"}`, **a shape no banner ever emitted**. Both now pin the real payload.
  **⚠ Also fixed**: mobile mapped **404 → `AppError.Unexpected`**, so "that isn't there" reached the
  shopper as "something broke, try again". `AppError.NotFound` now exists.
  **✅ FIXED ON BOTH SURFACES** — `customer-web` gained **`/promotions/[id]`** (`◐ PPR`, **noindex**,
  **uncached** alone among the public reads, since "still available" is a live claim other shoppers
  can falsify; one client component, the copy button; **171.0 KB / 174 KB**, added to the bundle
  gate's route list in the same change). Web routes on **`href`**, mobile on **`target`** — the closed
  vocabulary exists because mobile has no URL router — so the server sets **both from one promotion
  id** and a Go test pins that they agree. ⚠ **Half a carry-forward remains**: web's banner **face**
  still ignores `code`/`terms`/`placement`; FR-037d holds anyway ("from the banner **or from where it
  leads**"). ⚠ **Neither surface has been walked live**, the refusal path least of all.
- **⚠ Outstanding request**: `FREEZER12` was to be unadvertised (Home should carry **two** banner
  placements, not three). The seed file records it; the database still has it advertised.
- **Carry-forwards**: `customer-web` still ignores `code`/`terms`/`target`/`placement` (a promotion with
  a minimum shows there **without its terms**); the category rollup; mobile telemetry now **ten**
  consecutive slices deferred; `/search` and `/cart` sit **0.5 KB and 0.2 KB** from the 174 KB gate.

**028-mobile-home-merchandising — Customer Mobile Home: Sectioned Merchandising & Search Entry.**
✅ **SIGNED OFF (PARTIAL BY DESIGN) 2026-07-31 — 74/77 tasks.** Sign-off record:
[specs/028-mobile-home-merchandising/SIGNOFF.md](specs/028-mobile-home-merchandising/SIGNOFF.md).

Replaces the customer mobile Home tab's flat "Discover" grid with a merchandised, sectioned storefront:
a one-tap search handoff (keyboard already up), named horizontally-scrolling rails with "see all",
a category shortcut row with 13 authored vectors, and promotional banners driven by real back-office
promotions. **⚠ It REVERSES 026's FR-025a for the Home tab**, on operator direction (FR-003) — every
other 026 screen is untouched, and the virtue 026 was protecting is retained as SC-002/SC-006.

- **Data**: one migration `20260731072813_promo_advertising.sql` — an **advertising facet** on
  `promo_code` (5 columns + a CHECK making an advertised-but-untitled promotion **unrepresentable** +
  a partial index). No new table. **Advertising is opt-in and defaults to false** — private promotions
  (a goodwill credit for one customer, a partner code) are ordinary, and the default is the only thing
  between them and the public storefront. Exhaustion is **counted from `promo_redemption`, never
  stored** (027's rule), which is what makes an exhausted promotion stop advertising itself.
- **Paths**: Home read → **hot path** (`core-api/storefront`); advertising a promotion → **cold path**
  (`edge-api/admin/promotions`). Exactly the split `promo_code` already had.
- **Principle II**: the S3 presign helper was **promoted** from `shop/products/media.ts` into
  `@effy/edge-shared` and consumed by both services — **shop's 164 tests pass unmodified**, which is
  the proof the extraction changed no behaviour.
- **⚠ 027's biggest carry-forward is CLOSED.** That post-mortem named a Go↔Kotlin contract test as
  "the strongest carry-forward" and did not build it. `wire_contract_test.go` +
  `BannerWireContractTest.kt` now share one **byte-identical JSON literal**, duplicated by hand.
  Proved by breaking it two ways: `int`→`float64` fails at compile time; a silent `json:"terms"`
  rename compiles fine and is caught by the byte comparison.
- **⚠ FIVE defects found, four with the same signature** — a test passed because the FIXTURE agreed
  with the code rather than with the world (027's lesson, recurring):
  (1) the **category row rendered nothing** — every product's primary category is a leaf,
  `productCount` does not roll up, so all three top-level categories reported 0; and category
  filtering is exact-match everywhere, so a top-level shortcut would have opened an empty screen.
  **FR-024/SC-004 were amended in the spec**, not patched in code alone (Principle I).
  (2) **rail tiles ignored their width** — `BoxWithConstraints` inside a `LazyRow`, whose main axis is
  **unbounded**. (3) **images had no loading state** — the placeholder only ran when the URL was null.
  (4) **the skeleton could not match the content** — a `Row` allocates width sequentially and coerces
  `Modifier.width()` into what is left; fixed by building it from the **same primitives** (`LazyRow`).
  (5) **"See all" was a 40dp touch target** with five identical labels.
- **⚠ Also corrected**: six verification tasks marked complete on reasoning rather than checking.
  Re-opened and audited; three of the defects above fell out of that audit.
- **⚠ OPEN (operator)** — 3 tasks, all in [SIGNOFF.md](specs/028-mobile-home-merchandising/SIGNOFF.md):
  **T068** the advertised-promotion walk — **no promotion was ever marked advertisable, so the banner
  has never rendered**; the whole operator half is machine-verified only, and research **R9's headline
  design risk (does a hueless banner draw the eye?) is unanswerable** until it is. **T003/T069** no
  measurements taken (SC-005/SC-006/SC-008 unmeasured). Also unwalked: SC-009 (5/5 testers), SC-010
  (screen reader), SC-011 (dark/large-text/tablet), SC-012 (empty store), and **SC-013 — only iOS was
  ever looked at; nobody has seen Android**.
- **Carry-forwards**: a **category rollup** (recursive CTE) is what would make top-level shortcuts
  possible; `customer-web` still ignores `code`/`terms`/`target`/`position`, so a promotion with a
  minimum shows there **without its terms**; mobile telemetry remains deferred (7 more events
  specified, none emitted). Parity register:
  [docs/audiences/customer-capabilities.md](docs/audiences/customer-capabilities.md) §028.

**027-customer-cart-sync — Customer Cart Synchronisation, Promotions & Order Rules.** ✅ **118/142 tasks
— every feature phase BUILT + fully machine-verified. Live sign-off + commit pending.**

The slice that makes the cart an **account-level thing**. It started from a one-word answer: does the
customer-mobile cart save to the backend? No — and it never had. **Three stacked defects, all
pre-existing from 019, each masked by the one in front:**
- **R12a (the real cause)** — one auth plugin sent the **ID token** to both backends. `core-api` requires
  `token_use == "access"`, so every mobile cart write was rejected. Fixed with a `BearerToken` enum and a
  pure, testable `authHeadersFor(bearer, session)` in `EffyHttpClient.kt` — Edge takes id+access, Core
  takes access. **Necessary but not sufficient.**
- **R12b** — `auth.PoolVerifier` accepted exactly ONE app client per pool (`claims.ClientID != v.clientID`),
  so the mobile client was refused even with the right token. Now a `clientIDs []string` set; the Makefile
  passes `web,mobile` from SSM.
- **R13 (the one that survived both fixes)** — Kotlin serialised quantities as `Double`, so the wire
  carried `1.0`; Go's `encoding/json` refuses `1.0` into an `int`. Found by querying the DB directly
  (revision 1, zero items) rather than by any test. Fixed **at the contract** — a `WireInt` alias carrying
  `@asType integer` in `packages/shared-types/src/cart.ts`, so the generated Kotlin cannot regress.
- **⚠ The lesson**: every unit test passed throughout, because the fakes spoke Kotlin at both ends and
  never crossed the wire. **A generated-Kotlin-vs-real-Go contract test would have caught R13 on day one**
  and is the strongest carry-forward from this slice.

**The design (research R0 — it supersedes 019's R8 "Option B").** The **platform is authoritative**; each
surface keeps an **optimistic local mirror**. Every mutation is *mirror first, send second*, always in
that order. Correctness comes from three properties rather than from locking:
- **Absolute quantities** — which is what lets ten stepper taps debounce into ONE request without
  corrupting the total (SC-005). With increments it would be unsafe.
- **`changeId` per shopper ACTION, not per attempt** — a retry reuses it, so a request that arrived
  without its response reaching us cannot apply twice (FR-018).
- **A monotonic `cart.revision`** — a slow response can never overwrite a newer cart. The merge is
  **union with MAXIMUM quantity**, so the guest→account fold is idempotent and safe on every sign-in.

**Built (all three surfaces + the operator console):**
- **`core-api/cart`** — the full resource (add · set · remove · clear · merge · preview · reorder ·
  set-aside/restore/discard · apply/remove promo), a combined `AllLines` read, and `checkoutState` (the
  minimum-order gate, re-decided at intent time — the client never decides it). New
  `platform/cartpolicy` reads the order rules. Promo evaluation is a **pure** file (`promo.go`) with
  **eight distinguishable refusals**, because "that code doesn't work" tells a shopper nothing about
  whether to wait, spend more, or give up.
- **`customer-mobile`** — `CartStore` (forward-only adopt), `CartSyncCoordinator` (debounce · drain ·
  backoff · a persisted offline queue), use cases, `HttpCartRepository`. Plus **`EffyPullToRefresh`** — a
  shared gesture with an elastic follow — on Cart, Home, Search, Orders and Favourites.
- **`customer-web`** — `cart-store` (versioned key + legacy migration) · `cart-api` · `cart-actions` ·
  `cart-sync`, a `PromoField`, and the below-minimum gate.
- **`back-office` promotions console (US10)** — `edge-api/admin/src/promotions/` (9 routes) +
  `features/promotions/` (register · detail · order rules). **`redemptionCount` is COUNTED from
  `promo_redemption` on every read, never stored** — a counter and the rows can disagree, and then nobody
  knows which is true. That is also what makes **FR-068** enforceable: a redeemed code's window, caps and
  status can change; **its value cannot**, because a paid order's discount was computed from the
  definition as it stood. The rule is enforced **inside the writing transaction** under `FOR UPDATE`, not
  in the service — a code can be redeemed between a check and a write.
- **Data**: one migration `20260730102329_cart_sync_promotions.sql` — 5 new tables (`promo_code`,
  `promo_redemption`, `order_policy`, `cart_saved_item`, `cart_change_log`), 3 altered.
- **⚠ Latency fix**: the first working write timed out — ~14 round trips to Sydney RDS inside a 4 s
  budget. Pruning left the write path, a combined read replaced N queries, timeout → 12 s.
- **⚠ Regression found by the operator on device and fixed**: adding pull-to-refresh wrapped the empty
  cart in a `verticalScroll` Column, which **top-aligns** — silently un-centring the 026 empty state.
  `fillMaxSize()` *before* `verticalScroll` plus `Arrangement.Center` restores it.
- **⚠ Bundle**: a static `import { capture } from "@/lib/telemetry"` in one cart client component cost
  **+1.0 KB on four GUEST routes** and put `/search` and `/cart` over the 174 KB gate. Both promo events
  and the removal event now fire through a **dynamic** import — byte-neutral. Measured delta vs HEAD:
  **+0.2…+1.1 KB**, all inside budget. ⚠ `/search` sits **0.5 KB** from the limit.
- **Verified**: `pnpm -r typecheck`, **847 JS/TS tests**, `turbo build` (3 web surfaces), Go
  build/vet/test/gofmt, both mobile suites + `assembleDebug` + the iOS compile, `cm-guard`/`sm-guard`,
  `cm-contract-check` (no drift), `tokens:check` **unchanged** (this slice adds no token), `depcruise`
  clean, bundle budget green. Also **fixed three pre-existing red gates** the sweep surfaced: two
  orphaned mobile drawables (`ic_notifications_outlined`, `ic_location_outlined` — used but never
  promoted to the `mobile-assets/` SSOT) and the unused KMP-template `compose-multiplatform.xml`.
- **⚠ Open (operator)** — the 12 remaining tasks are all live walks: **T011** `make db-up ENV=dev` (the
  migration; 003 commit-guard), **T104** `make edge-deploy SERVICE=admin ENV=dev` + create the eight
  fixture codes **through the console**, `make core-run`, then quickstart §3/§4 — cross-device sync,
  force-quit survival, the guest→sign-in merge, the debounce request counts, the eight promo refusals,
  the Stripe webhook re-delivery, the `curl` bypass attempts, the **rendered** two-shop below-minimum
  cart (SC-017's phrasing half), and the Playwright cart spec (`e2e/cart.spec.ts`, 18 tests — it needs a
  live `core-api` and a seeded catalogue). Then **T134** sign-off + **T135** commit.
  Spec/artifacts: [specs/027-customer-cart-sync/](specs/027-customer-cart-sync/); parity register:
  [docs/audiences/customer-capabilities.md](docs/audiences/customer-capabilities.md) §027.

**024-brand-icons-splash — Brand Marks: App Icons, Splash Screens & Favicons.** ✅ **Code-complete +
fully machine-verified; device sign-off + commit pending.**
The platform's first brand-identity slice. Before it, **not one of the six surfaces carried the Effy
mark** where a person first meets it: two consoles had no favicon at all, all three mobile apps still
shipped the **stock Android template robot**, and **no mobile app had a splash screen** — a tap opened
onto a blank white frame.
- **One authored vector → 57 committed assets** via a new **`packages/brand`** (`@effy/brand`),
  deliberately shaped like `design-system`'s `tokens:gen`/`tokens:check`: authored source → **committed**
  derived artifacts → a drift check that fails and **names the stale surface**. `make brand-gen` /
  `make brand-check`; the gate rides `pnpm test` (`make lint` is Terraform-only and never runs it).
- **Three colourways, one mark** — **Emerald** `#10b981`/`#065f46` (customer-web + customer-mobile),
  **Sky** `#0ea5e9`/`#075985` (shop-web + shop-mobile; amended 2026-07-27 from blue-500 `#3b82f6` /
  blue-800 `#1e40af` — hue gap to emerald narrows ~57°→~38°, so the SC-002/SC-003 side-by-side
  observer test is now load-bearing), **Neutral** (back-office). The navy outline
  `#0C1D36` and off-white tag `#F4F5F7` are **shared by all three** — that invariant is what makes them
  read as one brand at two hues (SC-003), and it is unit-tested.
- **⚠ The supplied artwork was in the RETIRED Jade palette** (`#0FB57E`/`#047857`) — committing it would
  have failed `scripts/check-no-jade.sh`, which scans `*.svg`. The committed master is recoloured into
  the live palette, using the **lighter emerald-500 for the bag body** so the mark stays legible at
  16 px where emerald-800 alone reads near-black. **No constitution amendment, no guard exemption.**
- **⚠ The shop sky blue is NOT a design token (FR-014a).** `@effy/brand` does **not depend on**
  `design-system`; no token added, **no Compose theme regenerated** (proved by `tokens:check` passing
  unchanged). Shop UI stays emerald — Principle V's single-accent rule untouched.
- **Composition is vector-space, from a MEASURED bbox** (`x 136.0…379.8, y 71.8…414.8`; the mark fills
  only 48.8%×68.7% of its authored canvas, off-centre). 11 profiles declared by **occupancy**, so
  Android's **66/108 dp safe zone** (≤61.1%) is an asserted invariant, not a hope.
- **Toolchain**: `@resvg/resvg-js` renders, `sharp` strips alpha, a **25-line stdlib ICO writer** (no
  third image dep). iOS icons are **PNG colour-type 2** — App Store rejects *any* alpha channel, even
  opaque, and the generator now **cannot emit a rejectable icon**. Android gets **VectorDrawables**
  (fg/bg/**monochrome** themed layer + splash) via a converter that **fails loudly** on geometry it
  doesn't understand; legacy raster mipmaps remain for **API 24–25 only**.
- **Splash**: `androidx.core:core-splashscreen` 1.0.1 (backports to API 21 → one mechanism for the whole
  `minSdk 24…36` range) + `installSplashScreen()` before `setContent`; iOS a storyboard-free
  `UILaunchScreen` dict — landed **atomically** with `INFOPLIST_KEY_UILaunchScreen_Generation → NO`,
  which conflicts with it.
- **⚠ Splash ground is a BRAND colour (amended 2026-07-27, operator request)** — customer `#4ade80`
  (green-400), shop `#3b82f6` (blue-500), **one value per app, light AND dark**. It replaces the
  original `#EFEFF1`/`#171717` app-surface ground, whose entire purpose was a seamless splash→app
  handover (FR-011); that seam is now **accepted by design**, and **FR-013's light/dark rule no longer
  applies to the splash ground** (it still binds every icon variant). Declared once in
  `packages/brand/src/compositions.mjs` `SPLASH_GROUND`; the iOS `LaunchBackground.colorset` is
  generated from it, the Android `values{,-night}/colors.xml` are hand-maintained to match. **Still
  asset-local (rule C4)** — no token, no Compose theme, app UI stays emerald. ⚠ Note the shop splash
  is **blue-500 while the shop mark is sky-500** — a deliberate two-tone, not a drift.
- **Latent defects fixed** (found, not introduced): `layout.tsx` imported **`next/head`** — a Pages
  Router API, **inert** in the App Router, so its Apple title never rendered; manifest carried
  placeholder `#ffffff` brand colours; PWA icons declared **only** `maskable`; both Android launcher
  labels were developer strings (`customer-mobile`/`shop-mobile` → **"Effy"**/**"Effy Shop"**).
- **Verified**: 84 new brand tests + **792 JS/TS tests**, `pnpm -r typecheck`, all three web builds,
  both Android builds + both KMP suites, `mobile-guard`, `check-no-jade`, `tokens:check`. **SC-009
  proven** (two full regenerations byte-identical) and **SC-008 proven by deliberately breaking it**
  three ways — stale / orphaned / missing, each exiting non-zero and naming the surface.
- **⚠ Bundle**: `customer-web` guest budget is **167.4 KB / 160 KB** — measured **byte-identical with
  this feature stashed**, so the overage is entirely **pre-existing** (recorded under 020) and this
  slice is byte-neutral. It ships zero client JS.
- **⚠ LIVE-ONLY BUG found on first device run, FIXED + device-verified (2026-07-26).** Neither the
  launcher icon nor the splash appeared. Cause: the SVG→VectorDrawable converter's attribute regex was
  `[a-zA-Z-]+`, which **cannot match `x1`/`y1`/`x2`/`y2`**, so the mark's three `<line>` elements (the
  tag's diagonal strokes) emitted `android:pathData="M undefined,undefined L undefined,undefined"`.
  That is **valid XML** — it compiled through aapt2 and packaged into the APK — but Android's
  `PathParser` throws on it, so the **whole drawable failed to inflate** and both the adaptive icon and
  the splash silently fell back to system defaults. The only signal was one logcat line:
  `W ShellStartingWindow: Get attribute fail … drawable/ic_splash_logo`. **The lesson**: the converter
  claimed to "fail loudly on geometry it doesn't understand" — it understood `<line>` perfectly and
  then emitted rubbish. Fixed three ways: the regex admits digits; coordinates are validated as finite
  numbers at conversion; and **`assertRenderable()` now tokenises the emitted pathData the way a path
  parser does** and refuses to write anything Android could not inflate. 17 regression tests added
  (**101 brand tests**). Re-verified on an API-36 emulator: splash renders the full mark, launcher icon
  renders unclipped inside the circular mask. **No raster asset was ever affected** — iOS and web go
  SVG→resvg and never touch the converter.
- **⚠ Open (operator)**: physical **iOS + Android** sign-off — SC-004 (no clipping across launcher mask
  shapes), SC-005 (branded splash on cold launch), SC-007b (dark/tinted/themed variants); the
  **side-by-side observer test** SC-002/SC-003 with both apps on one device; SC-007a (three web tabs);
  and the **commit**. **`apps/driver-mobile` is untouched by design (FR-020)** — this slice brands five
  surfaces, not six. Spec/artifacts: [specs/024-brand-icons-splash/](specs/024-brand-icons-splash/).

**020-shop-order-fulfillment** — Shop Order Fulfillment (Receive → Pick → Handoff). ✅ **SIGNED OFF
(partial by design) 2026-07-21 — 89/93 tasks. The commerce→fulfilment loop is PROVEN LIVE.**
Gives the 019 fan-out a consumer: 019 wrote one `shop_fulfillment` per (order, shop) and **nothing read
it** — its status never left `pending`. 020 is that consumer — an order **queue**, a **pick screen**, and
a **state machine** (`pending → received → picking → ready_for_pickup` + dev-only `collected`), at parity
on **both** shop surfaces (shop-web + shop-mobile, whose Orders tab was a placeholder).
- **Path (Principle III)**: shop side → **cold path** `apis/edge-api/shop/fulfillments/` (`/shop/v1/
  fulfillments…`) — the doctrine's "internal operator console" (research R1 inverted the spec's guess:
  core-api has no cloud deploy, so a hot-path queue could never go live). The **customer** half (US5,
  anonymous progress + terminal-gated shortfalls) stays on the **hot path** `core-api/orders` — one
  capability, two audiences, two paths, exactly the operator's rule.
- **Data**: one migration `20260720093119_shop_order_fulfillment.sql` — widens `shop_fulfillment.status`
  to the 5-state machine + `state_changed_at`; new `fulfillment_item` (pick progress + shortfall, kept
  OFF the receipt line) + append-only `fulfillment_event` (the sole accountability control, since **both**
  `shop_manager` and `shop_staff` have full access — FR-019a).
- **PROVEN LIVE (SC-001/SC-002)**: real Stripe test-card checkout → order `EFY-HVX2AE` `paid` → fan-out to
  2 shops (`shop one` 2/$20.00, `Effy SHOP TWO` 6/$37.80; Σ $57.80 == item subtotal); a shop advanced its
  portion to `picking` in the app. Code-verified: workspace typecheck + **576 JS/TS tests** + build, Go
  build/vet/test/gofmt, **152 shop-mobile tests** (Android+iOS), mobile-guard, contract drift guard.
- ⚠ **Live-only bug found + fixed during sign-off**: `apis/core-api/.../checkout/stripegateway.go` now uses
  `ConstructEventWithOptions{IgnoreAPIVersionMismatch: true}` — a newer account API version
  (`2026-05-27.dahlia` vs stripe-go/v82's `2025-08-27.basil`) was 400-ing **every** webhook and stranding
  every paid order at `pending_payment`. A 019 checkout fix that only 020's first live run could surface.
- ⚠ **Carry-forwards (NOT done)**: SC-005 (concurrency), SC-007 (adversarial no-leak), SC-010 (the *second*
  shop surface live), SC-011/012 (shortfall flow), SC-013 (deployed stub 404 probe) are unit-proven not
  live; the full SC table walk remains (quickstart §4). **`customer-web` 160 KB guest-bundle gate is at
  167.3 KB — PRE-EXISTING, byte-identical with 020 reverted; needs its own fix.**
- ⚠ **The dev-only pickup stub has NO route in any environment** (FR-031): `POST .../pickup` returns 404;
  invoked locally only via `apis/edge-api/shop/scripts/invoke-pickup-stub.mjs`. Removal trigger = the
  driver slice. **`scripts/stripe-listen.sh`** (new) syncs the CLI webhook secret into Secrets Manager +
  records the forward URL in SSM before forwarding — kills the secret-drift that stranded the first order.
  Spec/artifacts: [specs/020-shop-order-fulfillment/](specs/020-shop-order-fulfillment/); parity register:
  [docs/audiences/shop-capabilities.md](docs/audiences/shop-capabilities.md) §020.

**019-customer-commerce-flow** — Customer Commerce Flow (Browse → Order). ✅ **SIGNED OFF 2026-07-20 —
68/77 tasks; verified on all three surfaces. TWO CARRY-FORWARDS (below) are NOT done.**
- ⚠ **Carry-forward 1 — Android card payment is a PLACEHOLDER.** `AndroidPaymentDriver` returns a
  "use web checkout" failure; the real Stripe **PaymentSheet** (SDK + Activity `ActivityResultRegistry`
  wiring) is still outstanding (**T003/T006/T054**). iOS Swift-bridge path is coded (compile-verified,
  not device-run). **Web checkout is fully live.**
- ⚠ **Carry-forward 2 — no live end-to-end purchase has ever run.** SC-001/SC-002 are unproven live;
  Stripe→webhook→finalizer has never executed against real Stripe. Needs `stripe listen` + a test-card
  checkout. (Also outstanding: Playwright E2E T053/T060/T066/T070, `FULL=1` testcontainers.)
- ✅ **SC-005 (multi-shop fan-out) + SC-006 (idempotency) PROVEN** against the live dev schema with real
  two-shop data: 3 lines / 2 shops → exactly 2 `shop_fulfillment` rows, each only its own shop's items,
  Σ subtotals == order subtotal, 4 items ordered == 4 fanned; re-run inserted 0 rows. (Rolled back.)
- **Dev seed data**: 2 shops — `shop one` (26 products) + `Effy SHOP TWO` (12 grocery/household) — 92
  Openverse CC images in S3 (presign-verified). Seeder is scratchpad-only (not yet in the repo).
The platform's **first commerce slice** — the customer's complete journey (discover → product → cart →
checkout → **Stripe** pay → receipt → **multi-shop fan-out**) on **both** customer surfaces, served by the
**hot path** (`core-api`, FR-028). Turns the 016 catalog into a shoppable storefront.
- **Backend (net-new on the Go hot path)**: `storefront` (home rails, product detail, **search** w/
  `pg_trgm` + keyset pagination), `cart` (server cart + merge, re-price, unavailable-exclusion, flat
  `addresses`, `checkout` (server-authoritative amount, **deterministic-idempotency**
  PaymentIntent, the **signature-verified webhook finalizer** = paid-transition + per-shop
  `shop_fulfillment` fan-out + `order.placed` **outbox** + empty-cart, all one tx), `orders` (receipt +
  history), `favorites`. New platform pkgs: `money` (integer-cents), `pricing`, `events` (outbox),
  `customeridentity` (`sub→customer.id` + barred gate), `media` (S3 presign via built-in
  `s3.NewPresignClient`). **Payment = Stripe** (`stripe-go/v82`); the SECRET never leaves core-api.
- **Web** (`customer-web`, Next 16): merchandised Home, product page, search (infinite scroll), cart,
  the **Stripe Payment Element** checkout (under `app/checkout/`, OUTSIDE the `(shop)` Amplify
  quarantine — session-safe), webhook-authoritative receipt, orders, favourites. ⚠ **Dependency-free
  cart** (`useSyncExternalStore` — no TanStack, by this app's tiny-guest-bundle design). All commerce
  routes build as **`◐ PPR`**; Stripe stays out of the guest bundle.
- **Mobile** (`customer-mobile`, KMP): the same flow — catalog/cart/checkout/orders/favorites features
  (Clean-Arch + MVVM), a `PaymentDriver` capability (real **iOS** Swift-bridge path; **Android**
  PaymentSheet is an operator-gated placeholder), a saveable Home back stack (Home→Product→Cart→
  Checkout→Receipt). Commerce DTOs generated to Kotlin (`contract/CommerceDto.kt`, own package).
- **Data**: one forward-only migration `20260719120000_customer_commerce.sql` — `public.{customer_address,
  cart, cart_item, order, order_item, shop_fulfillment, payment, stripe_event, customer_favorite,
  event_outbox}`.
- **Verified (all layers)**: `go test` (storefront/cart/checkout/money/…); web `pnpm typecheck` + Vitest
  (63) + `pnpm build`; mobile **iOS Kotlin/Native compile + `commonTest` all green**. Secret/PII sweep
  clean (no card data — Stripe Elements/PaymentSheet own it). Parity register updated
  ([docs/audiences/customer-capabilities.md](docs/audiences/customer-capabilities.md) §019).
- **⚠ Open (operator / device)**: commit + `make db-up ENV=dev` (the migration; 003 commit-guard);
  Stripe **test** keys → Secrets Manager + client env/`secrets.properties` (T003/T006); `make core-run` +
  webhook tunnel (`stripe listen`); core-api role `s3:GetObject` on the media bucket; the **Android
  PaymentSheet** + iOS `SwiftPaymentBridge.swift`; Playwright/`FULL=1` testcontainers/on-device E2E;
  **cloud go-live tracks the hot path's own deploy slice** (core-api is local-only). Spec/artifacts:
  [specs/019-customer-commerce-flow/](specs/019-customer-commerce-flow/).

**017-platform-theme-tokens** — Platform Theme & Design Tokens Refresh. ✅ **Concluded — web complete +
verified; mobile theme foundation done + drift-guarded; not committed.**
A platform-wide rebrand + a runtime appearance switcher, all from the ONE token SSOT
(`packages/design-system/src/tokens.css`).
- **Brand → Effy Emerald `#065f46`** (emerald-800, white label both modes; focus ring brightens to
  `#10b981` on dark) + terracotta destructive (`#bf5540`/`#dd8368`), over the **shadcn `neutral` scale**
  (no brand tint / no green-black blend). Light `#f5f5f5` ground / white cards; dark `#171717` ground /
  `#262626` cards / subtle neutral-800 borders / `#101010` sidebar. Typeface **Nunito Sans**; radii pinned
  sm 8 / md 16. Constitution amended → **v1.10.0** (Jade retired).
- **Runtime appearance switcher** — Light / Dark / Follow-System, default System, persisted, live OS
  tracking. Web: `@effy/web-kit` `ui-store` tri-state + 3-way `ConsoleUserMenu` (consoles); `next-themes`
  + a header `AppearanceControl` island (customer-web). Mobile: `AppearanceMode` + `EffyTheme(mode)`.
- **All SIX surfaces share the theme** — the generator emits `compose/` (customer), `compose-shop/`,
  **`compose-driver/`** (driver-mobile wired in, no longer a template exception), all srcDir'd + diff-guarded
  together by `tokens:check`. **WCAG AA machine-enforced** by `scripts/check-tokens.mjs`; **no-Jade** sweep
  `scripts/check-no-jade.sh`.
- **Verified:** `pnpm -r typecheck` + web tests (web-kit 44 · shop-web 106 · customer-web 45 · back-office
  36) green; customer-web build (PPR) + `size` 159.0/160 KB + `depcruise` clean; guards + negative proofs green.
- **Operator/toolchain-gated:** mobile Nunito Sans `.ttf` + Compose `Typography`, mobile persisted store +
  Account switcher UI, Android/iOS device builds, customer-web E2E, and the commit.
  Spec/artifacts: [specs/017-platform-theme-tokens/](specs/017-platform-theme-tokens/).

**015-mobile-app-shell** — Mobile App Shell & Navigation (Customer + Shop). ✅ **BUILT + live-validated on
device (Android + iOS); not yet committed.**
A **mobile-only** slice (no backend/infra/DB): a production **navigation shell** for **both** KMP apps,
replacing the interim single-destination navigators (013/014). One shared, audience-neutral package —
**`packages/mobile-kit`** (the mobile analogue of `@effy/web-kit`, `srcDir`'d into both apps, neutral
package `com.effyshopping.mobile.kit`): `ui/WindowSize` (adaptive sizing — **the customer app's first
adaptive layer**), `nav/NavKey` (`@Serializable` route marker + polymorphic serializers), `nav/TabBackStacks`
(**developer-owned per-tab back stacks**, saveable across config change + process death) and
`shell/AdaptiveNavShell` (bottom bar on compact ↔ **navigation rail on expanded**).
- **Shop (login-first)**: session-gated shell, 4 tabs (Home · Catalog · Orders · Account, latter two
  "coming soon"), rail on tablet / bar on phone, identity as sectioned rows (no card), sign-out in Account.
  Old `AppNavigator`/`AppRoute`/app-local `WindowSize` deleted.
- **Customer (guest-first)**: adaptive shell, 4 tabs (Home · Search · Orders · Account); Home/Search
  **public**; Orders/Account visible but **gated** — tapping raises **deferred sign-in** and returns to the
  intended tab (**return-to-intent**). The 013 auth/account sub-graph is **reused unchanged** inside the
  Account tab (its existing `AppNavigator` drives that tab); sign-out → guest shell, public content intact.
- **⚠ Mechanism deviation (recorded)**: the operator asked for **Jetpack Navigation 3**, but the shell is
  built on **stable Material 3** (`NavigationBar`/`NavigationRail`) + a hand-rolled back stack — the R1
  escape-hatch, chosen so the shell is **fully build-and-test-verified on Android AND iOS** without the
  Nav3 iOS spike (Nav3/adaptive artifacts are alpha/**beta** with an unverified iOS runtime). Routes are
  already `@Serializable` `AppNavKey`s → a later Nav3 migration is a presentation-layer change. The two
  `SessionGate`/`PendingIntentStore` primitives were built then dropped (each app's exhaustive
  `when(session)` gate + a `rememberSaveable` return-to-intent are simpler + more type-safe) — **no dead code**.
- **Adaptive is size-driven, not OS-driven** (`widthClassFor`: <600dp bar, ≥600dp rail) — so an Android
  phone shows a bottom bar and an iPad shows a rail *for the same app* (by design; the confirmed clarification).
- Status: **BUILT + verified** — both apps compile + unit tests green on Android (mobile-kit: WindowSize 3 /
  NavKeySerialization 2 / TabBackStacks 5), **iOS frameworks link**, `mobile-guard` clean; both apps run on
  device (Android bar + iPad rail confirmed). **Deferred (documented in tasks)**: 4 extra `commonTest` units
  (behavior is compile-verified + live-validated); the Phase-0 Nav3 iOS **spikes** (moot for the stable-M3
  build; run only if migrating to Nav3). Mobile **telemetry** remains deferred (013/014 pattern). Parity
  registers updated for both mobile surfaces. Spec/artifacts:
  [specs/015-mobile-app-shell/](specs/015-mobile-app-shell/) (incl. `SPIKES.md`).

**014-shop-mobile-foundation** — Shop Mobile Foundation (Bootstrap). ✅ **SIGNED OFF (partial by design);
committed.**
The platform's **fifth client surface**: `apps/shop-mobile` (KMP + Compose, Clean Architecture + MVVM),
the shop-operator app. "013 for the shop audience" — the tech spine is ported from `apps/customer-mobile`
with the shop deltas: **strictly passwordless EMAIL_OTP** (no password/sign-up/recovery — the audience's
rules made structural in the `AuthDriver` interface), a **single access-token bearer** to `/shop/v1/*`
(not customer's two-token protocol, D2s), and **RBAC done right** — role-aware UI is a courtesy, the
**backend manager gate** (`GET /shop/v1/manager-ping`) decides (role AND status AND active-shop scope),
uniform + fail-closed.
- **New Cognito client**: a dedicated **`shop_mobile`** app client on the existing shop pool
  (`infra/envs/dev/auth-shop.tf`) — EMAIL_OTP only (no SRP), 30-day refresh (shared workplace device,
  D6s), added to the shop edge authorizer's audience. Additive; the pool is untouched.
- **Tablet-first (FR-003a)**: the primary device is a **large-screen tablet in landscape**; layout is
  **window-size-driven** (`AdaptiveContent` over Material 3 breakpoints — never an `isTablet` boolean),
  the pattern every later shop-mobile UI slice extends.
- **Shared-infra generalizations (Principle II)**: the Compose-theme generator now emits a **per-app
  package** (`packages/design-system/compose-shop`); the mobile secret-guard covers **both** apps. During
  the slice a clean-architecture pass added a **formal use-case layer to both mobile apps** and removed the
  service-locator container seam (ViewModels take explicit collaborators) — 013 was refactored in lockstep
  for parity.
- **Partial by design (like 007)**: the manager gate's **positive** half (a manager at an active shop →
  Granted) + inactive-shop/disabled denials need **009** shop data. **Deferred** (with owning slices):
  telemetry → `mobile-telemetry`; iOS HIG chrome → `iOS native shell`.
- Status: **signed off + committed** — both apps build/run on Android **and** iOS; shop 9 unit tests +
  customer 10 green; guards + drift + `terraform validate` clean.
  Spec/artifacts: [specs/014-shop-mobile-foundation/](specs/014-shop-mobile-foundation/); parity register:
  [docs/audiences/shop-capabilities.md](docs/audiences/shop-capabilities.md).

**013-customer-mobile-foundation** — Customer Mobile Foundation. **Built (the pattern 014 ports).** The
first KMP mobile surface: `apps/customer-mobile` — Amplify-native auth behind a `commonMain` `AuthDriver`
(Android Amplify + a Swift `IosAuthBridge`), the two-token protocol, three credential routes. Constitution
amended to **v1.8.0** (mobile presentation is **MVVM**, not MVI).

**012-customer-profile-management** — Customer Profile Management. **Code-complete + verified;
operator run pending (2 blocking spikes).**
Completes the customer account page: identity (name · email · **initials avatar**), name editing,
**change-or-set password**, and **sign out** — which the storefront did not have at all, despite the
parity register claiming it did (now corrected).
- **The slice exists for one requirement.** Cognito's `ChangePassword` docs: *"The user's previous
  password is required **if the user has a password**. If the user has no password… **you can omit this
  parameter**."* So **any bearer of a valid access token can silently plant a permanent password on a
  passwordless account** — turning a borrowed phone or a stolen token into durable, credentialed access
  that an OTP-only customer would never notice. **FR-017** closes it: setting a *first* password requires
  a **freshly emailed code**, verified **server-side in the same request that writes the password**, so
  there is no stored "grant" to steal. Changing an *existing* password requires the current one.
- **Two spec defects found during planning, fixed in the spec (not papered over)**: **FR-024** was
  *unbuildable* (Cognito's revocation is all-or-nothing — "revoke all but this device" does not exist), so
  it was made **stronger**: a password change signs out **everywhere, including this device**. **FR-022**
  was *bypassable* via "Forgot password?", which also left `has_password` permanently wrong — so recovery
  moved behind the backend (**FR-022b**).
- **`has_password` is a platform-owned column** — **Cognito cannot be asked** whether a user has a
  password (no API field; `UserStatus` doesn't distinguish). It is seeded at registration from a
  client-declared route, which is safe because **lying in either direction grants no capability the
  inbox-holder didn't already have**. It is a UX hint, never an authorization input.
- **The Cognito calls need NO IAM.** `ChangePassword` / `GlobalSignOut` / the attribute-verification pair
  are **token-authorized** — the Lambda relays the *customer's own* authority. The only new permission in
  the slice is `ses:SendEmail`.
- **Sign-out is a route handler + plain HTML form**, not a Server Action: `aws-amplify/auth/server` has
  **no `signOut`**, and importing the client one broke the quarantine guard (which was right). The header
  became a **server component** (`<details>` + `<form>`) — sign-out now costs **zero client JS**, works
  with JS disabled, and the guest bundle **fell 159.6 → 149.9 KB**. The correct architecture was cheaper.
- **Password policy → 12 chars, no composition rules** (a documented deviation from NIST's 15, valid *only*
  while breach screening + rate limiting hold) + **k-anonymity breach screening**, **fail-closed**,
  backend-only so it cannot be skipped by a hostile client.
- Status: **code-complete** — `pnpm typecheck` (11/11) + `pnpm -r test` (**286 tests**) + `turbo build` +
  **70 Playwright E2E** all green; both gates green (**149.9/160 KB** budget; quarantine clean **and proven
  by deliberately breaking it**); `terraform validate` + `fmt` clean; secret/PII sweep clean.
  **⚠ Open (operator)**: **T001/T002 — the two BLOCKING spikes** (does `ChangePassword`-without-previous
  actually work on our pool? and what does "Forgot password?" do *today* for a passwordless customer — that
  path is **live right now** and its behavior is unknown); **T059** (`make apply` — password policy;
  *abort if the pool would be replaced*), **T060** (migration + `db-up`), **T061** (`edge-deploy`), **T062**
  (**SES must send — without it, set-password does not work at all**; 010 dependency), **T069** (live SC
  sign-off incl. the adversarial SC-004/SC-005 proofs).
  Spec/plan/artifacts: [specs/012-customer-profile-management/](specs/012-customer-profile-management/).

**011-customer-storefront-web** — Customer Storefront (Bootstrap). **Code-complete + verified;
operator run pending.**
The platform's **fourth client surface and its FIRST PUBLIC one**: `apps/customer-web`
(`@effy/customer-web`, **Next.js 16.2.6** App Router on :3000). Every surface before it sits behind a
login and serves an Effy employee; this one is open to anyone, must be found by search engines, and
serves a person who has no account until they choose to make one.
- **Constitution amended → v1.7.0**: Principle IV's credential rule is now **per-audience**. The
  **customer** pool gains **email+password · email OTP · Google**, with **open self-registration**;
  **driver/shop/admin remain strictly passwordless EMAIL_OTP and admin-provisioned** ("no passwords"
  narrows to the platform's *internal* audiences, rather than being silently dropped). Linking a
  federated identity **requires a provider-asserted verified email** — linking on an unverified one is
  an account-takeover primitive, and that is written into the constitution as a prohibition.
- **SSR-first, guest-first**: `cacheComponents: true` (Next 16's Cache Components) makes PPR the
  rendering model, so public pages prerender into a **static shell** and the personalized header is a
  **server-rendered Suspense island** — personalization costs neither the cache nor the crawler. "Is
  this page still cacheable?" is now a **build error**, not a Lighthouse score three months late.
- **The Amplify quarantine (FR-006)**: `aws-amplify` lives **only** in `app/(auth)/`. Amplify's own
  docs put `Amplify.configure()` in the root layout — for a storefront that is exactly wrong (it lands
  in the shared chunk every page loads). Guests read session state **server-side** and download **zero
  bytes** of auth SDK — verified, not asserted.
- **Backend**: a new `apis/edge-api/customer` (customer authorizer) — `GET`/`PATCH /customer/v1/me`,
  record-backed identity + idempotent JIT upsert + the **barred-customer refusal** (a valid credential
  never overrides the record). Plus the **pre-sign-up account-linking Lambda**: without it, Google
  sign-in silently creates a *second* account and **there is no retroactive merge**.
- **Data**: one migration (`20260714120000_customer.sql`) — `public.customer`, keyed on `cognito_sub`
  (which **survives federated linking**, so one person keeps one record across all three routes).
- **The routing law (FR-028), binding on every later customer slice**: commerce (product · catalog ·
  search · cart · order · payment) → **hot path** (`core-api`); customer profile/account → **cold
  path**. Proven live against `core-api`'s `GET /v1/customer/ping`.
- **⚠ Two corrections made during implementation, both recorded in research**: (1) the **120 KB bundle
  budget was unreachable** — Next 16 + React 19's framework floor is ~136 KB with *zero* app code; the
  enforced budget is **160 KB** against a measured **148.5 KB**, and it still catches Amplify (proven
  by deliberately leaking it: 162.7 KB → build fails). (2) The **quarantine guard was initially wrong**
  — dependency-cruiser matches *direct* imports by default, so it reported clean while Amplify was on
  the home page via a component. Fixed with `reachable: true`; the lesson (*break a guard the way it
  will actually break*) is in research D11.
- Status: **code-complete** — workspace `pnpm typecheck` + `pnpm -r test` (**248 tests**) + `turbo
  build` green; **27 Playwright E2E** green (raw-HTML SSR, SEO, no-cloaking, auth-outage, deferred
  sign-in, open-redirect refusals); both gates green; `terraform validate` + `fmt` clean on all six
  roots; shellcheck clean.
  **Open (operator)**: **T050** (register the Google OAuth client — out-of-code), **T051** (`make apply
  ENV=dev`; *abort if any pool would be replaced*), **⚠ T052/T053** (the two **spikes** —
  `AliasExistsException` on first Google sign-in, and whether a never-had-a-password customer can set
  one; **both can change the design**), **T081** (commit the migration + `make db-up ENV=dev`),
  **T082** (`make edge-deploy SERVICE=customer ENV=dev`), **T090** (live SC sign-off).
  Spec/plan/artifacts: [specs/011-customer-storefront-web/](specs/011-customer-storefront-web/).
  Parity register: [docs/audiences/customer-capabilities.md](docs/audiences/customer-capabilities.md).

**010-domain-dns-foundation** — Platform Domain & Per-Environment Namespaces. **Code-complete;
operator run pending.**
Makes the platform authoritative for **`effyshopping.com`**, gives each environment a **delegated
child namespace**, moves the shared API onto **`edge-api.dev.effyshopping.com`**, and switches all four
Cognito pools to **branded sign-in email** (`no-reply@dev.effyshopping.com`). **Terraform only — zero
application code**, and the first slice since 002 with no SQL.
- **New root `infra/global/`** owns the parent zone. It is deliberately **not an environment**: env
  roots are destroyable (`make destroy ENV=dev` was used in the region relocation), and the apex must
  not be collateral. Each env root creates its own child zone **and its own `NS` delegation in the
  parent** — so destroy removes both together and no dangling delegation can be claimed.
- **Two new modules**: `dns-env-zone` (child zone + delegation + wildcard ACM cert, DNS-validated)
  and `ses-domain-identity` (SESv2 identity + DKIM/SPF/DMARC). Adding qa/staging is `env = "qa"`.
- **Additive cutover**: the raw `execute-api` URL stays alive (`disable_execute_api_endpoint` must
  remain `false`) and is published at `/effy/<env>/edge/api_default_endpoint`. The existing
  `api_endpoint` key keeps its name and gains a better **value** → every reader picks up the branded
  address with zero code edits.
- **Why the email half matters**: EMAIL_OTP is the **only** credential the platform issues, on all
  four pools. The built-in Cognito sender caps at ~50/day from a generic AWS address. Two alarms ship
  with it — an SES reputation breach *pauses sending*, which means **nobody can sign in at all**.
- **⚠ Ordering is load-bearing**: `make global-apply` → **repoint GoDaddy** → `dig` to confirm →
  `make apply ENV=dev` → `make mail-verify` → flip `ses_sender_enabled = true` → apply again. ACM
  validation and SES DKIM both need *public resolution*, so an early apply blocks 45 min and fails.
  Cognito additionally **rejects an unverified SES identity**, which is why the pool switch is its
  own stage.
- Status: **code-complete** — `terraform validate` green on all roots, `fmt` clean, shellcheck clean.
  **Open (operator)**: T016–T018 (global apply, GoDaddy repoint, dev apply), T022/T025 (custom domain
  + re-read the two `.env` files), T026/T029/T032 (SES production access, pool switch, live mail),
  T033/T034 (plan-only proofs), T040/T041 (sign-off + commit).
  Spec/plan/artifacts: [specs/010-domain-dns-foundation/](specs/010-domain-dns-foundation/).

**009-shop-management** — Back-Office Shop Management. **Code-complete + verified; operator run pending.**
The platform's shop-management capability in the **back-office** console: create shops, govern their
lifecycle (active/suspended/disabled), and manage the people at each shop — provisioning shop users
as passwordless **shop-pool** Cognito accounts + the platform record, kept consistent. It makes shop
and shop-user existence **product data** and so **completes 007's deferred live sign-off** (SC-005b,
SC-012 → this slice's SC-007/SC-008).
- **Backend (cold path)**: a new `shops/` slice in **`apis/edge-api/admin`** (back-office authorizer)
  — `/admin/v1/shops...` (list/detail/audit + create/update/status/delete + roster create/update).
  Server-side Cognito Admin provisioning of shop-pool users follows 006's Cognito-first→DB idempotent
  pattern (IAM scoped to the shop pool ARN; an authorized provisioning write, **not** cross-pool
  auth — Principle IV holds, research R3). Two authz gates from the `admin.staff` record: read = any
  active staff (incl. `csa`); mutate = `admin`/`manager` (A1).
- **Data**: one forward-only migration (`20260710060000_shop_management.sql`) — `public.shop` gains a
  3-value `status` (replacing 007's `is_active`) + `contact_phone`/`notes`; new general
  **`admin.audit_log`**. The **007 shop manager gate was reconciled** to `status = 'active'` in
  lockstep with its tests (research R2).
- **Frontend**: a `features/shops/` slice in `apps/back-office` on the shared foundation; CRUD
  primitives the design-system lacked (`table`/`dialog`/`alert-dialog`/`select`/`badge`) + a generic
  `DataTable` in `@effy/web-kit/console` were added **to the packages** (Principle II); management
  DTOs added to `@effy/shared-types`; `api-client` gained `post`/`patch`/`delete`.
- Status: **code-complete** — full workspace `pnpm typecheck` + `pnpm -r test` (**184 tests**:
  edge-shared 26, edge-admin 31 [+24 new `shops`], edge-shop 39, web-kit 38, back-office 21,
  shop-web 29) + `turbo build` all green; secret/PII sweep clean. **Open (operator)**: **T067**
  (`make apply ENV=dev` — Cognito IAM + `SHOP_USER_POOL_ID`), **T068** (commit migration + `make
  db-up ENV=dev`), **T069** (`make edge-deploy SERVICE=admin` + `SERVICE=shop ENV=dev`), **T070**
  (live SC-001…SC-015 incl. 007 sign-off closure), **T071** (parity-doc + sign-off).
  Spec/plan/artifacts: [specs/009-shop-management/](specs/009-shop-management/).

**007-shop-web** — Shop Web Foundation (Bootstrap). **Code-complete + verified; operator run pending.**
The platform's **second web surface**: `apps/shop-web` (`@effy/shop-web`, Vite + React 19 SPA on
:5174), the shop operator console. Same stack as the back-office console, **shop** Cognito pool,
and the shop audience's **first RBAC model**.
- **Constitution amended → v1.5.0**: Principle IV generalized from "the admin pool defines RBAC
  groups" to "pools MAY define RBAC groups"; the **shop pool gains `shop_manager` / `shop_staff`**.
  The claim is the *origin* of role assignment; the platform record is *authoritative for the access
  decision*.
- **Shared-foundation extraction** (the slice's core work, Principle II): the reusable half of the
  back-office console moved into packages — **`@effy/design-system/ui`** (the platform's one set of
  13 shadcn primitives + `use-mobile`) and a new **`@effy/web-kit`** (`.` = config · Amplify ·
  EMAIL_OTP flow · session guard · query client · telemetry · client store; `./console` = the SPA
  chrome: `ConsoleShell` / sidebar / header / user menu / `NavList` / `OtpSignInCard` / `ErrorState`,
  all generic over the surface's role union). `back-office` was refactored onto both and stayed
  **20/20 green**. **`@effy/api-client` needed no change at all** — the cleanest evidence the
  foundation was already audience-neutral (SC-009).
- **Data**: the platform's **first `public`-schema tables** — `shop`, `shop_staff`, `shop_role`,
  `shop_staff_role` (migration `20260710050004`). `shop_staff.email` and `.shop_id` are nullable
  by design; **status and shop assignment are platform-owned and never written from token data**.
  **No shop-creation path ships** (FR-019, revised 2026-07-10): no interface, no command, no seed
  file. `public.shop` is created empty and stays empty until **back-office shop management** — the
  **next slice** — fills it, so no shop row ever exists that the product did not create.
- **Backend** (`apis/edge-api/shop`, restructured to nested domains `staff/` + `status/`):
  `GET /shop/v1/me` (record-backed identity read + idempotent JIT upsert) and
  `GET /shop/v1/manager-ping` (**gate = role AND status AND shop scope**, one SQL predicate,
  fail-closed, uniform 403 that never discloses which term failed).
- **Parity**: [docs/audiences/shop-capabilities.md](docs/audiences/shop-capabilities.md) is the
  single register binding `shop-web` ↔ `shop-mobile`; the mobile column is **outstanding by design**
  (building it is its own slice).
- Spec/plan/artifacts: [specs/007-shop-web/](specs/007-shop-web/).
- **Verification**: `scripts/` holds the three checks that cannot honestly be unit-tested —
  `make shop-verify-isolation` (SC-004, gateway authorizers), `make shop-verify-gate` (SC-005/005a,
  a SQL join), `make shop-token-claims` (research R6).
- Status: **code-complete** — `pnpm typecheck` + `pnpm test` green across the workspace (**159
  tests**: edge-shared 26, edge-admin 7, edge-shop 39, web-kit 38, back-office 20, shop-web 29);
  `terraform validate` + `fmt` clean; shellcheck clean; secret/PII sweep clean. **Open (operator)**:
  **T009** (`make apply ENV=dev` — 2 Cognito groups + the `:5174` CORS origin; *abort if the pool
  would be replaced*), **T012** (commit the migration, then `make db-up ENV=dev`), **T034**
  (provision three shop accounts in Cognito + sign in), **T041** (`make edge-deploy SERVICE=shop
  ENV=dev`), **T045** (`make shop-verify-isolation` — expect `200 200 401 401`), **T054**/**T060**
  (`make shop-verify-gate` — the gate's negative half), **T068** (`make shop-token-claims` → settle
  research R6), **T070** (partial SC sign-off).
  Runbook: [quickstart](specs/007-shop-web/quickstart.md).
- **Sign-off is partial by design.** **SC-005b** (a manager *served* at an active shop; refused once
  it is deactivated) and **SC-012** (a *disabled* operator refused) need shop data only the
  back-office shop-management slice can create. All three gate terms are implemented + unit-tested
  here; the role and shop-scope terms are additionally proven **live** (an unassigned
  `shop_manager` is refused despite a valid claim — FR-021 in one line).
- **Raised, not fixed**: `/admin/v1/me` (005) resolves email as `claim("username") ?? sub` and may be
  storing UUIDs in `admin.staff.email`. Recorded at the tail of
  [specs/005-back-office-web/plan.md](specs/005-back-office-web/plan.md); 007 deliberately does not
  inherit the pattern (research R6).

**006-first-admin-bootstrap** — First Admin Bootstrap (Operator Break-Glass). **Code-complete +
verified; operator run pending.**
An **operator-run Go CLI** (+ `make create-first-admin EMAIL=… NAME=… ENV=dev`) that establishes the
**first back-office super-admin** out-of-band — **no API, no UI** (breaks the chicken-and-egg: the
console needs an admin, and privileged audiences forbid self-signup). It does two consistent writes:
`AdminCreateUser` **with no password** (→ `CONFIRMED`, `SUPPRESS` invite, `email_verified`) +
`AdminAddUserToGroup('admin')` in the back-office pool (001), and an idempotent upsert of
`admin.staff`(active)/`admin.staff_role('admin')` keyed on the returned **`sub`** (the 005 gate's
join key). Idempotent / break-glass. Adds one migration (`admin.staff.name`). Lives in
`apis/core-api` (`cmd/create-first-admin` + `internal/adminbootstrap`) — **reuses** its already-wired
Cognito SDK + pgx, **zero new deps**.
- Spec/plan/artifacts: [specs/006-first-admin-bootstrap/](specs/006-first-admin-bootstrap/).
- Status: **code-complete** — build/vet/gofmt clean, `make core-test` green (adminbootstrap unit
  tests + the 004 suite), hygiene clean, no new API/UI surface. **Open (operator)**: **T009** (`make
  db-up ENV=dev` + `make create-first-admin …` → sign in), **T013** (re-run/break-glass/bad-input),
  **T017** (SC-001…SC-006 sign-off + commit). *Not committed yet.* `db-up` needs the migration
  committed first (003 commit-guard).

**004-backend-bootstrap — A3 cold-path decomposition** (**implemented + live in dev**). The cost-optimized path is now a family of **independently deployable domain services
behind ONE shared HTTP API**, and the backends live under **`apis/`**:
- `apis/core-api` (hot path — Go, local Docker only) + `apis/edge-api/{shared,admin,shop}`. The
  shared library graduated to **`@effy/edge-shared`** (Principle II single-source); `admin`
  (back-office pool) and `shop` (shop pool) each **attach to a Terraform-owned shared HTTP API**
  (`infra/envs/dev/edge-gateway.tf`) via `provider.httpApi.id` and reference the four per-pool JWT
  authorizers **by id** from SSM (`/effy/<env>/edge/{http_api_id,api_endpoint,authorizer/*}`). Path
  scheme **`/<service>/v1/...`** (e.g. `/admin/v1/me`, `/shop/v2/status`). Adding a service = a new
  `apis/edge-api/<name>/` that attaches to the gateway — deploy-independent.
- Spec + plan revised **in place** (amendment **A3**, research **Part F**, `contracts/shared-gateway.contract.md`);
  tasks **Phase 9 (T049–T059)**. Status: **deployed to dev** — gateway applied, `admin`+`shop`
  live, old `effy-edge-api` stack removed. `turbo` **14/14**, core-api Go build+tests, `terraform
  validate`, hygiene sweep — all green. Committed (`aacd7c5`).

**005-back-office-web** — Back-Office Web Foundation (Bootstrap). **Phases 1–8 + Amendment D1
(dashboard shell) + Amendment D2 (neutral theme) implemented; reconciled to A3.
Live SC sign-off (T046) pending; not yet committed.**
The platform's **first web surface**: the internal `back-office` admin console (Vite + React 19
SPA) + the **first shared web packages** (`@effy/design-system`, `@effy/shared-types`,
`@effy/api-client`). Passwordless **EMAIL_OTP** (Amplify v6) → session-guarded shell → record-backed
identity read → **backend-authoritative** admin gate decided from the DB record (status + role).
Adds the platform's **own** back-office staff/RBAC system of record (`admin.staff`/`role`/`staff_role`
— the first real tables + first `db-up`) so RBAC does not rely solely on Cognito.
- Constitution amended: **v1.3.1** (Node 22) + **v1.4.0** (TanStack Store locked; Zustand removed).
- Post-A3: its `edge-api` work lives in **`apis/edge-api/admin/`**; the console calls
  **`/admin/v1/me`** + **`/admin/v1/admin-ping`** against the shared gateway
  (`VITE_API_BASE_URL` = `/effy/dev/edge/api_endpoint`).
- **Amendment D1 — default dashboard shell** (spec FR-023 / US1 / SC-013): the authenticated
  shell is a shadcn **`sidebar-07`** dashboard layout; sidebar tokens in `@effy/design-system`,
  collapse bit in `ui-store.sidebarOpen` (controlled — no cookie). **Presentation-only** (no
  backend/data/auth change). Built + verified; no operator/cloud step.
  **⚠ Relocated by 007**: the chrome no longer lives in `apps/back-office/src/components/layout/`
  and the primitives no longer live in `components/ui/`. `routes/app.tsx` now renders
  **`<ConsoleShell>` from `@effy/web-kit/console`**, fed this surface's brand + nav config; the
  primitives are **`@effy/design-system/ui`**. Only `components/layout/nav.ts` remains app-local.
- **T058 done** — the shell (SC-013/SC-006) is **visually verified** via a seeded-session
  screenshot harness (light/dark × admin/manager × expanded/collapsed): dashboard layout,
  icon-rail collapse with reflow, role-aware nav (manager loses the Admin item), footer identity,
  on-brand jade in both appearances. Harness removed after capture.
- **Amendment D2 — neutral theme** (FR-024, SC-014): **built + verified.** Surfaces rebased to
  neutral in `@effy/design-system` `tokens.css` (shadcn `sidebar-07` neutral base); **Jade
  `#0FB57E` kept as the single accent** — primary/ring/brand mark only (dark-on-emerald foreground
  for WCAG contrast); the green sign-in-bg / sidebar / hover blends are gone, light **and** dark.
  **No constitution amendment** (Jade is an emerald shade — Principle V holds; governance in plan
  § Amendment D2). App vitest green (+2 token guard), typecheck/build clean; **visually verified**
  via the screenshot harness (neutral surfaces + emerald accent light/dark). Presentation-only,
  design-system-scoped.
  - **⚠ Reverted (2026-07-15)**: D2's responsive-scaling half (FR-025/SC-015 — the fluid
    `clamp()` root-font-size in `design-system/scale.css` + the `max-w-[1800px]` content cap in
    `ConsoleShell`) was **removed across all three web surfaces** by request. Sizing is now the
    **shadcn/Tailwind default** (16px root, full-width content) everywhere; `scale.css` and its
    export are deleted. Neutral theme + Jade accent are unaffected.
- Open: **T046** — the LIVE SC-001…SC-013 sign-off (real OTP sign-in, live proving reads/denials,
  disabled-staff denial) is **operator-run** and gated on the still-open cloud steps **T022/T029/T038**
  (`make db-up ENV=dev` — migration `3407603` is committed so this is unblocked — then `make
  edge-deploy SERVICE=admin ENV=dev`, provisioned admin/manager/role-less accounts, an OTP inbox).
  Runbook: [quickstart](specs/005-back-office-web/quickstart.md). Everything code-verifiable is green.
- Doc reconciliation (2026-07-08): plan/tasks/research/data-model/contracts corrected to the A3
  reality (`apis/edge-api/admin`, `/admin/v1/*` paths, gateway-owned CORS, `make edge-deploy
  SERVICE=admin`) — closes the Governance drift the analyze pass flagged.

**Previous slices** (docs in `specs/<slice>/`):
- **001-infra-foundation** (four Cognito pools, EMAIL_OTP, state backbone, Makefile):
  **applied & verified in dev**. Open: operator OTP sign-in test (T023), sign-off (T035).
- **002-dev-database** (`effy-dev-db` — t4g.micro/20GB gp3, all paid options off ≈$22/mo,
  `/effy/dev/db/*` contract): **applied; posture verified live** (12/12 cost-posture rows).
  Open: operator allowlist apply + contract connect test (T008/T009), lever preview (T014),
  sign-off (T017; billing check due early Sept 2026).
- **003-db-migrations** (Goose workflow — `db/migrations/`, SQL-only timestamped files,
  Makefile `db-new`/`db-status`/`db-up`/`db-down`, DSN composed at invocation from the 002
  contract, forward-only with dev-only single-step down; proving migration = `admin` schema
  shell): **implemented; guards + hygiene verified; `make lint` green**. Open (operator
  sitting per [quickstart.md](specs/003-db-migrations/quickstart.md)): FIRST the pending
  002 allowlist apply (`make apply ENV=dev`), then commit the migration files, then
  T007-finish/T008 (db-status + first db-up), T010, T012, T015.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/040-core-api-deploy/plan.md
<!-- SPECKIT END -->
