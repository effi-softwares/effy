# Quickstart: validating 121

## Prerequisites

1. **Dev infrastructure.** Run `make apply ENV=dev` (the media.tf changes). Then `make output ENV=dev` shows `app_updates_url_customer` / `_driver`.
2. **App build config.** Add `APP_UPDATES_URL` to `apps/customer-mobile/secrets.properties` and `apps/driver-mobile/secrets.properties`.
3. **First publish.** Run `make app-updates ENV=dev` (both files at all zeros), then check:

   ```bash
   curl -sI https://media.dev.effyshopping.com/app-updates/customer.json
   ```

   Expect `200`, `content-type: application/json`, `cache-control: public, max-age=60`, and an `etag`. Sending that ETag back with `If-None-Match` gets `304`.

## Machine checks

```bash
pnpm --filter @effy/shared-types test   # validator + decide fixtures + Kotlin-copy parity
make app-updates-check                  # every config/app-updates/*/*.json is valid
cd apps/customer-mobile && ./gradlew :shared:allTests   # Kotlin decide = fixtures; gate state machine
cd apps/driver-mobile && ./gradlew :shared:allTests
bash scripts/mobile-guard.sh            # no centred dialog in the customer gate, etc.
bash scripts/driver-guard.sh
```

`make app-updates-check` must refuse each of these:
- `minimum > recommended`;
- `recommended > latest`;
- `-1`;
- `1.5`;
- in a `prod` file, `minimum: 3` with `storeUrl: null` (the same in a `dev` file passes);
- a placeholder store id;
- another app's Play id.

## Walk (dev build on a phone; the installed build is *B*)

| # | Set in `config/app-updates/dev/<app>.json`, then commit and `make app-updates ENV=dev` | Expect |
|---|---|---|
| 1 | all `0` | Launch goes straight to Home |
| 2 | `latest = B+1` | The sheet once, before Home. Later → Home. Relaunch → no sheet |
| 3 | `latest = B+2` | The sheet once again |
| 4 | `recommended = B+2` | The sheet at every launch. Later → Home. Bringing the app back to the screen shows no sheet |
| 5 | `minimum = B+1` (with a `storeUrl`) | The full screen at launch. No way into the app. Leave and return → still there. Customer: "Shop on effyshopping.com". Driver: "Call dispatch" |
| 6 | (from 5) airplane mode, relaunch | The mandatory screen (saved answer) |
| 7 | from 1, open the app on Home, then set `minimum = B+1`, wait 1 min, then leave and return | The mandatory screen replaces Home |
| 8 | all `0` again, airplane mode, clear app data, launch | Home after at most 1.5 s (fail open) |
| 9 | add the Android `storeUrl` (the Play URL with the app's own id); Update now on a sideloaded Android build | The Play page opens. With `storeUrl: null`, Update now is not offered |
| 10 | Account | Shows the version and build; "Update available" in states 2–4 |

Store-only checks (once there are Play internal-testing builds; R5):
- **Mandatory** runs Play's immediate update inside the app.
- **Optional** downloads in the background, then shows "Update downloaded · Restart".
- **Staged rollout**: with a build on Play internal testing at a staged percentage, a tester outside it sees no optional sheet.
