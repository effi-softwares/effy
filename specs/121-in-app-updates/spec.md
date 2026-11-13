# Feature Specification: App Updates Inside the App

**Feature Branch**: `121-in-app-updates`
**Created**: 2026-11-13
**Status**: Built (2026-11-13) - not applied, published or walked
**Input**: User description: "When the customer or driver app launches it checks the latest version of the app, compares it
with its own, and shows an update screen or sheet before Home. Three kinds of update: mandatory (the app cannot be used
until updated), optional (Later lets the person carry on; asked again on the next launch), and a notice (told once, never
blocks; the lowest priority). The values are kept per platform: iOS latest / recommended / minimum and Android latest /
recommended / minimum. No back-office feature: this is for Effy's platform developers, changed some other way. The check
must be very cheap, efficient and fast. Update buttons open the store, or something better where it exists. Research how
industry apps handle this and decide whether all three kinds are needed."

## Background

**Today.** The customer and driver apps have no idea whether a newer version exists. Once a build is on a phone, Effy
cannot tell its owner to update and cannot stop that build from being used, however old it gets. Every change to what the
apps and Effy say to each other then has to keep every old build working, for ever.

The stores update most phones by themselves, within a day or two of a release. They do not let Effy choose when, force an
update, or tell anyone an update exists. Some phones lag for weeks, and a phone with automatic updates turned off never
updates unless its owner chooses to. See `docs/store-submission/distribution-plan.md`.

**How others do it** (research, 2026-11-13):
- The common minimum is **two** levels: a *minimum* version that blocks, and a *latest* version that is suggested and can be
  dismissed. The usual guidance is to suggest **at most once per release**, so people are not nagged.
- Long-standing update tools offer **three**: *force*, *option* (asked again next time) and *skip* (once per version).
  The Android store gives each release a priority, and its own example uses three tiers: high (update at once), medium
  (suggest), low (do not prompt).
- Shared rules: check at launch and when the app comes back to the screen; compare version numbers, never text; let people
  in when the check fails; when offline, honour the last answer; only block once the new version is actually in the store.

**Decision: all three levels.** A *notice* is the normal setting for a routine release, *optional* is for an important
one, and *mandatory* is only for releases where older builds would break or are unsafe. Having the notice stops the
optional prompt being overused.

**This feature** gives each app a launch-time check that decides one of four outcomes for its platform, and the screens for
each. Effy's developers change the settings themselves, without a back-office page and without releasing an app.

### The levels

Each app (customer, driver) has, **for each platform (iPhone, Android)**, three build numbers and a store page:

| Setting | Meaning |
|---|---|
| **Minimum** | Builds below it cannot be used |
| **Recommended** | Builds below it are asked to update at every launch |
| **Latest** | Builds below it are told once that an update exists |
| **Store page** | Where "Update now" leads on that platform |

Always minimum ≤ recommended ≤ latest. For a phone on build *b*:

| Condition | Outcome | What the person sees, before Home |
|---|---|---|
| *b* < minimum | **Mandatory** | A full screen: the app cannot be used until updated |
| minimum ≤ *b* < recommended | **Optional** | A sheet with **Update now** and **Later**, at every launch |
| recommended ≤ *b* < latest | **Notice** | The same sheet, **once** for that latest build |
| *b* ≥ latest | **None** | Nothing |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A build that no longer works is stopped (Priority: P1)

Effy changes how orders are placed, and builds older than 40 can no longer place one. A developer raises the customer app's
Android **minimum** to 40, once version 40 has reached every Android phone the store will give it to. Sam opens the
customer app on build 37. The launch screen stays up for a moment, then a full screen says the version no longer works and
must be updated, with **Update now** as its only action. On Android, Update now starts the store's own update inside the
app: it downloads, installs, and the app restarts on build 40 straight into Home. On iPhone, the App Store opens on Effy's
page. Sam cannot reach any other screen while on build 37, and the screen comes back if Sam leaves the app and returns.

