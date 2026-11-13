# Data Model: App Updates Inside the App (121)

No database tables. There are three shapes: one published file per app and environment, and two values each phone keeps for itself.

## AppUpdateSettings (the published file)

`config/app-updates/<env>/<app>.json` → `https://media.<zone>/app-updates/<app>.json`. The full contract is [contracts/app-update-settings.md](./contracts/app-update-settings.md).

| Field | Type | Rule |
|---|---|---|
| `schema` | int | `1`. A phone that sees a higher number it does not know treats the file as no answer (fail open). |
| `ios`, `android` | PlatformSettings | both present |

**PlatformSettings**

| Field | Type | Rule |
|---|---|---|
| `minimum` | int ≥ 0 | ≤ `recommended` |
| `recommended` | int ≥ 0 | ≤ `latest` |
| `latest` | int ≥ 0 | |
| `storeUrl` | string or null | in **prod**, required when any of the three is > 0; in **dev**, may be null (Update now is then not offered). iOS: `https://apps.apple.com/…/id<digits>`. Android: `https://play.google.com/store/apps/details?id=<applicationId>`, where the id must be that app's production or dev id. |

The validator (`validateAppUpdateSettings`, `@effy/shared-types`) also refuses unknown keys and non-integer or negative numbers. It is run by `make app-updates-check` and before every publish. The phone runs the same rules on what it receives and treats a failure as no answer.

## Outcome (decided on the phone)

`decide(settings?, platform, build, noticeShownFor?, storeHasUpdate?) → Outcome`

| Order | Condition | Outcome |
|---|---|---|
| 1 | settings missing or invalid | `None` |
| 2 | `build < minimum` | `Mandatory` |
| 3 | `build < recommended` and store allows* | `Optional` |
| 4 | `build < latest`, `noticeShownFor != latest`, and store allows* | `Notice(latest)` |
| 5 | otherwise | `None` |

\* "Store allows": on an Android install from Play, `storeHasUpdate == true`. On every other install (iPhone, non-Play Android), it is always true. Mandatory never consults the store.

Pinned by `packages/shared-types/src/app-updates.fixtures.json` (TypeScript `decideAppUpdate` and Kotlin `decideAppUpdate` must give the same outcome for every case).

## SavedAnswer (on the phone)

Kept through a two-method `AppUpdateStore` port (get/put a string) that each app adapts to its own store - customer:
`DevicePreferences` (the customer app does **not** use multiplatform-settings); driver: multiplatform-settings
`Settings` - under the key `app_update.saved`.

| Field | Meaning |
|---|---|
| `body` | the last valid file received (raw JSON) |
| `etag` | its ETag, sent as `If-None-Match` |
| `fetchedAt` | when it was last confirmed (200 or 304). Under 3 minutes old, the app uses it without waiting at launch. |

## NoticeShown (on the phone)

Key `app_update.notice_shown_for` (same port): an int holding the `latest` value the notice was last shown for. It is written when the notice sheet is shown, not when it is dismissed, so a crash cannot repeat it.

## Gate states (shared state machine, `AppUpdateGate`)

```
Checking ──answer/timeout──► Mandatory | Optional | Notice | Passed
Optional/Notice ──Later/Dismiss──► Passed
Optional/Notice ──Update now──► (flexible download or store) ──► Passed
Passed ──foreground check says Mandatory──► Mandatory
Mandatory ──(never leaves until the build changes)
Checking ──late mandatory answer──► Mandatory (also from Passed)
```

`Passed` renders the app's shell. Every other state renders the gate's own UI over the launch surface.
