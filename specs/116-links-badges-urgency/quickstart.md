# Quickstart: Reaching the Right Place (116)

## Local checks

1. `make db-local` / goose up, then down-to `20261113090000`, then up: the new table appears and disappears.
2. `pnpm --filter @effy/shared-types test`: the link fixtures round-trip, and `interruptionLevelFor` never yields `critical`.
3. edge-api: `badge.guard`, sender tests (tag, levels, badge-only payloads) and `badge.container.test.ts`:
   - seen on one device queues one row;
   - a burst of 20 changes is claimed once;
   - an expiry is queued by the sweep;
   - a correction goes to app devices only.
4. customer-web: the well-known route tests (404 empty; shapes when set), then build. Both files appear as static routes.
5. Customer app: the `WebLink` fixture test, the badge handling test (`keep` cancels the rest) and the host tests. The
   driver app's badge test.

## Walk (Android, dev)

1. Set `android_app_cert_sha256` to the debug key's SHA-256 (`./gradlew :androidApp:signingReport`), then `make apply`,
   deploy customer-web, and put `WEB_SITE_HOST=dev.effyshopping.com` in `secrets.properties`. Install the app.
2. `adb shell pm get-app-links com.effyshopping.customer.mobile` shows `dev.effyshopping.com: verified`.
3. From a real Effy email, or `adb shell am start -a android.intent.action.VIEW -d https://dev.effyshopping.com/orders/<id>`,
   open each of the eight paths. Each opens the app screen (SC-001). Open `/email/unsubscribe?t=x` and check it opens the
   browser.
4. Uninstall the app: the same links open the website (SC-002).
5. Badge: get three notifications (the icon shows 3), then open the inbox on the website. Within a minute the phone's
   notifications are gone and the badge is clear (SC-003). Archive one of three unseen on the website: that notification
   disappears.
6. A burst: on the website, mark all read and archive ten. The drain log shows one correction for the person (SC-004).
7. Urgency: look at a sent push payload in the sender's debug log or test. Important → `time-sensitive` only with
   `apple_team_id` set; offer → `passive` (SC-005, SC-006).

## After the paid Apple account

Follow `docs/observability-apple-blockers.md` → "After paying" (the 116 steps). Then repeat steps 3 and 5 on an iPhone
(SC-007).
