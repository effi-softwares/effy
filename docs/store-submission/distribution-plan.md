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

Store auto-update is often off or delayed on phones, so the apps also need an **in-app update check**
(not built yet, planned as its own feature):

- Each app sends its version on every request (e.g. `X-Effy-App: customer/android/1.0.2+3`).
- The server keeps a **minimum** and a **latest** build per app and platform, set in back-office.
- Below the minimum, the app shows a blocking **"Update required"** screen and the server refuses its
  requests (426 `app_update_required`). Below the latest, it shows a **"New version available"** sheet
  the user can close. Android installs from Play can use Google's In-App Updates API.
- Apps that are open learn about a change through the live channel (071), never a timer.

⚠ This check must be in the **first builds that reach real users**. A build without it can never be
forced to update, and every API change then has to keep it working.

## Steps, in order

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
