# Quickstart: Observability & Push Foundation

Two halves: **(A)** the operator account/credential setup you must do out-of-band (no accounts exist
yet — this is the runbook you asked for, FR-032), and **(B)** the validation walks that prove each user
story once the code is built and the credentials are in place.

Everything degrades to a safe no-op until the credentials below exist, so the code can be built and
merged before you create the accounts.

---

## A. Operator setup — accounts & credentials

> Do this in a normal browser; Claude does not create accounts or run cloud/apply steps. Use
> **AWS_PROFILE=ef** for the SSM/Secrets writes.

### A1. Firebase (FCM push + Crashlytics) — free on Spark & Blaze

1. **Create a Firebase project** at <https://console.firebase.google.com> (one project for the
   platform; you can add a separate prod project later). Note the **Project ID**.
2. **Register six app builds** (Android + iOS for each of customer / shop / driver), using each app's
   application/bundle id:
   - customer: `com.effyshopping.customer.mobile` (Android) + the iOS bundle id
   - shop: `com.effyshopping.shop.mobile` (+ iOS)
   - driver: `com.effyshopping.driver.mobile` (+ iOS)
3. **Download the client config files** and place them where the build expects (git-ignored):
   - Android → `apps/<app>-mobile/androidApp/google-services.json`
   - iOS → `apps/<app>-mobile/iosApp/GoogleService-Info.plist`
4. **Enable Cloud Messaging** (Build → Cloud Messaging).
5. **iOS push (APNs)**: in Apple Developer, create an **APNs Auth Key (.p8)**; upload it to Firebase →
   Project Settings → Cloud Messaging → Apple app configuration (Key ID + Team ID).
6. **Enable Crashlytics** (Release & Monitor → Crashlytics) for each app.
6b. **Firebase Project ID** → set `fcm_project_id` in `infra/envs/dev/dev.tfvars` (Terraform owns the
   SSM param — see A3). It is non-secret.
7. **Service account for the backend sender**: Project Settings → Service accounts → **Generate new
   private key** → download the **JSON**. This is a **secret**. Terraform creates the empty secret
   CONTAINER (`notifications.tf`); you seed its VALUE **after** `make apply` with `put-secret-value`
   (NOT `create-secret` — the container already exists). Its exact name is published at
   `/effy/dev/notifications/fcm_service_account_arn`:

   ```bash
   ARN=$(AWS_PROFILE=ef aws ssm get-parameter --name /effy/dev/notifications/fcm_service_account_arn \
     --query Parameter.Value --output text --region ap-southeast-2)
   AWS_PROFILE=ef aws secretsmanager put-secret-value \
     --secret-id "$ARN" --secret-string file://<downloaded-service-account>.json --region ap-southeast-2
   ```

### A2. PostHog (product analytics + web error tracking)

1. **Create a PostHog account/project** at <https://posthog.com>, choosing the **region** that matches
   the platform's jurisdiction (host is `https://us.i.posthog.com` **or** `https://eu.i.posthog.com`).
2. Copy the **Project API key** (`phc_...`, client-embeddable/public-safe) and the **API host**.
3. Set the non-secret values in `infra/envs/dev/dev.tfvars` (Terraform owns these SSM params — A3):

   ```hcl
   posthog_project_key = "phc_..."
   posthog_host        = "https://us.i.posthog.com"   # or https://eu.i.posthog.com — MUST match the project region
   telemetry_enabled   = true                          # the analytics kill switch (FR-026)
   fcm_project_id      = "effy-dev-xxxxx"              # from A1 step 6b
   ```

   The web `VITE_*` / `NEXT_PUBLIC_*` values (the same key/host) are build-time-inlined by the Amplify
   apps from these params; the FCM/`enabled` values are read by the backend/clients.
4. In PostHog project settings, **leave "Record user sessions" OFF** (we ship session replay disabled,
   research R11). Enable **Error tracking** (used by the web surfaces).

### A3. Apply infra & deploy (operator)

