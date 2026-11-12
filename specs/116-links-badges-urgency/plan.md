# Implementation Plan: Reaching the Right Place

**Branch**: `116-links-badges-urgency` (work on `dev`) | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/116-links-badges-urgency/spec.md`

## Summary

This plan finishes the notifications backlog (B7, C6, D7).

- **Links (B7).** The customer website publishes who may open its links:
  - `/.well-known/assetlinks.json` for Android;
  - `/.well-known/apple-app-site-association` for iPhones.

  Each is built only when the operator has supplied the app's identity. The customer app claims the eight shopper paths
  (109's destinations, 110's `customerWebPathFor`). It turns an opened link back into a destination with ONE parser,
  `customerDestinationForWebPath` (shared-types), whose Kotlin twin is pinned to fixtures. The destination then goes through
  the same router as a notification tap, so it is held through sign-in.
- **Badge (C6).** A change to the inbox made anywhere (seen, read, read all, archive, withdrawn, expired, or a new item whose
  push did not go out at once) queues ONE badge correction per person and audience: one table and one writer. The drain
  sends each correction within two minutes,
  as a silent push: iOS gets `aps.badge` only; Android gets a data message carrying the count and the latest unseen ids, and
  the app removes shown notifications that are no longer unseen. App pushes are now tagged by notification id, so the app
  can find them. While the app is open, it sets the badge itself.
- **Urgency (D7).** Every iPhone push carries `aps.interruption-level` from its importance and category: important →
  `time-sensitive`, offers and news → `passive`, everything else → `active`, never `critical`. Time-sensitive is used only
  when the environment's Apple team id is set (off until the paid Apple account exists). Android keeps 111's channels and is
  covered by a test.

Everything iPhone-only is switched by the operator-supplied Apple team id (empty = off), as in 050's "after paying" checklist.

## Technical Context

**Language/Version**: TypeScript (Node 22 Lambdas, Next.js 16), Kotlin 2.4 (KMP + Compose), Swift (the iOS bridge), SQL (PostgreSQL 16, Goose), Terraform

**Primary Dependencies**: firebase-admin (FCM, already), `@effy/shared-types`, `@effy/edge-shared/notifications`, Next.js route handlers, Android App Links, iOS Associated Domains

**Storage**: PostgreSQL. A new table `notification_badge_correction` (queue, one row per person and audience). No other schema change.

**Testing**: vitest (unit + container on local Postgres), Kotlin host tests (both apps), customer-web vitest + build

**Target Platform**: AWS Lambda (ap-southeast-2); Amplify SSR (customer-web); Android 7+ (minSdk 24); iOS (switched off until paid)

**Project Type**: monorepo (backend + web + mobile)

**Performance Goals**: a badge correction is handed to FCM within about 75 s of the change (a 15 s combining window plus up
to one 60 s drain cycle). That fits the spec's two minutes on an awake phone; an Android phone in Doze may wait longer
(spec edge case).

**Constraints**:
- No new route.
- No new always-on compute.
- Corrections are silent and never held by quiet hours.
- Real-world identifiers (the Android signing fingerprint, the Apple team id) are asked for, never inferred. Empty = off.

**Scale/Scope**: 8 link paths; 2 apps; 1 table; 1 drain step; 3 iPhone urgency levels

## Constitution Check

| Principle | How this plan complies | Gate |
|---|---|---|
| I. Spec-Driven | spec → plan → tasks; a gap goes back to the spec | PASS |
| II. Monorepo, shared contracts | The link parser is defined once (shared-types) with fixtures, and the Kotlin twin is pinned to them. The urgency rule is one function, `interruptionLevelFor(importance, category, timeSensitiveOn)` in shared-types | PASS |
| III. Single serverless backend | No new route and no new service. The corrections are a step of the existing `notifications` drain. Shared gateway 189/300 and staff 240/300 are unchanged | PASS |
| IV. Auth isolation | A link never signs anyone in. It goes through 109's held-through-sign-in rule. Corrections go only to the devices registered for that `sub` and audience | PASS |
| V. Native feel | App Links open in-app with no chooser (verified). No banner on the website. Corrections are silent | PASS |
| VI. Layered architecture | One writer of corrections (`badge.ts`). The sender builds the payload in one function (`toFcmMessage`). The app's link handling is `MainActivity` → `PushOpen`-like holder → the existing router | PASS |
| VII. Observability | Metrics `BadgeCorrections{audience, outcome}` and `BadgeCorrectionsQueued`; analytics `app_link_opened` (kind only, added to `docs/telemetry/platform-events.md`). No PII: counts and notification ids are not personal. **Alerts: none new.** The step runs inside the notifications drain, whose existing failure alarm (050) already fires if the drain throws. A failed correction is cosmetic (the next push or inbox open corrects it), so an alarm on it would be noise | PASS |
| Real-World Identifiers | The fingerprint and team id are new Terraform variables with **no default**: `plan` fails until `<env>.tfvars` says them explicitly (`[]` / `""` = off, written by the operator on purpose). Format validations refuse a placeholder. The app's `WEB_SITE_HOST` is likewise read from config, never derived | PASS |

No violations. No Complexity Tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/116-links-badges-urgency/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/
│   ├── links.md        # the eight paths, the parser, the two well-known files
│   └── push.md         # badge correction payloads, interruption levels, the Android tag
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/20261113120000_badge_corrections.sql      # notification_badge_correction
packages/shared-types/src/
├── notification-destinations.ts   # + customerDestinationForWebPath, APP_LINK_PATHS, interruptionLevelFor
└── web-links.fixtures.json        # path ⇄ destination pairs (both directions), pinned by TS and Kotlin
apis/edge-api/shared/src/notifications/
├── badge.ts                       # requestBadgeCorrections / expiredBadgeCorrectionsSql (ONE writer)
├── inbox-handlers.ts, read-handler.ts, notify.ts   # call it (withdrawals and expiries: the drain's sweep)
└── badge.guard.test.ts            # one writer
apis/edge-api/notifications/src/
├── worker/badge.ts                # claim due corrections → count + latest unseen ids → silent pushes
├── worker/drain.ts, handler.ts    # run it each minute; interruption level on each push
└── fcm/sender.ts                  # toFcmMessage: android tag = notification id; aps.interruption-level; toBadgeMessage
apps/customer-web/
├── app/.well-known/assetlinks.json/route.ts
├── app/.well-known/apple-app-site-association/route.ts
└── proxy.ts                       # matcher skips /.well-known
apps/customer-mobile/
├── androidApp/src/main/AndroidManifest.xml   # autoVerify intent-filter, host from config
├── androidApp/.../MainActivity.kt            # VIEW intents → AppLinkOpen
├── shared/.../core/push/WebLink.kt           # Kotlin twin of the parser (fixture test)
├── shared/.../core/push/EffyFirebaseMessagingService.kt  # tag by id; handle type=badge
├── shared/.../core/platform/AppBadge*.kt     # set(count) while open; clear on sign-out
└── iosApp/ (Associated Domains entitlement - written into the after-paying steps, not attached)
apps/driver-mobile/shared/.../core/push/…     # badge handling, tag by id, AppBadge.set
infra/envs/dev/  (variables.tf, dev.tfvars, amplify-customer-web.tf, notifications SSM)   # android_app_cert_sha256, apple_team_id
docs/observability-apple-blockers.md          # "After paying" gains the 116 steps
```

**Structure Decision**: the existing monorepo surfaces. There is no new service, no new route, and no new client package.

## Phases

- **Phase 0**: [research.md](research.md), R1–R10.
- **Phase 1**: [data-model.md](data-model.md), [contracts/links.md](contracts/links.md), [contracts/push.md](contracts/push.md),
  [quickstart.md](quickstart.md).

### Post-design Constitution re-check

The design adds one table with one writer, a step in an existing worker, two static web files and an Android intent filter. No
gateway, compute or audience boundary changes. **PASS.**

## Deploy order (for the hand-off)

1. Set the identities in `infra/envs/dev/dev.tfvars`, from the operator: `android_app_cert_sha256` (the release, or the dev
   debug key, fingerprint; `[]` to leave links off) and `apple_team_id` (`""` until paid). Plan fails until both are
   written. Then `make apply ENV=dev`, which writes the SSM values and customer-web's build env.
2. `make db-up ENV=dev`.
3. `make edge-deploy-all ENV=dev`. edge-shared changed; the notifications drain must be deployed before the handlers, which
   queue corrections.
4. customer-web. The well-known files are built from its env.
5. Build and install the customer and driver apps.
