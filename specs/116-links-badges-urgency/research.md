# Research: Reaching the Right Place (116)

## R1 - Which links open the app: 109's eight shopper destinations, claimed path by path

**Decision**: The app claims exactly the paths `customerWebPathFor` (110) produces:
- `/` (exact);
- `/orders` and `/orders/{id}`;
- `/account/points`;
- `/product/{id}`;
- `/search` (with `q` or `category`);
- `/offers`.

The Android intent filter lists these with `path` / `pathPrefix`. The Apple association lists the same, as `components`.
Every other page stays on the website because it is simply not claimed (FR-003): help, legal, delete account, sign-in,
password reset and `/email/unsubscribe`.

**Rationale**: these are the pages a notification can already open. Each has an app screen and a router entry, and claiming
nothing else means a new website page never opens the app by accident.

**Alternatives**: claim everything and let the app send unknown pages back to the browser. Rejected: on Android this shows a
flash of the app, and pages like unsubscribe must never open the app.

## R2 - One parser, path → destination, pinned on both sides

**Decision**: `parseWebLink(pathAndQuery) → { destination, messageId }` and `customerDestinationForWebPath(pathAndQuery)` sit
in `shared-types/notification-destinations.ts`, beside `customerWebPathFor`. Fixtures in `web-links.fixtures.json` hold both directions, and every destination must round-trip.
The Kotlin twin `WebLink.parse(path, query)` is pinned to the same fixtures.

The parser:
- ignores unknown query keys (campaign tags, `utm_*`);
- reads `m` (a message id) but analytics does not record it (FR-006: page kind only);
- answers `null` for any path that is not claimed.

The app opens `null` as home.

**Rationale**: two hand-written parsers would drift. That is the "two sources for one fact" shape the repo guards against.

## R3 - Publishing ownership: two static files, built from the operator's values

**Decision**: customer-web serves two route handlers, each `force-static`, so they are built once from the build env:
- `app/.well-known/assetlinks.json/route.ts`: `[{relation: ["delegate_permission/common.handle_all_urls"], target:
  {namespace: "android_app", package_name, sha256_cert_fingerprints}}]`;
- `app/.well-known/apple-app-site-association/route.ts`: `{applinks: {details: [{appIDs: ["<team>.<bundle>"], components: [...]}]}}`.

Both return 404 while their identity is empty, so links keep opening the website (spec Assumptions). Both are served as
`application/json` with no redirect (Apple and Google both refuse a redirected file). `proxy.ts`'s matcher skips
`/.well-known/`, so no session cookie is set on them.

The values arrive as new Terraform variables:
- `android_app_cert_sha256` (list, default `[]`);
- `apple_team_id` (default `""`).

They are fanned out to the customer-web build env (`APP_LINK_ANDROID_SHA256`, `APP_LINK_APPLE_APP_ID`) and to SSM
`/effy/<env>/apple/team_id` for the notifications service. ⚠ **Neither has a default** (constitution, Real-World
Identifiers: fail loudly). `<env>.tfvars` must say `[]` / `""` on purpose to mean "off", and `terraform plan` fails until it
does. SSM refuses an empty string, so `""` is stored as the placeholder `off`, and every reader treats a value as a team id
only when it matches `^[A-Z0-9]{10}$`.

**Package and bundle ids**: `com.effyshopping.customer.mobile`, from the app's own build files. These are identifiers of our
own code, not outward-facing values. The iOS bundle id changes to Firebase's at paying time (050's checklist), so the Apple
app id is assembled at build from the team id and the iOS bundle id variable, `apple_customer_bundle_id`, which defaults to
the current one.

## R4 - The host the app claims comes from the build config

**Decision**: a new optional app config key, `WEB_SITE_HOST` (for example `dev.effyshopping.com`). It goes in
`secrets.properties` or the environment, like the other keys, and becomes a manifest placeholder (`effyLinkHost`). When it
is empty, the placeholder is `links.invalid`, so nothing is claimed and the build warns. `www.` is not claimed: Effy's own
links use the apex (`NEXT_PUBLIC_SITE_URL`).

## R5 - A link enters the app the way a notification tap does

**Decision**: `MainActivity` (`onCreate` / `onNewIntent`) reads `ACTION_VIEW` intents. It parses them with R2 and sets the
container's opened-destination holder, the one `PushOpen` sets. The existing router opens it, including 109's held-through-
sign-in rule, with no read call (there is no notification id). Analytics records `AppLinkOpened{kind}` (FR-006; the event is also written into `docs/telemetry/platform-events.md`, which `AnalyticsEventDriftTest` compares). iOS
(when on): the scene delegate's `continue userActivity` calls the same Kotlin entry.

## R6 - Badge corrections: a queue with one row per person, combined, sent by the drain

**Decision**: a table `notification_badge_correction (recipient_sub, audience, requested_at)` with PK
(recipient_sub, audience); upsert keeps the earliest request.

There is ONE module that queues (`shared/notifications/badge.ts`); the drain claims; erasure deletes:
- `requestBadgeCorrections(db, [{audience, sub}])` is called by the inbox handlers after seen, read-all and archive (and
  undo), by the read handler, and by `notify()` for recipients whose push did NOT go out at once (the push channel was
  `skipped`, `capped`, held by `not_before`, or not asked for), because their count rose with nothing on the phone to say so;
