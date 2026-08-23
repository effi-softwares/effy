# Feature Specification: Platform Observability & Push Notification Foundation

**Feature Branch**: `050-observability-push-foundation`

**Created**: 2026-08-23

**Status**: Draft

**Input**: User description: "next step is to configure firbase FCM and carshlytics and Posthog to this platfrom. FCM for push notifcation that we need to send to customer, shop and driver and carshlytics and posthog for observablity in all the customer, shop and driver apps. first go internet and read documentation for all 3 services... how backends can use fcm to send notification? how we can use observeblility tools to check everything we can. do a deep research on all three platfrom. i haven't created any accounts yet. so end of the implementation you need to instructe me to create account and get nessary configs from them. find all the industry standard we use with those platform, we must follow them and this observerbility platform should not reduce the preformace of the application."

## Overview

The platform has six client surfaces and two backends but is, today, **operating blind**. Product
analytics (PostHog) is wired only as an inert wrapper that is **never initialised on any surface**;
crash reporting (Crashlytics) does **not exist**; and there is **no push-notification channel** —
customers, shops, and drivers are never proactively told when something needs their attention. Every
prior slice deferred "mobile telemetry" and every web slice noted "PostHog never initialised."

This feature turns on the platform's three long-planned observability and messaging capabilities as
**one shared, first-class foundation** (constitution Principle VII; ARCHITECTURE.md §"Observability,
Telemetry & Notifications"):

- **Crash & error reporting** — mobile apps report crashes and non-fatal errors; web apps report
  runtime errors — so Effy learns about failures without waiting for a user complaint.
- **Product analytics** — every client emits a **consistent, typed event taxonomy** so Effy can see
  how each audience actually uses the apps (funnels, feature usage, screen views).
- **Push notifications** — the platform can proactively reach a customer, a shop operator, or a driver
  on their device when a domain event that matters to them occurs (order paid, order ready, out for
  delivery, delivered; a new order at a shop; a run assigned to a driver).

It is explicitly a **foundation**: it establishes the plumbing, the taxonomy, the privacy and
performance guardrails, and a **starter set** of notifications and events — not an exhaustive
catalogue of every future message or metric.

## Clarifications

### Session 2026-08-23

- Q: Crash reporting for a customer who declined analytics? → A: Crash/error reporting is **always on**
  (subject id + technical, non-PII data only); only **product analytics** is consent-gated. The two are
  independent switches.
- Q: Notification preferences — per-category controls or OS-level only? → A: **OS-level permission only**
  this slice (no preferences table). The starter set is entirely transactional; a per-category
  preference center arrives with the first promotional/marketing push slice.
- Q: Platform-wide kill switch scope? → A: Disables **product analytics only** (client + web). **Crash
  reporting and push notifications stay on** — push is a product function users rely on, and crash
  reporting must survive the bad release that made you reach for the switch.
- Q: Analytics opt-out UI for internal employees (shop/driver/back-office)? → A: **No internal opt-out
  UI this slice** — analytics is mandatory + disclosed for employees (still zero PII; still covered by
  the kill switch). A per-user internal opt-out is deferred to a later privacy/settings slice.
- Q: 30 s push SLA vs the 1-minute polled worker (analyze F1)? → A: **Relax SC-003 to ≤90 s p95** for
  the interim polled-outbox mechanism; sub-30 s delivery is a property of the deferred SNS/SQS backbone
  (research R6), not this slice.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See crashes and errors across every app (Priority: P1)

An Effy engineer or on-call operator needs to know **immediately and automatically** when any of the
six client surfaces fails for a real user — a mobile app that crashes on launch, an unhandled
exception on the storefront, a driver app that dies mid-delivery — without depending on a user
reporting it.

**Why this priority**: Operating blind is the platform's single biggest risk now that a real
commerce→fulfilment→delivery loop is live. Crash/error visibility is the cheapest, most independent
safety net and the prerequisite for trusting everything built on top. It delivers value the moment
it is on, before a single analytics event or push message exists.

**Independent Test**: Deliberately trigger a crash in each mobile app and an unhandled error on each
web surface; confirm each appears in the corresponding dashboard, attributed to the correct app and
(for signed-in users) the authenticated subject id, with a stack/context — and that **no personal
data** appears in the report.

**Acceptance Scenarios**:

1. **Given** the customer, shop, and driver mobile apps are running in production, **When** an app
   crashes (fatal) or catches a handled non-fatal error, **Then** a crash/error report reaches the
   crash-reporting dashboard within minutes, identifying the app, app version, platform (Android/iOS),
   and — if the user is signed in — the authenticated subject id, and **nothing else that identifies
   the person**.
2. **Given** any of the three web surfaces, **When** an unhandled runtime exception occurs in the
   browser, **Then** it is captured to the error-tracking tool with the surface name and route, and
   surfaced alongside that surface's analytics.
3. **Given** a crash report, **When** an engineer opens it, **Then** stack traces are readable
   (symbolicated/de-obfuscated) so the failure can be located in source.
4. **Given** crash reporting is misconfigured or unreachable, **When** the app runs, **Then** the app
   still starts and functions normally — reporting failures never degrade the user experience.

---

### User Story 2 - Understand how each audience uses the apps (Priority: P2)

A product or operations analyst needs to see how customers, shop operators, and drivers move through
the apps — screen/page views, key funnels (browse → cart → checkout; queue → pick → handoff;
collect → hub → deliver), and feature usage — using **event names that mean the same thing on every
surface**, so mobile and web for the same audience can be analysed together.

**Why this priority**: "Observable and measurable from day one" is a constitution principle, and the
platform has been unable to answer basic product questions on any surface. It depends on the same SDK
initialisation as US1's web error tracking, so it is the natural second step.

**Independent Test**: On each surface, perform a known sequence of actions (e.g. view storefront →
view product → add to cart) and confirm the corresponding named events arrive in the analytics tool
with the correct surface tag and non-PII properties, and that an analyst can assemble a funnel that
spans the web and mobile versions of an audience.

**Acceptance Scenarios**:

1. **Given** any client surface, **When** a user views a screen/page or performs a tracked action,
   **Then** an event with a **taxonomy-defined name** and only non-PII, low-cardinality properties is
   recorded, stamped with which surface emitted it.
2. **Given** a signed-in user, **When** they act, **Then** their events are associated by the
   **authenticated subject id only** — never by email, name, phone, or address.
3. **Given** the same audience has both a web and a mobile app (customer, shop), **When** an analyst
   builds a funnel, **Then** identically named events from both surfaces line up in one funnel.
4. **Given** a new tracked event is needed, **When** a developer adds it, **Then** it must be added to
   the **typed, shared taxonomy first** — an un-typed, ad-hoc event name at a call site is not
   possible (it fails to compile / is rejected by the shared wrapper).
5. **Given** no analytics credentials are configured (e.g. local dev), **When** the app runs, **Then**
   every analytics call is a safe no-op and nothing breaks.

---

### User Story 3 - Reach customers, shops, and drivers with timely push notifications (Priority: P3)

When a domain event occurs that a specific person needs to act on or would value knowing, the platform
sends a **push notification to that person's device(s)**: a customer learns their order is paid /
ready / out for delivery / delivered; a shop operator is alerted to a new order to pick; a driver is
told a collection or same-day delivery run has been assigned.

**Why this priority**: The most user-facing product value of the three, but also the largest — it
needs device-token capture on three apps, a persisted token store, and a backend sending channel tied
to real domain events. It builds naturally on the identity/eventing already in place and is
independently valuable once the observability foundation exists.

**Independent Test**: Sign in on each mobile app, grant notification permission, and confirm a device
token is registered server-side against the subject; then cause each starter domain event and confirm
the right person receives the right notification on the right device, and that opening it deep-links
to the relevant screen.

**Acceptance Scenarios**:

1. **Given** a signed-in mobile user who has granted notification permission, **When** the app
   obtains a device token, **Then** the token is registered server-side keyed to the authenticated
   subject, its audience (customer/shop/driver), and platform, and is updated when it rotates.
2. **Given** an order transitions to `paid` (and to `ready_for_pickup`, `out_for_delivery`,
   `delivered`), **When** the corresponding domain event is published, **Then** the customer who owns
   that order receives a push notification on their registered device(s).
3. **Given** an order is fanned out to a shop, **When** the shop-fulfilment is created, **Then** the
   staff of that shop receive a "new order to pick" push.
4. **Given** a collection or same-day delivery run is assigned to an on-duty driver, **When** the
   assignment is made, **Then** that driver receives a "run assigned" push.
5. **Given** a user taps a notification, **When** the app opens, **Then** it deep-links to the
   relevant screen (the order, the pick queue, the assigned run).
6. **Given** a device token has become invalid (uninstall, expiry), **When** a send fails as
   unregistered, **Then** the token is removed so it is not retried, and the send remains idempotent
   for the triggering event (a re-delivered event never double-notifies).
7. **Given** a user has not granted notification permission or has disabled notifications, **When** an
   event occurs, **Then** no push is attempted for that device and the platform behaves normally.

---

### User Story 4 - Telemetry that respects privacy and never slows the app (Priority: P2)

Any user of any surface — and Effy's own compliance posture — needs assurance that turning on
observability does **not** leak personal data, does **not** noticeably slow or destabilise the apps,
and can be **switched off** (per person where required, and platform-wide in an emergency).

**Why this priority**: The user set two hard constraints — "must follow industry standards" and "must
not reduce the performance of the application" — and the platform's constitution forbids PII in
telemetry. These are acceptance conditions on every other story, but they are also independently
testable and worth stating as their own journey so they are not treated as optional polish.

**Independent Test**: Audit every telemetry payload for PII; measure app startup and interaction
timings with telemetry on vs off; exercise the per-user opt-out and the platform-wide kill switch and
confirm each stops data collection.

**Acceptance Scenarios**:

1. **Given** any crash report, analytics event, or push token record, **When** its payload is
   inspected, **Then** it contains **no PII beyond the authenticated subject id** — no email, name,
   phone, address, OTP/token, payment field, or free-typed text.
2. **Given** telemetry is enabled, **When** app startup time and key interaction latencies are
   measured against the same build with telemetry disabled, **Then** the difference is within an
   agreed negligible budget, and telemetry work never blocks the UI thread or the request/response
   path.
3. **Given** a user opts out of / declines analytics (where consent applies), **When** they use the
   app, **Then** no analytics events are collected for them, while safety-critical crash/error
   reporting continues (subject id + technical data only) — analytics and crash reporting are
   independent switches.
4. **Given** an operator activates the platform-wide telemetry/analytics kill switch, **When** clients
   next start (or refresh remote config), **Then** collection stops without an app release.
5. **Given** any telemetry or push dependency is slow, failing, or unreachable, **When** the app or
   backend runs, **Then** the user-facing experience is unaffected (fail-open, never fail-closed on
   the user's path).

---

### Edge Cases

- **Signed-out / guest users**: crash reports and analytics carry no subject id (anonymous); push is
  not sent (no token owner). Guest → sign-in must associate future events to the subject without
  retroactively attaching PII.
- **User signs out**: analytics identity is reset (no cross-account bleed); the device's push token
  association is cleared or scoped so a shared device does not deliver another person's notifications.
- **Shared devices** (shop tablets, workplace phones): a token must never deliver a prior operator's
  notifications after sign-out.
- **Token rotation / app reinstall**: stale tokens are replaced, not duplicated; sends to dead tokens
  self-clean.
- **Notification permission denied or later revoked**: no error to the user; the platform simply does
  not push to that device.
- **Duplicate / re-delivered domain events**: a customer/shop/driver is not notified twice for the
  same event (idempotent send).
- **Offline / airplane mode**: queued analytics/crash data flushes on reconnect; push follows the
  provider's store-and-forward behaviour.
- **Local dev / preview / test builds**: missing credentials degrade every capability to a no-op; no
  test build pollutes production analytics or sends real push.
- **Missing symbol/mapping upload**: a crash still reports, but the team is alerted that traces are
  unreadable until symbols are uploaded.
- **Ad/tracking blockers on web**: analytics must remain collectable via a first-party path without
  resorting to deceptive naming.
- **Region/data-residency**: analytics and crash data are sent to the correct provider region matching
  the platform's jurisdiction.

## Requirements *(mandatory)*

### Functional Requirements

#### Crash & error reporting

- **FR-001**: The three mobile apps (customer, shop, driver) MUST report fatal crashes and
  developer-logged non-fatal errors to a crash-reporting service, for both Android and iOS.
- **FR-002**: The three web surfaces (customer-web, shop-web, back-office) MUST capture unhandled
  runtime errors/exceptions to an error-tracking service, surfaced alongside their analytics.
- **FR-003**: Every crash/error report MUST carry the app/surface identity, app version, and platform,
  and — for signed-in users — the authenticated subject id, and MUST NOT carry any other
  person-identifying data.
- **FR-004**: Crash reports MUST be symbolicated/de-obfuscated so stack traces are readable, including
  the shared cross-platform code layer, for both Android and iOS.
- **FR-005**: Failure of the crash/error reporting system MUST NOT prevent an app from starting or
  functioning (fail-open).

#### Product analytics & taxonomy

- **FR-006**: All six client surfaces MUST emit product-analytics events through a shared analytics
  capability to one analytics service.
- **FR-007**: Event names MUST come from a **typed, shared taxonomy** that is the single source of
  truth across surfaces; a call site MUST NOT be able to emit an ad-hoc/un-typed event name.
- **FR-008**: Each event MUST be stamped with the emitting surface, and MUST carry only non-PII,
  low-cardinality properties (ids and bounded enums), never PII.
- **FR-009**: A signed-in user's events MUST be associated by the authenticated subject id only; on
  sign-out the analytics identity MUST be reset.
- **FR-010**: The taxonomy MUST cover, at minimum: screen/page views on every surface; the customer
  commerce funnel; the shop fulfilment workflow; and the driver collection/delivery workflow —
  reusing the event names already documented in the platform's telemetry taxonomy where they exist.
- **FR-011**: Screen/page-view tracking MUST work correctly with client-side navigation (no missed or
  duplicated views on in-app route changes).

#### Push notifications

- **FR-012**: Each mobile app MUST obtain a device push token (Android and iOS) and register it
  server-side, keyed to the authenticated subject, the audience, and the platform; token rotation MUST
  update the stored token.
- **FR-013**: The platform MUST persist device tokens in a durable store that maps subject → tokens
  and supports look-up of a recipient's active tokens.
- **FR-014**: A backend MUST send targeted push notifications in response to domain events, via a
  single **notifications sending path** (a push channel alongside the existing email path), never as
  ad-hoc per-feature calls.
- **FR-015**: The starter notification set MUST include: to the customer — order paid, order ready for
  pickup/handoff, out for delivery, delivered; to a shop — new order to pick; to a driver — collection
  or same-day run assigned.
- **FR-016**: Push sending MUST be **idempotent** per triggering event — a re-delivered or retried
  event MUST NOT notify the same recipient twice.
- **FR-017**: A push notification MUST deep-link to the relevant in-app screen when opened.
- **FR-018**: A send that fails because a token is unregistered/invalid MUST remove that token; other
  send failures MUST be retried/handled without blocking the triggering workflow.
- **FR-019**: The platform MUST NOT attempt to push to a user who has not granted permission or has no
  valid token; absence of push MUST NOT break any workflow.
- **FR-020**: On sign-out (and especially on shared devices), the device's token association MUST be
  cleared/scoped so notifications for a previous user are not delivered.
- **FR-021**: Notification payloads MUST carry only the minimum non-PII data needed to route and
  render the notification (e.g. an order id, not the customer's name/address).

#### Privacy, consent & performance (cross-cutting guardrails)

- **FR-022**: No telemetry payload (crash, analytics, or token record) may contain PII beyond the
  authenticated subject id; this MUST be mechanically enforced/verifiable, not merely by convention.
- **FR-023**: Analytics collection MUST be consent-respecting for the public (customer) audience per
  the platform's disclosed privacy policy and the applicable jurisdiction; users MUST be able to opt
  out, and opt-out MUST stop analytics collection for them. **Crash/error reporting is a separate,
  independent switch** from product analytics: it MUST remain active for a customer who declines
  analytics, carrying only the subject id and technical (non-PII) data.
- **FR-024**: Telemetry work MUST be non-blocking: it MUST NOT block the UI thread on clients nor the
  request/response path on backends, and MUST batch/flush asynchronously.
- **FR-025**: Enabling telemetry MUST NOT degrade app startup time or interaction latency beyond an
  agreed negligible budget (see Success Criteria), verified by measurement.
- **FR-026**: A platform-wide kill switch MUST be able to disable **product-analytics** collection
  across all clients **without an app release** (via remote configuration). Its scope is analytics
  **only** — crash/error reporting and push notifications MUST remain active when the switch is thrown
  (crash reporting must survive a bad release; push is a product function, not telemetry).
- **FR-027**: Any missing/invalid telemetry or push credential MUST degrade the affected capability to
  a safe no-op rather than crash, log an error, or block a user path.
- **FR-028**: Web analytics MUST be collectable via a **first-party path** resilient to
  tracking/ad blockers, without using deceptive endpoint names.
- **FR-029**: Analytics and crash data MUST be sent to the provider region matching the platform's
  jurisdiction/data-residency requirement.

#### Configuration, secrets & external accounts

- **FR-030**: All provider credentials MUST follow the platform's config contract — **secrets**
  (server-side send credentials/service accounts, project write keys) in the secret store; non-secret
  config (hosts, region, public project keys, feature toggles) in the parameter store — and MUST be
  supplied per environment, never hard-coded.
- **FR-031**: Client build-time provider files (e.g. the Android and iOS Firebase config files) MUST
  be sourced per app/environment and MUST NOT be committed as production secrets to the repo; a missing
  file MUST produce a loud, clear failure rather than a silent wrong default.
- **FR-032**: The feature MUST conclude with an **operator runbook** listing exactly which external
  accounts to create and which credentials/config files to obtain and where to place them (see
  "External Setup Required").
- **FR-033**: Real-world identifiers (project ids, sender addresses, endpoints, account emails) MUST
  be operator-supplied, never inferred from session metadata or the environment (constitution
  "Real-World Identifiers").

### Key Entities *(include if data involved)*

- **Device Token**: a push-delivery address for one app install on one device. Attributes: the owning
  authenticated subject, audience (customer/shop/driver), platform (Android/iOS), the opaque token,
  created/updated timestamps, active/invalid state. Relationship: many tokens per subject; look-up by
  subject to fan out a notification.
- **Analytics Event**: a named, typed occurrence emitted by a surface. Attributes: taxonomy name,
  emitting surface, non-PII properties (ids, enums), and — when signed in — the subject association.
- **Crash / Non-fatal Report**: a captured failure. Attributes: app/surface, version, platform,
  readable stack, optional non-PII breadcrumbs/keys, and (if signed in) the subject id.
- **Notification Message**: an outbound push generated from a domain event. Attributes: recipient
  subject(s)/tokens, a type, a minimal non-PII routing/render payload, a deep-link target, and an
  idempotency key tied to the triggering event.
- **Consent / Telemetry State**: whether a given user (or the platform) currently permits analytics
  collection; drives the opt-out and kill-switch behaviour.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the six client surfaces report crashes/errors; a deliberately triggered crash
  on each mobile app and error on each web surface appears in its dashboard within 5 minutes,
  correctly attributed, with a readable (symbolicated) trace.
- **SC-002**: An analyst can build a working funnel for each audience (customer, shop, driver) from
  events emitted by that audience's app(s), with web and mobile events for the same audience aligned
  under identical event names.
- **SC-003**: Every starter notification (customer order paid/ready/out-for-delivery/delivered; shop
  new-order; driver run-assigned) is delivered to the correct recipient's device within **90 seconds**
  of the triggering domain event in ≥95% of attempts, and a re-delivered event never produces a
  duplicate notification. (This bound reflects the interim ~1-minute polled-outbox worker; sub-30-second
  delivery is a property of the deferred SNS/SQS event backbone — research R6.)
- **SC-004**: An audit of a representative sample of every telemetry payload type finds **zero**
  instances of PII beyond the authenticated subject id.
- **SC-005**: With telemetry enabled, measured app cold-start time and key interaction latency
  increase by no more than a negligible budget versus the same build with telemetry disabled
  (target: ≤50 ms cold-start delta on mobile; no measurable regression in the web bundle-size gates or
  Core Web Vitals), and telemetry never blocks the UI thread or a backend request.
- **SC-006**: Toggling the per-user opt-out stops that user's analytics collection, and activating the
  platform-wide kill switch stops collection across all clients without an app release — both verified
  live.
- **SC-007**: Removing/omitting every provider credential leaves all six clients and both backends
  fully functional with telemetry and push as no-ops (no crash, no blocked user path).
- **SC-008**: A device token registered on sign-in is retrievable server-side against the subject; on
  sign-out the association is cleared so the device receives no further notifications for that user.
- **SC-009**: An invalid/unregistered token is auto-removed on the first failed send, and the token
  store does not accumulate duplicates across app restarts/reinstalls.
- **SC-010**: A newly added analytics event cannot be shipped without appearing in the shared typed
  taxonomy (verified by attempting an ad-hoc event and having it rejected at build/wrapper time).

## External Setup Required *(operator — no accounts exist yet)*

This capability depends on two external providers the operator must provision. The implementation will
degrade to no-ops until these are supplied; the plan/quickstart will restate this with exact steps.

- **Firebase (Google) — for FCM push + Crashlytics** (both are free of charge on the Spark/Blaze
  plans): create a Firebase project; register the Android and iOS builds of all three mobile apps;
  download each app's platform config file (Android `google-services.json`, iOS
  `GoogleService-Info.plist`); enable Cloud Messaging and Crashlytics; for iOS delivery, provision the
  Apple Push Notification (APNs) auth key and upload it to Firebase; and create a **service account
  key (JSON)** for the backend to send via the FCM HTTP v1 API. The service-account JSON is a
  **secret**; the client config files are per-app/per-environment build inputs.
- **PostHog — for product analytics + web error tracking**: create a PostHog project (choosing the
  region that matches the platform's jurisdiction); obtain the **project API key** and the **API host**
  for each client; decide the reverse-proxy hostname for the web surfaces; and (if used later) any
  server-side key. Project API keys are client-embeddable; any personal/server keys are secrets.
- The operator will be given the exact list of values, their names in the secret/parameter store, and
  the file drop locations at the end of implementation.

## Assumptions

- **Surface scope follows the constitution/ARCHITECTURE**: Crashlytics and FCM apply to the **three
  mobile apps** (customer, shop, driver); PostHog analytics + error tracking apply to **all six client
  surfaces** (the three mobile apps and customer-web, shop-web, back-office). The user's "customer,
  shop and driver apps" is read together with the constitution's "all six clients" mandate; back-office
  is included because it is part of the same shared analytics/error pipeline and the web wrapper
  already exists there.
- **Providers are locked platform decisions**, not choices made in this slice: FCM(+APNs), Crashlytics,
  and PostHog are named in the constitution and ARCHITECTURE.md; naming them here is describing an
  existing decision, not selecting technology.
- **Jurisdiction is Australia** (region `ap-southeast-2`); provider regions and consent posture follow
  from that. Data-residency specifics beyond region selection are out of scope.
- **Web push is out of scope** (mobile push only), matching ARCHITECTURE.md; browser notifications are
  a possible future channel.
- **Session replay is off (or fully masked) by default** for this foundation, given the "no PII" and
  "no performance regression" constraints; enabling it is a later, opt-in decision.
- **PostHog feature flags / A-B experiments / surveys are out of scope** for this slice (analytics +
  error tracking only), though the same SDK makes them available later.
- **Operational metrics (Prometheus/Grafana) are out of scope here** — that is the separate backend
  metrics concern; this feature is the client-side observability (Crashlytics + PostHog) and the push
  channel only.
- **The push sending path builds the platform's notifications worker/channel** if one does not yet
  exist, reusing the existing domain-event backbone and the 037 email-delivery patterns; it is
  idempotent like every other consumer.
- **Identity comes from the existing four-pool Cognito auth**: the authenticated subject id is the only
  cross-cutting user identifier used for association, and it is stable across a customer's credential
  routes.
- **A device-tokens table and a starter notification set are net-new**; there is no existing
  device-token storage or notifications worker in the codebase today.
- **The starter notification set is a minimum, not a catalogue**: additional messages (promotions,
  feedback replies, delivery exceptions, etc.) are later slices layered on the same channel.
- **Notification control is OS-level only this slice** — a user grants/denies at the device; the
  platform stores **no per-category notification preferences** and builds no preference-center UI or
  table. Because every starter message is transactional/operational, there is nothing to selectively
  mute yet. A per-category preference center is introduced with the first promotional/marketing push
  slice (when muting becomes meaningful and legally expected).
- **The existing documented event taxonomies** (`docs/telemetry/commerce-events.md`,
  `fulfillment-events.md`) are adopted and extended, not redefined; mobile finally emits the names web
  already defines, and driver/analytics-for-back-office names are added.
- **Consent for internal audiences** (shop, driver, admin — Effy employees) is satisfied by
  employment/disclosure; analytics is **mandatory + disclosed** for them and **no per-user internal
  opt-out UI is built this slice** (still zero PII; still covered by the platform kill switch). An
  internal opt-out is deferred to a later privacy/settings slice. Explicit opt-out is a customer
  concern.

## Dependencies

- The four-pool Cognito authentication (subject id for association and token ownership).
- The domain-event backbone / outbox already used for commerce and fulfilment (the triggers for push).
- The existing PostHog web wrapper in `@effy/web-kit` and the documented telemetry taxonomies.
- The platform config contract (secret store + parameter store) and per-environment provisioning.
- Operator provisioning of the Firebase and PostHog accounts and credentials (see External Setup).
- The mobile `core/platform` native-driver pattern (auth/payments/photo-picker) that these client
  capabilities plug into via `expect`/`actual`.
