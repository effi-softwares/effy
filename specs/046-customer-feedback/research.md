# Research: Customer Feedback (046)

Phase 0 decisions. Each resolves a design unknown from the spec into a concrete, justified choice
grounded in the existing platform patterns.

## Domain research — how feedback features are built

Surveyed the shape of feedback/contact capabilities in reference platforms (eBay "Contact us"/site
feedback, Uber Eats "Help → send feedback", general SaaS feedback widgets) against Effy's
single-brand, hidden-fulfilment model.

**Findings that shaped the requirements:**

- **Categorised free text is the spine.** Every mature feedback flow leads with a small category
  picker (problem/bug, suggestion, complaint, compliment, other) plus a message box. Categories are
  what make an admin queue triageable. → `feedback_category` enum (R3).
- **A lightweight optional rating aids triage** (sentiment at a glance) but is never required — a
  required rating suppresses the qualitative feedback that is the point. → optional 1–5 rating.
- **Guests must be able to submit.** The checkout header is guest-reachable; a sign-in wall on a
  feedback form is the single biggest reason such forms go unused (the same lesson 033 recorded for
  saved items). → public submission, email optional (R/D2).
- **Acknowledge, then close the loop.** Best practice is an immediate on-screen confirmation, an
  acknowledgement email, and a human reply channel. → thank-you email + staff reply email.
- **Context capture is what makes feedback actionable** — where it came from (checkout vs general),
  the platform (web/iOS/Android). → `source` + `platform` columns.
- **Anti-abuse is mandatory on any public write** — rate limiting + treating all text as inert. → R5.
- **Attachments (screenshots) are common but heavy** (media pipeline, S3 presign, virus posture).
  Deferred to keep v1 text-only (spec Assumptions).
- **Two-way in-app threads are a support-desk feature, not a feedback channel.** Kept one-directional:
  staff reply by email; the shopper sends new feedback to add more (spec Assumptions).

## D1 — Path selection (Principle III)

**Decision**: Cold path on both sides. Public submission → `apis/edge-api/customer` (new `feedback/`
domain); staff console → `apis/edge-api/admin` (new `feedback/` domain). No hot-path/Go involvement.

**Rationale**: The user directed the edge API explicitly, and it is the correct path under the
doctrine: feedback is low-frequency and its real work is asynchronous email. `edge-api/customer`
already has everything the public route needs (DB access, `ses:SendEmail` scoped to this env's
identity + configuration set, the full `MAIL_*` env, and public-route precedent in newsletter/healthz)
— standing up a deployable for it would duplicate all of that (the newsletter R1 argument applies
verbatim). Feedback is **not commerce**, so the hot-path routing law (011 FR-028) is not engaged. The
console half is textbook internal CRUD (deliverability/shops/promotions).

**Alternatives rejected**: Hot path (Go core-api) — wrong path for low-frequency admin/async-email
work, and core-api has a narrower deploy story; a standalone deployable — duplicates infra for two
endpoints.

## D2 — Guest vs authenticated submission (two routes, one service)

**Decision**: Two submit handlers sharing one service:
- `POST /customer/v1/feedback` **behind the customer authorizer** — signed-in shoppers. The verified
  `sub` resolves to `customer.id`; the trusted profile email is used; the submission is linked to the
  customer record.
- `POST /customer/v1/feedback/public` **no authorizer** — guests. Email/name come from the body and
  are treated as **unverified**; the submission is never linked to any account.

**Rationale**: API Gateway authorizers are per-route and all-or-nothing; there is no "optional auth"
on a single route. The platform already runs authenticated (`/customer/v1/me`) and public
(`/newsletter`, `/healthz`) routes side by side in this exact service. A client-declared customer id
on a public route would be spoofable — linkage MUST come from a verified token, so the linked case
gets its own authorized route. The web/mobile client picks the route by session state.

