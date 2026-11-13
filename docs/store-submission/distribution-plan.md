# How the mobile apps reach phones in production (decided 2026-11-13)

Four apps: **customer** and **driver**, each on **iOS** and **Android**. This is the plan for how
each one is distributed and kept up to date. Nothing here is set up yet. Today the Android apps are
sideloaded APKs (`make cm-apk` / `make dm-apk`, see
[android-release-apk.md](../runbooks/android-release-apk.md)), and there are no iOS builds on phones.

## Where each app goes

| App | iOS | Android |
|---|---|---|
| **Customer** | **Public App Store** | **Public Play Store** |
| **Driver** (Effy employees only) | **Unlisted App Store app** | **Play Store**: a public listing or a closed testing track |

The customer app is for the public, so it can only go on the public stores.

The driver app is for employees only. Nobody can sign in without an account staff created, so it
doesn't have to be hidden. These routes keep it quiet anyway, and the stores still update it the
normal way:

- **iOS: an unlisted App Store app.** Request it from Apple once. It goes through the normal review,
  but only people with the link can find it, and it updates like any App Store app. Don't use a
  public listing: Apple may reject an app that only a company's own staff can use (its review
  guidelines point those apps to unlisted or custom-app distribution).
- **Android: a normal Play listing, or a closed testing track** (an invite-only email list, with
  normal Play updates). Either one works long term.

### Rejected for the driver app, and why

| Option | Why not |
|---|---|
| TestFlight as the permanent channel | Builds expire after 90 days. It's for testing, not production. |
| Apple Developer Enterprise Program (US$299 a year) | Meant for large organisations putting apps on their own devices. Apple rarely accepts applicants, and it isn't needed here. |
| Managed Google Play private app | Needs device management (Android Enterprise) on every driver's phone. Too much setup at this size. Revisit only if Effy starts issuing company phones. |
| Sideloaded APK / Firebase App Distribution | Fine for testers before launch. Not for production: drivers would have to allow unknown sources, and there are no automatic updates. |
| Apple Business Manager custom app | Workable and free, but more admin than an unlisted app. Keep it as a fallback if Apple refuses the unlisted request. |

## Accounts: enrol as the organisation, not a person

Both developer accounts are opened **in Effy's name as an organisation**:

- Google requires **new personal** Play accounts to run a closed test with 12+ testers for 14 days
  before they can publish to production. Organisation accounts skip this.
- The stores show **Effy** as the seller, not a person's name.
- Apple Business Manager (the fallback above) needs an organisation account.

Enrolling as an organisation needs a **D-U-N-S number**. It's free through Apple's D-U-N-S lookup
page and can take a week or more, so request it early. It also needs a **registered company**: a
personal ABN is not enough.

## Cost