**Why this priority**: it is the reason for the feature. Without it, every build ever given out has to keep working.

**Independent Test**: set a minimum above the build installed on a test phone; launch; only the mandatory screen is
reachable; Update now leads to the update; after updating, the app opens normally.

**Acceptance Scenarios**:

1. **Given** a build below the minimum, **When** the app launches, **Then** the mandatory screen shows before any other
   screen and nothing else can be opened from it (no back, no tabs, no links into the app).
2. **Given** the mandatory screen, **When** the person presses Update now on an Android phone that installed the app from
   the store, **Then** the store's own update runs inside the app and the app restarts on the new build.
3. **Given** the mandatory screen on an iPhone, or on an Android phone where the in-app update cannot run, **When** Update
   now is pressed, **Then** the app's store page opens.
4. **Given** the mandatory screen, **When** the person returns to the app without having updated, **Then** the mandatory
   screen is still shown.
5. **Given** a build that was told "mandatory" on its last check, **When** it launches with no connection, **Then** the
   mandatory screen shows (the last answer is honoured).
6. **Given** the app is open on Home, **When** the minimum is raised above its build and the person returns to the app after
   leaving it, **Then** the mandatory screen replaces whatever was on screen.
7. **Given** a customer on the mandatory screen, **Then** it also offers to shop on the website instead; **given** a driver,
   **Then** it also offers to call dispatch (the number from the app's help settings, when one is set).

---

### User Story 2 - An important update is asked for at every launch (Priority: P1)

A release fixes a problem that makes some drivers' scans fail. A developer raises the driver app's **recommended** build on
both platforms. Ana opens the driver app on the older build. Before Home, a sheet says a new version is ready, with
**Update now** and **Later**. She presses Later and works as usual. The next time she launches the app, the sheet is there
again. She presses Update now: on Android the new version downloads while she keeps working, and a bar then offers to
restart into it; on iPhone the App Store opens on Effy Driver's page.

**Why this priority**: most important releases are not breaking; they need people to update soon without being blocked.

**Independent Test**: set a recommended build above the installed one; launch; the sheet shows; Later reaches Home; a
second launch shows the sheet again.

**Acceptance Scenarios**:

1. **Given** a build below recommended and not below minimum, **When** the app launches, **Then** the update sheet shows
   before Home, with Update now and Later.
2. **Given** the sheet, **When** Later is pressed (or the sheet is dismissed), **Then** Home opens and the person uses the
   app normally until the next launch.
3. **Given** Later was pressed, **When** the app is next launched (not merely brought back to the screen), **Then** the sheet
   shows again.
4. **Given** Update now on an Android phone that installed from the store, **When** pressed, **Then** the new version
   downloads while the person carries on, and once downloaded a bar offers **Restart**; restarting opens the new build.
5. **Given** Update now on an iPhone, or where the in-app download cannot run, **When** pressed, **Then** the app's store page
   opens.

---

### User Story 3 - A routine update is mentioned once (Priority: P2)

A release adds a small improvement. A developer raises only the **latest** build. Lee opens the customer app on the older
build and sees the update sheet once, before Home. Lee presses Later. On every later launch Lee goes straight to Home, until
the developers publish a newer latest build, which is mentioned once again.

**Why this priority**: it is the default for most releases and keeps prompts rare; without it, every release would have to
choose between nagging and silence.

**Independent Test**: set a latest build above the installed one; launch; the sheet shows once; a second launch goes
straight to Home; raising latest again shows it once more.

**Acceptance Scenarios**:

1. **Given** a build below latest and not below recommended, **When** the app launches and this latest build has not been
   mentioned on this phone, **Then** the update sheet shows before Home.
2. **Given** the notice was shown for latest build *L*, **When** the app launches again with the same *L*, **Then** Home
   opens with no sheet.
3. **Given** the notice was shown for *L*, **When** the latest becomes a higher build, **Then** the next launch shows the
   notice once for that build.
4. **Given** a notice and an optional update would both apply, **Then** only the optional one (the stronger) is shown.

---

### User Story 4 - A developer changes the settings without a release or a console (Priority: P1)

After a release has reached everyone in the store, a developer changes the settings for that app and platform, checks
them, and publishes them for one environment with one command. Within minutes, every app that launches in that
environment acts on them. A mistake such as a minimum above the latest, a missing store page under a minimum, or a number
that is not a build number is refused before anything reaches a phone. Every change is kept, with who made it and when,
in the platform's history.

**Why this priority**: without it, none of the other stories can be used.

**Independent Test**: change a value, publish to dev, launch a dev build on a phone: it acts on the new value within the
stated time. Write a minimum above the latest: publishing refuses it and phones keep the previous settings.

**Acceptance Scenarios**:

1. **Given** valid new settings for an app, **When** a developer publishes them to an environment, **Then** apps in that
   environment act on them at their next launch, and no later than 5 minutes after publishing.
2. **Given** settings where minimum > recommended, recommended > latest, a value that is not a whole build number, or a
   minimum or recommended build above zero with no store page for that platform, **When** a developer tries to publish
   them, **Then** they are refused with the reason and nothing changes for any phone.
3. **Given** settings were published, **When** anyone later asks what they were on a given date and who changed them,
   **Then** the platform's history answers.
4. **Given** settings for one environment (for example dev), **When** they are published, **Then** apps built for any other
   environment are unaffected.

---

### User Story 5 - People can see their version and that an update exists (Priority: P3)

Whenever an optional update or a notice applies, the app's Account area shows an **Update available** row that leads to
the same update action. The app's version (version and build) is shown there too, so a person can tell support which
version they are on.

**Why this priority**: helpful after Later has been pressed or a notice has gone, but not needed to make the feature work.

**Independent Test**: with a notice that has already been shown, open Account: the row is there and leads to the update.

**Acceptance Scenarios**:

1. **Given** an optional update or a notice applies, **When** the person opens Account, **Then** an Update available row is
   shown and leads to the same update action.
2. **Given** no update applies, **Then** there is no such row, and the version and build are still shown.

---

### Edge Cases

- **No connection or a slow answer at launch.** The launch screen waits for the answer for a short, fixed time (FR-008);
  after that the app continues with the last answer it saved, or, with none, lets the person in. An answer that arrives
  later and says mandatory shows the mandatory screen at once; a later optional answer or notice waits for the next launch.
- **The settings cannot be read or make no sense on the phone** (damaged, an unknown shape). The person is let in, and the
  last saved answer is kept. A failed check never locks anyone out.
- **An Android staged rollout.** The store gives a new build to only some phones at first. The optional sheet and the
  notice are shown on Android only when the store says this phone can get the update, so nobody is sent to a store page that
  has nothing for them. The minimum must only be raised once a rollout has reached everyone (FR-015).
- **iPhone phased release.** It only slows automatic updates; anyone can update by hand from the App Store, so the prompt
  works from the day the build is live.
- **A build newer than latest** (a test build, or settings not raised yet). Outcome none.
- **A new build needs a newer phone system than some phones have.** Those phones cannot install it. Raising the minimum to
  it locks them out; the developer's instructions say so (FR-016).
- **The mandatory screen while busy.** A customer in the middle of checkout, or a driver in the middle of a round, is stopped
  when they next return to the app. The basket is kept and the round waits for the driver, so nothing is lost; the driver's screen offers to call dispatch.
- **A guest customer** (not signed in) is checked the same way; the check never needs sign-in.
- **Driver work recorded without signal** (a drop, a hand-over) keeps being sent to Effy while the mandatory screen is
  showing, and anything still waiting is kept through the update and sent by the new version. Blocking the app never
  loses work already done.
- **An app that never leaves the screen** (a driver's phone on a mount all shift) learns of a new minimum at its next
  launch or return to the app; there is no checking on a timer.
- **The phone's back gesture on the mandatory screen** leaves the app; it never reveals what is behind it.
- **A notification tap or a link** that opened the app waits until the person is past the sheet, then opens where it was
  going; under a mandatory update it is not opened.
- **The person updates from the store without using the prompt.** The next launch finds a build at or above the settings
  and shows nothing.
- **Many apps launching at once** (after a push to everyone). The check stays fast and costs no more per launch.
- **Builds released before this feature** cannot be reached by it. None are in the public's hands today; this feature must
  be in the first builds that are (distribution-plan.md).

## Requirements *(mandatory)*

### Functional Requirements

**Deciding**

- **FR-001**: The customer and driver apps, on iPhone and Android, MUST each decide at launch one outcome (mandatory,
  optional, notice or none) from their own build number and the settings for that app and platform, exactly as in "The
  levels".
- **FR-002**: Build numbers MUST be compared as whole numbers. The build number MUST mean the same build on both platforms
  of an app, and MUST rise with every release.
- **FR-003**: Each app MUST read only its own settings (the customer app never the driver app's, and the reverse).
- **FR-004**: Reading the settings MUST NOT need the person to be signed in.

**When**

- **FR-005**: The check MUST run at every launch, before Home, and again each time the app comes back to the screen. A
  **launch** is the app starting afresh (not already running); returning to a running app, turning the phone or the
  screen being redrawn is not a launch.
- **FR-006**: On coming back to the screen, only a **mandatory** outcome is acted on; the optional sheet and the notice are
  shown only at launch.
- **FR-007**: The app MUST NOT check on a timer.
- **FR-008**: At launch the app MUST wait for the answer for no more than **1.5 seconds** while the launch screen shows. When
  the last saved answer is less than 3 minutes old, it MUST use that answer without waiting, and still check in the
  background: a mandatory answer that arrives takes over at once.
- **FR-009**: The app MUST save the last answer it received. With no answer in time, it MUST act on the saved answer; with
  neither, it MUST let the person in. A failed or unreadable check MUST NOT lock anyone out.

**Screens**

- **FR-010**: Mandatory MUST be a full screen, not a sheet, shown before any other screen, with **Update now** as its main
  action and no way into the rest of the app. For customers it MUST also offer to shop on the Effy website; for drivers, to
  call dispatch when a dispatch number is set.
- **FR-011**: Optional and notice MUST be a bottom sheet over the launch screen, before Home, with **Update now** and
  **Later**. Dismissing the sheet counts as Later.
- **FR-012**: A notice MUST be shown at most once per latest build on a phone. An optional update MUST be shown at every
  launch until the person updates or the setting changes.
- **FR-013**: The words on each screen MUST be one set per app, the same on both platforms (draft wording: "Words").
  Each app's screens use its own look (customer: sheets only, no centred dialogs; driver: its own kit), in light and dark.

**Updating**

- **FR-014**: **Update now** MUST:
  - on **Android**, when the app was installed from the store and the store offers the update to this phone: for
    mandatory, run the store's update inside the app (download, install and restart, which the person cannot skip); for
    optional and notice, download in the background while the app is used, then offer **Restart** when ready.
  - otherwise (every iPhone; Android when the in-app update is not possible): open the app's page in the store app.
- **FR-015**: On Android, when the app was installed from the store, the optional sheet and the notice MUST be shown only
  when the store says this phone can get an update (an install from elsewhere, such as a test build, is decided by the
  settings alone). Mandatory MUST be shown whatever the store says (so a mistake shows, rather than silently letting an unsafe build
  run), and the instructions MUST say to raise a minimum only once a rollout has reached every phone.

**Settings**

- **FR-016**: For each app, platform and environment there MUST be one set of settings: minimum, recommended and latest
  build numbers and the store page. Changing them MUST NOT need an app release or a back-office page, and MUST be done by
  Effy's developers only. Written instructions MUST cover when to raise each value (including staged rollouts and phones
  that cannot run the new build).
- **FR-017**: Settings MUST be refused before they reach any phone when: minimum > recommended or recommended > latest; a
  value is not a whole number of zero or more; or, in production, any of the three is above zero with no store page for
  that platform. In a test environment the store page may be left empty; **Update now** is then not offered, so the
  screens can be tried before the apps are in the stores.
- **FR-018**: Published settings MUST reach every app in that environment within **5 minutes**, and MUST NOT affect any other
  environment.
- **FR-019**: Every change to the settings MUST be kept with who made it, when, and the previous values.
- **FR-020**: Reading the settings MUST be fast and very cheap: no sign-in, nothing computed per request, and a repeat read
  of unchanged settings should transfer almost nothing.

**Account and measurement**

- **FR-021**: When optional or notice applies, Account MUST show an Update available row that leads to the same action as
  Update now. Account MUST always show the app's version and build.
- **FR-022**: Each outcome shown and each choice (Update now, Later, Restart, website, call dispatch) MUST be measured
  through the platform's existing product analytics, with the app, platform and build, and nothing that identifies the
  person beyond what that analytics already allows.

### Words (draft, to be approved)

| Where | Customer app | Driver app |
|---|---|---|
| Mandatory title | Update Effy to keep going | Update Effy Driver to keep going |
| Mandatory text | This version of Effy no longer works. Update to the latest version to keep shopping. | This version no longer works. Update to the latest version to carry on with your work. |
| Mandatory action | Update now | Update now |
| Mandatory other | Shop on effyshopping.com | Call dispatch |
| Sheet title | A new version of Effy is ready | A new version of Effy Driver is ready |
| Sheet text | Update for the latest improvements. | Update for the latest improvements. |
| Sheet actions | Update now · Later | Update now · Later |
| Downloaded bar | Update downloaded · Restart | Update downloaded · Restart |
| Account row | Update available | Update available |

### Key Entities

- **Update settings**: per app (customer, driver), platform (iPhone, Android) and environment: minimum, recommended and
  latest build numbers, and the store page. Changed only by Effy's developers; every change kept.
- **Saved answer** (on the phone): the last settings received and when, used when the next check has no answer in time.
- **Notice shown** (on the phone): the latest build for which the notice was shown, so it is shown once.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a build below the minimum, no screen but the mandatory one can be reached, on all four apps, including with
  no connection after a mandatory answer.
- **SC-002**: The check adds no more than 1.5 seconds to a launch with a slow or absent connection, and no noticeable time
  when an answer from the last 3 minutes is saved.
- **SC-003**: Published settings change what launching apps do within 5 minutes, in the environment published to only.
- **SC-004**: A notice is shown exactly once per latest build per phone; an optional update at every launch until updated.
- **SC-005**: Invalid settings never reach a phone (every rule in FR-017 is refused in a test).
- **SC-006**: Running the check costs under one US dollar per million launches, with no new always-running service.
- **SC-007**: A failed check (no connection, a damaged answer) never stops anyone using the app, except when the last answer
  was mandatory.
- **SC-008**: On Android installs from the store, a person completes an update without leaving the app.

## Assumptions

- **No back-office page.** The settings belong to Effy's developers and are changed through the platform's own tooling,
  run by the operator like other deploy steps (CLAUDE.md, Mode of work).
- **The build number** comes from each app's version file for both platforms; the iPhone apps are changed to use it (today
  they keep their own numbers, which do not move).
- **Per environment.** dev and prod (and any later environment) each have their own settings; a dev build reads dev's.
- **Store pages** are known once the apps are in the stores. Until then production's values stay at zero (FR-017); a test
  environment may show the screens without a store page.
- **Adoption** (how many phones are on which build) is read from the existing product analytics, which already records
  each event's app version; this feature adds no report.
- **Builds before this feature** cannot be reached; none are in the public's hands.
- **Out of scope**: a back-office page; Effy's servers refusing old builds; telling people about updates through Messages;
  release notes inside the sheet; the store page shown inside the iPhone app (it sometimes shows "Open" rather than
  "Update" for the app itself, so the App Store app is opened instead).