**Alternatives rejected**: single public route that trusts a client-supplied customer id (account
spoofing / linkage on unverified data — forbidden by Principle IV's "record is authoritative" and the
constitution's verified-email linking rule); in-Lambda best-effort token parsing on a public route
(re-implements the authorizer, easy to get subtly wrong).

## D3 — Category and status vocabularies

**Decision**:
- `feedback_category`: `bug`, `suggestion`, `complaint`, `compliment`, `other` (CHECK-constrained
  text, human labels live in the clients/`shared-types`).
- `feedback_status`: `new`, `in_review`, `replied`, `resolved`, `archived`, `spam` (CHECK-constrained,
  default `new`).

**Rationale**: Small fixed vocabularies keep the queue triageable and the filters finite. CHECK
constraints make an invalid value unrepresentable (the 028/029 pattern). `replied` is set by the
system when a reply sends (not hand-set); the rest are staff-set. `spam` is a terminal-ish state that
keeps abusive rows out of the default view without deleting evidence.

**Alternatives rejected**: free-text tags (unfilterable, drift); a separate boolean per state
(states are mutually exclusive — an enum models that honestly).

## D4 — Data model & schema placement

**Decision**: Three tables in the `public` schema: `feedback_submission` (the shopper's message +
immutable context), `feedback_reply` (staff → shopper messages), `feedback_note` (staff-only
annotations). Staff attribution is stored as `staff_sub text` (+ a `staff_name` snapshot), **not** a
cross-schema FK to `admin.staff`. Optional `customer_id uuid` FK to `public.customer` (nullable — the
guest case), `ON DELETE SET NULL` semantics preserved by keeping the row.

**Rationale**: The submission is operational customer-facing data → `public` (where `edge-api/customer`
writes and `edge-api/admin` reads; both reach `public`). The platform does not FK from `public` into
`admin` — deliverability's repair records its actor as a plain `sub` string, and this follows that
precedent (a cross-schema FK couples two schemas with different lifecycles and access paths). Context
fields (customer link at submission time, source, platform, category, rating, message) are immutable
once written; only status/notes/replies mutate (spec FR-040).

**Alternatives rejected**: putting feedback in `admin` (it is customer-authored data, and the public
customer service must write it); embedding replies/notes as JSON columns (unqueryable history, no
per-reply delivery outcome); a cross-schema FK to `admin.staff` (breaks the platform's schema
separation).

## D5 — Anti-abuse / rate limiting

**Decision**: An SQL-based per-source cooldown/quota decided inside the write path, keyed on the best
available source identifier in priority order: authenticated `sub` → `source_ip` (from the HTTP API v2
`requestContext.http.sourceIp`, which **is** present here, unlike a Cognito trigger). A submission is
refused if the source exceeds N submissions within a rolling window; the refusal does not disclose the
threshold. All message/reply text is stored raw and rendered **inert** (escaped) in every sink
(console, email HTML, email text). Email shape/length validated with the shared `EMAIL_SHAPE` /
`EMAIL_MAX_LENGTH` (044).

**Rationale**: This is 035's rate-limit lesson applied where it IS buildable: the Cognito trigger had
no IP, but an HTTP API route event does (`requestContext.http.sourceIp`), so a per-source limiter is
implementable in the Lambda without WAF. The cooldown lives in the same statement/transaction as the
insert (the newsletter `confirm_sent_at` lesson — a check-then-write split races). A coarser
network-edge limit (WAF rate rule) is noted as a possible later hardening, not built here.

**Alternatives rejected**: no limit (a public write is a spam magnet); CAPTCHA (adds a third-party
asset + UX cost, deferred); trusting a client-side debounce only (bypassable).

## D6 — Email templates (email-kit)

**Decision**: Two new `platform`-sent, `customer`-audience, `transactional` templates:
- `feedback-received` — the acknowledgement. `onSendFailure: "swallow"` (the submission is already
  stored; failing the request would lie to a shopper whose feedback WAS received — the
  `account-password-changed` reasoning). Vars: `referenceCode`, `category` (human label).
- `feedback-reply` — the staff reply. `onSendFailure: "throw"` (staff must learn a reply did not
  deliver so the submission is not falsely marked replied — the `newsletter-confirmation` reasoning).
  Vars: `replyBody`, `originalMessage`, `category`, `referenceCode`.

Both authored in MJML + a `.txt.hbs` plain-text part, generated to committed artifacts, and covered
by the existing `make email-check` guards (drift, size, missing-text, contrast in light/dark/invert,
banned techniques, no third-party assets). `transactional` (no unsubscribe) — a reply/acknowledgement
is a direct response to the shopper's own action, not marketing.

**Rationale**: The two opposite failure policies are the whole reason `email-kit` declares
`onSendFailure` per message; feedback needs one of each, which is exactly the discriminator the
catalogue was built for. Monochrome tokens make both immune to forced-dark hue distortion (038). All
text vars are pre-formatted strings and escaped by the render path — with 039's caveat that the shared
render path HTML-escapes the plain-text part, so any URL var must be checked (there are none here; the
reference code is opaque alphanumeric).

**Alternatives rejected**: reusing one template with a mode flag (the failure policies differ, so they
cannot share an entry); sending the thank-you from Cognito (not an auth message); an unsubscribe/
lifecycle category (these are transactional responses, not campaigns).

## D7 — RBAC gates (console)

**Decision**: Decided from the `admin.staff` record (never the claim), mirroring
`deliverability/authz.ts`:
- **Read/search/detail/notes/status** — any **active** back-office staff, **including `csa`**. Triage
  and note-taking are exactly the CSA's job, and a CSA is who fields the shopper contact this feedback
  represents.
- **Reply (outward email to a shopper)** — active AND role ∈ {`admin`, `manager`}.

**Rationale**: Reading feedback is diagnostic (deliverability's "any active staff" reasoning). A reply
is a brand-facing message sent to a real person from Effy — a judgement call with blast radius beyond
the console, the same reason deliverability gates its outward-affecting `repair` to admin/manager.
Fail-closed: an authz throw becomes a 503, never an implicit allow.

**Alternatives rejected**: gating reads to admin/manager (excludes the CSAs who most need to read
feedback); allowing csa to reply (an outward brand message is not a CSA-autonomous action in this
model — revisitable if the operator wants a CSA reply flow).

## D8 — Frontend hosting & bundle

**Decision**: customer-web `/feedback` is a **top-level** `app/feedback/page.tsx` server component
(peer of `about`, `legal`, reachable from checkout which is outside the `(shop)` group), reading the
session server-side to prefill name/email for signed-in customers. The interactive form is **one
client island** (`_components/FeedbackForm.tsx`) to protect the 174 KB guest bundle gate. Mobile adds
a `features/feedback/` slice (Clean Arch + MVVM), entered from the Account/Help area. Back-office adds
a `features/feedback/` slice + `routes/feedback.tsx` + a nav entry (no `requiredRole` → visible to all
active staff incl. csa, like Deliverability), built on the shared `DataTable`/dialog primitives.

**Rationale**: Matches each surface's established structure; keeps client JS minimal on the public
storefront; reuses the console foundation rather than reinventing a table.

**Alternatives rejected**: placing `/feedback` inside `(shop)` (it is reached from checkout, outside
that group); a fully client-rendered page (bundle cost + loses SSR prefill).

## D9 — Telemetry (Principle VII)

**Decision**:
- **Product events** (typed taxonomy): `feedback_submitted` (props: category, hasRating, hasEmail,
  source, platform — no PII), `feedback_reply_sent` (props: category — staff side).
- **Metrics/alerts**: submission count + reply count (low-cardinality labels: category, status);
  **one alarm** on thank-you/reply send failures (the send path is otherwise silent — a swallowed
  thank-you failure must still be visible, the 038 `custom_message_fallback` reasoning).
- **No PII**: submission/reply logged **without** the address (the newsletter rule).

**Rationale**: Declares the events/metrics/alerts the constitution requires for a new user-facing
flow. ⚠ Carry-forward: PostHog is not yet initialised on customer-web (039), so web `capture()` is a
no-op until that lands — the events are wired and the limitation recorded rather than hidden; the
mobile taxonomy is deferred consistent with prior mobile slices.

## D10 — Reference code

**Decision**: Each submission gets a short human-readable opaque reference (e.g. `FB-XXXXXX`, derived
from the row id, not sequential/guessable) shown on the confirmation and carried in both emails, so a
shopper and staff can refer to a specific submission.

**Rationale**: Gives the acknowledgement and reply emails something concrete to name without exposing
an internal UUID or a guessable running count. Opaque, so it is not an enumeration oracle.