```bash
make apply ENV=dev                                   # telemetry.tf + notifications.tf (SSM params from tfvars,
                                                     # the FCM secret container, worker IAM, the send-fail alarm)
# then seed the FCM service-account secret VALUE (A1 step 7), then:
# commit the migration, then:
make db-up ENV=dev                                   # device_token + notification_request
make edge-deploy SERVICE=notifications ENV=dev       # the worker
make edge-deploy SERVICE=customer ENV=dev            # + shop, driver — the /devices endpoints
make core-run                                        # or redeploy core-api — the order_paid producer
```

> **Checklist of values to hand back / confirm present**: Firebase Project ID; 6× `google-services.json`
> / `GoogleService-Info.plist`; APNs .p8 (Key ID + Team ID) uploaded; `fcm_service_account` secret;
> `fcm_project_id`, `posthog_project_key`, `posthog_host`, `telemetry/enabled` params.

---

## B. Validation walks (prove the user stories)

### US1 — Crash & error visibility (P1)
- Trigger a deliberate crash in each mobile app (a debug-only "force crash" affordance) → within
  **5 min** it appears in Firebase Crashlytics for that app, with a **symbolicated** trace (confirm the
  KMP framework dSYM upload worked — no "missing symbols" warning), tagged with app version + platform,
  and `sub` if signed in. **Inspect the report for PII → none** (SC-001, SC-004).
- Throw an unhandled error on each web surface → it appears in PostHog error tracking with `surface` +
  route.
- Remove the Crashlytics config → app still launches (fail-open, FR-005/SC-007).

### US2 — Product analytics across surfaces (P2)
- On each surface, perform: view storefront → view product → add to cart (and the shop/driver
  equivalents). Confirm the **taxonomy-named** events land in PostHog with the right `surface`, `sub`
  association, and **non-PII** props. Build a **funnel** for the customer audience spanning
  customer-web + customer-mobile events under identical names (SC-002).
- Unset `posthog_project_key` (or `telemetry/enabled=false`) → every capture is a no-op, apps normal
  (SC-006/SC-007). Attempt to emit an ad-hoc event name → rejected at compile/wrapper time (SC-010).

### US3 — Push notifications (P3)
- Sign in on each mobile app, grant permission → a `device_token` row exists for that `sub`+audience
  (SC-008). Sign out → the row is deleted (no further delivery; shared-device safety).
- Cause each starter event and confirm delivery **within 90 s** to the right recipient (SC-003 — the
  interim ~1-min poll bound; sub-30 s comes with the deferred SNS/SQS backbone):
  - checkout a real (test-card) order → **order_paid** to the customer;
  - a shop portion is created → **shop_new_order** to shop staff; mark it ready → **order_ready**;
  - assign a driver run → **run_assigned**; go out for delivery / deliver → **order_out_for_delivery**
    / **order_delivered**.
- Tap a notification → the app **deep-links** to the right screen (FR-017).
- Re-deliver the same producer event (or run the worker twice) → **no duplicate** notification
  (SC-003/FR-016). Uninstall an app and re-send → the dead token is **pruned** on first failed send
  (SC-009/FR-018).

### US4 — Privacy & performance (P2)
- **PII audit**: sample every payload type (analytics event, crash report, `device_token`,
  `notification_request`, FCM message) → zero PII beyond `sub` (SC-004).
- **Performance**: measure mobile cold-start with telemetry on vs off → delta **≤ 50 ms** (SC-005);
  re-run the customer-web **bundle gate (174 KB)** → no regression; confirm no telemetry call blocks the
  UI thread or a backend request.
- **Consent** (customer): decline → SDK never loads, no events. **Kill switch**: set
  `telemetry/enabled=false` → clients stop collecting on next start with **no app release** (SC-006).
- **Fail-open**: make each provider slow/unreachable → user-facing flows unaffected (FR-027/SC-007).

---

## Machine gates (run before hand-off)

`pnpm -r typecheck` · `pnpm -r test` (edge-notifications + device slices + web-kit + customer-web
consent/no-PII) · Go `build/vet/test` (producer + payload map) · KMP `:shared:testAndroidHostTest` +
iOS compile + `mobile-guard` + the taxonomy **drift check** · `terraform validate`/`fmt` · the
customer-web **bundle gate** · banned-address + no-PII source sweeps.