| Item | Cost |
|---|---|
| Apple Developer Program (organisation): covers both iOS apps | **US$99 a year** (about A$149 billed in Australia) |
| Google Play developer account: covers both Android apps | **US$25 once** |
| D-U-N-S number | Free (via Apple's lookup; ignore paid fast-track services) |
| Unlisted App Store app | Free (part of the Apple membership) |
| Play closed testing track | Free (part of the Play account) |
| Apple Business Manager | Free |
| Firebase App Distribution (pre-launch testers) | Free |
| Company registration (only if Effy is not one yet) | ASIC's current fee |

**Total for all four apps: US$99 a year + US$25 once.** No store commission applies on orders:
groceries are physical goods, so Apple's and Google's 15–30% in-app purchase cut does not apply, and
payment stays on Stripe. It would only apply to something digital sold in the app, such as a paid
membership.

Prices are as known in mid-2026. Confirm them on the Apple and Google enrolment pages before paying.

## Updates once the apps are in the stores

The stores deliver new builds. A build can't be updated "over the air" (no CodePush-style updates):
Kotlin/Compose apps can't do it, and Apple forbids downloading code. Anything that must change
without a release has to come from the server, as promotions, skins, banners and words already do.

### What the stores do by themselves

| | App Store (iPhone) | Play Store (Android) |
|---|---|---|
| Auto-update | **On by default.** Installs in the background, usually overnight on Wi-Fi while charging | **On by default, Wi-Fi only.** Installs when the phone is idle, charging and on Wi-Fi |
| User can turn it off | Yes: Settings › App Store › App Updates | Yes: "any network", "Wi-Fi only" or "don't auto-update" |
| Tells the user an update exists | **No alert.** At most a number on the App Store icon and a list in the account page | Optional "updates available" / "apps updated" notifications, in the **user's** Play settings, covering all their apps at once |
| Release notes | "What's New" on the version page | "What's new" on the release |

What neither store lets **Effy** do: choose when phones update, force an update, send its own "please
update" message, or know that every phone has updated. Most phones update within a day or two; some lag
for weeks, and phones with auto-update off never update unless the person chooses to.

### How users are told about an update

1. **Inside the app (main channel).** The in-app update check below: a "New version available" sheet
   (once per version, with an **Update** button to the store page) and a blocking "Update required"
   screen. Open apps hear about a change at once through the live channel. This reaches everyone who
   opens the app.
2. **The stores.** Auto-update and the store's own lists and notifications, as above. Effy writes the
   release notes for every version.
3. **Back-office › Messages (112).** Drivers: an Announcement or Important message on every release
   ("Update the driver app before your shift"); no consent needed. Customers: an **Important** message
   only when an update is **required**, never for routine releases. Messages has no "on an older build"
   filter (121 left it out), so these go to the whole audience.
4. **No email** for app updates, except if a required update leaves many customers stuck.

### The in-app update check (built: feature 121)

Store auto-update is often off or delayed on phones, so both apps also check for themselves, at every launch, before
Home. Spec, plan and tasks: `specs/121-in-app-updates/`.

- **What they read.** One small public file per app and environment on the media CDN:
  `https://media.<zone>/app-updates/<app>.json`. It costs no server, no route and no database, about US$1 per million
  launches past CloudFront's free tier.
- **Three levels per platform**, as build numbers (`versionCode`, the same number on iPhone and Android):
  - below **minimum**: an "Update required" full screen; the app cannot be used;
  - below **recommended**: a sheet with Update now and Later, at every launch;
  - below **latest**: the same sheet, once for that build.
- **Update now.** Android: Google Play's in-app update (immediate when mandatory, a background download otherwise),
  shown only when Play has the update for that phone, which handles staged rollouts. iPhone: the App Store app.
- **Changing it.** Edit `config/app-updates/<env>/<app>.json`, commit, then `make app-updates ENV=<env>`. The command
  refuses invalid or uncommitted files, and git history is the record. When to raise what:
  [config/app-updates/README.md](../../config/app-updates/README.md).
- **Not built**: the server refusing old builds, a back-office page, and Messages audience filters by build.

⚠ This check must be in the **first builds that reach real users**. A build without it can never be forced to update,
and every API change then has to keep it working.

## Steps, in order

The full technical version of these steps is [publishing-runbook.md](./publishing-runbook.md).

1. Confirm Effy is a registered company; request the D-U-N-S number.
2. Enrol in the Apple Developer Program as an organisation (this also unblocks iOS push: see
   [observability-apple-blockers.md](../observability-apple-blockers.md), "After paying").
3. Open the Google Play developer account as an organisation.
4. Build the in-app update check (spec, plan, tasks) and include it in the first store builds.
5. Set up Play App Signing and an upload key (the customer key in `keystore/` is a dev key, never a
   store key), and produce AABs for the store.
6. Customer app: submit to both stores ([submission-checklist.md](./submission-checklist.md)).
7. Driver app: submit to the App Store and ask Apple for **unlisted** distribution; publish to Play
   (a public listing or a closed track with the drivers' emails).

## Releasing an update (once the apps are in the stores)

The same flow for all four apps; only the store step differs.

1. **Server first, and backwards compatible.** Deploy any backend change before the app. Old builds
   stay in use for weeks, so the server must keep answering them until the minimum build is raised.
2. **Build.** Raise the version (`BUMP=patch|minor|major`; the build number rises by itself) and commit
   `version.properties`.
   - Android: a signed **AAB** with the upload key (not the APK; store build target still to be added).
   - iOS: an Xcode **archive**, uploaded to App Store Connect. Set the version and build number there too
     (the iOS project keeps its own).
3. **Test on real phones.** Android: Play's internal testing track. iOS: TestFlight (internal testers
   need no review). Same binary that will go to the public.
4. **Submit and roll out.**

   | | Android (Play Console) | iOS (App Store Connect) |
   |---|---|---|
   | Review | Usually hours, sometimes a few days | Usually about a day |
   | Rollout | **Staged rollout**: e.g. 10% → 50% → 100%; can be **halted** | **Phased release** over 7 days (1→100%); can be paused, or released to all |
   | Driver app | Upload to its own track (production or the drivers' closed track) | Same as customer; it stays unlisted for every version |
   | Phones get it | Auto-update, typically within a day or two | Auto-update, typically within a day or two |

5. **Raise "latest"** in back-office for that app and platform **once the build is live in that store**.
   Open apps show "New version available".
6. **Raise "minimum" only when old builds must stop** (a removed contract, a serious bug), and only after
   the new build is available on **that** platform - iOS and Android go live at different times, so each
   has its own numbers. Raising it before the store has the build locks people out with nothing to install.
   Driver apps can be raised quickly (employees, told in advance); the customer app should wait until most
   phones have updated.

**There is no rollback.** A store release cannot be taken back: halt the rollout and ship a higher build
number with the fix. Apple has an **expedited review** request for urgent fixes. Anything fixable on the
server (prices, words, promotions, settings) needs no app release at all.

Later, the build-and-upload steps can be automated (fastlane or CI uploading to both stores); not needed
to start.