- `QUEUE_EXPIRED_BADGES_SQL` is run by the drain each minute. It covers unseen items whose `expires_at` fell between the
  sweep's **watermark** and now (one row, `notification_badge_sweep.swept_to`, moved forward in the same statement), so a
  failed or skipped drain run loses nothing. That includes 112's withdrawals, since a withdrawal sets `expires_at = now()`.
  A partial index on `notification (expires_at) WHERE seen_at IS NULL AND archived_at IS NULL AND expires_at IS NOT NULL`
  keeps the sweep cheap.

Only `customer` and `driver` rows are queued. The shop console's badge follows the count live already (110).

The drain step `worker/badge.ts`:
- claims the rows requested at least 15 s ago (`DELETE … RETURNING`, SKIP LOCKED, at most 500 per run);
- reads each person's unseen count and their latest 50 unseen ids;
- sends one silent push per registered app device (not web);
- drops uninstalled tokens, as 050 does.

The 15 s window is what combines a burst (FR-014, SC-004). A new notification is not a correction: its own push already
carries the badge (110 R8), so notify() queues only for the recipients whose push did not go out at once.

**Rationale**: the minute-cadence drain already runs and already reads unseen counts. One row per person makes combining
structural.

**Alternatives**:
- A correction per change, sent at once. Rejected: bursts.
- A correction on every notify. Rejected: a 20,000-person message would double its sends.

## R7 - What a correction looks like on each platform

**iOS**:
- `apns.payload.aps = { badge: n }`, with no alert and no sound;
- headers `apns-push-type: alert`, `apns-priority: 5`, `apns-collapse-id: badge`.

Apple's rule: a badge-only notification is an `alert` type with no alert. iOS updates the icon with nothing shown, the app
asleep or not.

**Android**:
- a data-only message, `{ type: "badge", count, keep: "<id,id,…>" }`, with `android.priority: normal` and
  `android.collapseKey: "badge"` (a phone that was offline gets only the latest correction);
- in `EffyFirebaseMessagingService`, `onMessageReceived` cancels any shown Effy notification whose tag is not in `keep`;
- at 0 it cancels all.

The launcher dot or number follows the remaining notifications, which is how Android badges work (no API sets a number).
To find them, every app push now carries `android.notification.tag = notificationId`, and the in-app path posts with the
same tag. On Android the badge is therefore "the shown Effy notifications are exactly the pushed items still unseen" (FR-011):
an item that was never pushed adds no dot, and a swiped-away one is already gone. A data message never shows anything, so FR-013 holds. The cost is that a data message under Doze may wait for the
next maintenance window, which is accepted and recorded.

**FR-015 (app open)**:
- `rememberSetAppBadge(): (Int) -> Unit` replaces 110's `rememberClearAppBadge` in both apps (expect/actual). iOS sets the
  number (`setBadgeCount`, iOS 16+). Android cancels all at 0, and otherwise leaves it alone.
- It is driven by the inbox count the app already shows: `LocalInboxCount` in the customer app, `InboxBadge.kt`'s count in
  the driver app.
- Sign-out calls `set(0)` (FR-016).

## R8 - Interruption levels (D7)

**Decision**: `interruptionLevelFor(importance, category, timeSensitiveOn)` in shared-types (importance wins over category):
- important → `time-sensitive`;
- offers or news → `passive`;
- else → `active`.

The sender writes `aps["interruption-level"]`. `time-sensitive` is sent only when the notifications service's
`APPLE_TEAM_ID` matches `^[A-Z0-9]{10}$` (SSM `/effy/<env>/apple/team_id`; the placeholder `off` does not); otherwise
`active` (FR-020). `passive` needs
no entitlement and is always sent. `critical` is never produced: the type has no such value and a sender test asserts it.

The Time Sensitive Notifications capability (`com.apple.developer.usernotifications.time-sensitive`) joins the push
entitlement in the "after paying" steps.

**Android (FR-021)**: unchanged. 111's channels give important its high-importance channel and offers and news their
default-importance ones. A test pins the mapping.

## R9 - Switching on the iPhone parts

**Decision**: the one setting is `apple_team_id` in `<env>.tfvars`; empty means off. Setting it and running
`make apply`, then deploying notifications and customer-web, switches on the association file and time-sensitive. The app
side follows `docs/observability-apple-blockers.md` "After paying", which gains three steps:
1. attach the Associated Domains entitlement `applinks:<host>`;
2. attach the time-sensitive capability;
3. check `https://<host>/.well-known/apple-app-site-association` is served as JSON.

With nothing attached, the iOS build stays signable on a free account.

## R10 - Observability and guards

- **Metrics**:
  - `BadgeCorrections{audience, outcome: sent|no_devices|failed}` (Effy/Notifications);
  - `BadgeCorrectionsQueued` (the rows still waiting after a run).
- **Alerts**: none new (plan, Principle VII row).
- **Analytics**: `app_link_opened{kind, surface: app}` on both platforms' taxonomy (kind only).
- **Guards**:
  - `badge.guard.test.ts`: one writer of the table;
  - the Kotlin fixture test;
  - a sender test that `critical` never appears and the tag is set for every app push;
  - customer-web: a well-known route test (404 when empty, JSON shape when set).
