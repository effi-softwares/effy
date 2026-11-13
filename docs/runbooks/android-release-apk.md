# Android release APKs (customer + driver)

How to build a signed APK to sideload on a phone or hand to a tester, and how its version is kept
moving. All commands run from the **repo root**.

## Build

```bash
make cm-apk                # customer app → customer-app-<version>+<build>.apk
make dm-apk                # driver app   → driver-app-<version>+<build>.apk

make cm-apk BUMP=patch     # also raise the version: patch | minor | major
```

The APK is written beside Gradle's own output:

| App | File |
|---|---|
| Customer | `apps/customer-mobile/androidApp/build/outputs/apk/release/customer-app-1.0.0+2.apk` |
| Driver | `apps/driver-mobile/androidApp/build/outputs/apk/release/driver-app-1.0.0+2.apk` |

Install over an existing copy with `adb install -r '<that path>'`, or share the file and open it on
the phone. ⚠ Quote the path: it contains a `+`.

`androidApp-release.apk` stays in the same folder. The named file is a **copy**: if Gradle's own
file were moved away, every build would package the APK again, even when nothing changed.

## The name: `<app>-<version>+<build>.apk`

- **app**: `customer-app` or `driver-app`.
- **version**: three numbers, `1.0.0` (Android's `versionName`). This is what people see.
- **build**: one whole number (Android's `versionCode`). This is what Android compares: **a phone
  installs an update only if its build number is higher** than the installed one.

The name comes from AGP's `output-metadata.json` beside the APK, so it always matches what is
inside the file (`scripts/name-apk.sh`).

## How the numbers go up

Each app keeps both numbers in one committed file, which `androidApp/build.gradle.kts` reads:

- `apps/customer-mobile/version.properties`
- `apps/driver-mobile/version.properties`

```properties
versionName=1.0.0
versionCode=1
```

`make cm-apk` / `make dm-apk` run `scripts/bump-version.sh` before building:

| Command | 1.0.0+1 becomes |
|---|---|
| `make cm-apk` | 1.0.0+**2** |
| `make cm-apk BUMP=patch` | 1.0.**1**+3 |
| `make cm-apk BUMP=minor` | 1.**1**.0+4 |
| `make cm-apk BUMP=major` | **2**.0.0+5 |

- **The build number goes up by one on EVERY release build** and never resets, even when the
  version changes. No two APKs share a number, so each one installs over the last.
- **The version changes only when you ask** (`BUMP=`). Choosing between a fix and a feature is
  your decision; nothing guesses it.
- **A failed build still uses up its number.** A gap is harmless; reusing a number is not.
- Debug runs (`make customer-android`, `make driver-android`, `assembleDebug`) read the same file
  and **never** raise it.
- ⚠ **Commit `version.properties` after every release build.** That file is the record of which
  numbers have been handed out. Uncommitted, a `git checkout`/reset or a second machine hands
  the same numbers out again.
- Never write the numbers in `build.gradle.kts`. To set them by hand (for example, to jump past a
  build already given out), edit `version.properties`. The build stops if `versionName` is not
  three numbers or `versionCode` is not a number.

## What a build needs

| | Customer | Driver |
|---|---|---|
| Build config | `apps/customer-mobile/secrets.properties` (from `secrets.properties.example`, values from `make output ENV=dev`) | `apps/driver-mobile/secrets.properties` (same) |
| Signing | `keystore.properties` → `keystore/customer-dev.jks`. A **dev** key; create it with `make cm-keystore` | `keystore.properties` → `release/effy-driver-release.jks` (`keystore.properties.example`) |

Both are git-ignored. ⚠ **Every update must be signed with the same key** as the installed app,
or Android refuses it. Losing a keystore means uninstalling the app on every phone.

## Not covered

- **iPhone builds** keep their own version in the Xcode project; this does not change it.
- **Play Store uploads** (an AAB signed with an upload key) are not set up. The customer key here is
  a dev key, never a store key. See `docs/store-submission/`.
