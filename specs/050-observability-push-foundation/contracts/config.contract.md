# Contract: Configuration, Secrets & Client Build Inputs

Every provider value is **operator-supplied** (Real-World Identifiers; FR-030/031/033). Missing values
→ a **safe no-op** at runtime or a **loud failure** at build (never a guess).

## Parameter store — SSM `/effy/<env>/...` (non-secret)

| Key | Purpose | Consumers |
|---|---|---|
| `telemetry/posthog_host` | PostHog ingest host for the chosen region | all six clients (build-time) |
| `telemetry/posthog_project_key` | PostHog **project API key** (client-embeddable, public-safe) | all six clients (build-time) |
| `telemetry/enabled` | platform-wide kill switch (`true`/`false`) | all clients at startup (FR-026) |
| `notifications/fcm_project_id` | Firebase project id | notifications worker |

## Secret store — Secrets Manager (secret)

| Secret | Purpose | Consumer |
|---|---|---|
| `notifications/fcm_service_account` | FCM **service-account JSON** (HTTP v1 auth) | notifications worker only |
| `telemetry/posthog_personal_key` *(only if server-side PostHog is used later)* | server key | (future) |

Read via the Parameters-and-Secrets Lambda extension layer (existing pattern in every edge service).

## Client build inputs (per app / per env, git-ignored)

| File | App | Rule |
|---|---|---|
| `google-services.json` | each Android app | placed by operator; **`.gitignore`d**; a missing file **fails the Android build loudly** (FR-031) |
| `GoogleService-Info.plist` | each iOS app | placed by operator; git-ignored; missing → loud iOS build failure |

- Web `VITE_*` / `NEXT_PUBLIC_*` telemetry vars are build-time-inlined from the SSM params above and are
  **public-safe** (project key + host only) — the same posture as the existing Cognito client config.
- **No banned address** (`techsupport+claudeone@phantm.com`) anywhere; approved mailboxes only if a
  contact address is ever needed (`workspace-admin@`, `hello@`).

## No-op / fail-open matrix (FR-027, SC-007)

| Absent value | Effect |
|---|---|
| PostHog key/host | analytics + web error tracking are no-ops; apps fully functional |
| `telemetry/enabled=false` | clients skip telemetry init entirely (kill switch) |
| FCM service account (worker) | worker logs + marks requests `skipped`/retryable; no crash; registration still works |
| `google-services.json` / plist | **build fails loudly** (not a silent wrong default) |
| Crashlytics not configured | crash driver is a no-op; app runs |
