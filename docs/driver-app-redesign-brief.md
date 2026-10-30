# Effy Driver App - Redesign Brief for Claude Design (v2, 2026-10-15)

> **Use this one.** It supersedes [driver-app-design-brief.md](driver-app-design-brief.md), which
> describes the delivery model removed in 083, a monochrome theme that has since been replaced, and a
> code proof that does not exist. Background: [driver-app-review.md](driver-app-review.md). Work items:
> [driver-app-backlog.md](driver-app-backlog.md).
>
> **Scanning (added 2026-10-15):** package scanning is now the primary way a driver moves work forward,
> with taps and swipes as the fallback. See [driver-app-barcode-scanning.md](driver-app-barcode-scanning.md)
> and the "Scanning" page of the canvas. The flows in §5 below are the fallback paths.
>
> **How to use it:** paste everything from "1. What to design" to the end into Claude Design as the
> prompt.

---

## 1. What to design

A **simple, native-feeling phone app for Effy's own delivery drivers** on iOS and Android. Effy is a
single-brand grocery and e-commerce delivery company. Drivers are **salaried employees**, not gig
workers. The app does four things and nothing else:

1. **Sign in** (work email + 6-digit code) and **go on or off duty**.
2. **Collection run:** drive to Effy's fulfilment shops, collect the packages, check them in at the
   hub.
3. **Delivery run:** take packages from the hub to customers and record proof of delivery, or record
   why a delivery failed.
4. **Be told** when work is assigned or changes.

**Simplicity is the brief.** The current app has a Map tab, an activity feed, stats and a four-step
drop flow. The redesign removes them. Aim for the fewest screens and taps that still do the job.

## 2. Who uses it, and where

- **An employee, assigned work.** Nothing to accept or decline. No earnings, tips, pay or currency
  anywhere.
- **Used one-handed, moving, outdoors, sometimes in gloves, often with poor signal** (loading docks,
  basements, lifts). Requirements, not polish:
  - touch targets of at least 48dp, with primary actions at the bottom within thumb reach;
  - high contrast that stays readable in sunlight;
  - one obvious next action per screen;
  - every screen has an offline state.
- **Drivers see shop names and addresses** (an internal app). **At the customer's door, packages are
  labelled by position only** ("Package 1 of 3"), never by the shop they came from.
- **Words the app never uses:** "same-day" and "standard". Work is a **Collection run** or a
  **Delivery run**. A delivery shows its **day and window** exactly as the server writes it ("Today,
  4 pm – 6 pm", "Any time · 9 am – 9 pm"). At the hub a parcel goes either with **Effy** (with its
  window) or to a **Courier**.

## 3. Visual identity (fixed - use these values)

Effy's platform identity. Flat, calm, operational. Reference apps: Uber Driver, Bolt Driver,
DoorDash Dasher, and the simplicity of Apple's Wallet passes.

**Colour, light mode:**
- background `#ffffff`
- text `#0b1220`; muted text `#5c6b86`
- muted surface `#f1f5fb`; hairline border `#e1e8f3`
- **primary action - cobalt `#1d4ed8`**, white label; soft `#e9f0ff`, ink `#11317f`
- success `#0d8043` on `#e8f8ee`
- warning `#a85c05` on `#fff5e5`
- destructive `#cf2b1f` on `#fef2f1`
- attention / time pressure only `#b4550a` on `#fff3e8`

**Colour, dark mode (required):**
- background `#151515`; recessed rail `#111111`
- muted surface `#212121`; border `#2a2a2a`
- text `#fafafa` / `#a3a3a3`
- **primary `#60a5fa`** with a near-black label; soft `#1b2430`
- destructive `#f87171`; attention `#fb923c`

**Status colours, mapped one way only:**
- in progress → cobalt
- done → success
- waiting / at risk / late → warning
- failed → destructive
- inert → muted

Success and warning are **text on their own tint**, never a filled button.

**Type:** Geist (Geist Mono for order and package references).

**Shape:**
- radius steps of 4 / 6 / 8 / 10 (checkboxes / inputs / buttons / containers);
- status chips and badges are fully rounded pills.

**Rules:**
- **No gradients.**
- **Cards are bordered, never shadowed.** Only floating layers (sheets, dialogs) get a shadow.
- **Avoid card-heavy layouts:** prefer lists, sections and detail rows. The one exception is the
  current-stop "hero" on Today.

**Motion:** short and functional - screen transitions, the swipe-to-confirm, success ticks. Respect
the reduced-motion setting.

**Native feel:** iOS follows HIG (large titles, sheets), Android follows Material 3. Same layout and
identity on both.

## 4. Navigation - three tabs

**Today · History · Account.** There is no Map tab. Each stop and drop has a **Navigate** button that
opens Google Maps or Apple Maps with the address.

## 5. Screens to design (every screen in light and dark)

### 5.1 Getting in
1. **Splash** - the Effy mark on a cobalt ground.
2. **Sign in, email** - work email field and "Send code". States: invalid email, sending, offline,
   "We couldn't sign you in".
3. **Sign in, code** - six-digit code boxes, "sent to j•••@effyshopping.com", resend countdown.
   States: wrong code, expired code, too many attempts, offline.
4. **Account can't be used** - a disabled driver: a short message and Sign out.
5. **Permissions explainer (once)** - why notifications ("new work, changes to your run") and why the
   camera ("proof of delivery"). "Allow" and "Not now".
6. **Permission refused** - what stops working and how to turn it on in Settings.

### 5.2 Today (home) - the most important screen
Design each state:
- **Off duty** - a large "Go on duty" control. Nothing else competes with it.
- **On duty, no work** - "No work yet. You'll get a notification." Also show the **notifications are
  off** variant, which links to settings.
- **On duty, round not open yet** - the round shown in full, with "Opens at 3:15 pm" and the actions
  disabled, with that reason stated.
- **Collection run in progress** - a hero for the current shop (name, address, package count,
  **Navigate**, **Open stop**), then "Up next" (remaining shops, ending with "Hub check-in"), then
  "Later today" (other rounds held, with their times).
- **Delivery run in progress** - a hero for the current drop (suburb, window with a Due now / Late
  chip, package count, **Navigate**, **Deliver**), then the remaining drops.
- **Round changed by dispatch** - an inline note ("Dispatch added 2 drops") that can be dismissed.
- **Failed parcels to return** - a "Return 2 parcels to the hub" item that ends the delivery run.
- **Banners** that stack above everything:
  - Offline - "Showing what was loaded at 2:41 pm".
  - "2 updates saved - sending when you're back online".
  - "Not recorded: … tell dispatch" (error tint).
  - "Live updates paused - pull to refresh".
- **Duty control** - a compact toggle in the header when on duty. Going off duty while holding work
  asks for confirmation.

### 5.3 Collection run
1. **Run overview** - an ordered list of shops (status chip: To collect / Collected / Short), ending
   at the hub. Header shows the due time.
2. **Shop stop**
   - Shop name, address, Navigate.
   - The package list: each row has a Mono reference, a destination suburb, **EFFY · Today 4–6 pm**
     or **COURIER**, and cold/frozen markers. Tap a row to tick it; expand it to see the items.
   - "Report a problem" on a package (Missing / Damaged / Not ready, plus an optional note).
   - **Swipe to confirm "Collected 5 of 6"**, then a confirmation if any package is neither ticked
     nor reported.
   - States: loading, saved on phone (offline), last-loaded copy (stale).
3. **Report a problem** - a bottom sheet: which package, what is wrong, a note.
4. **Hub check-in** - confirm, then the result: **Effy** grouped by day and window ("Today, 4–6 pm ·
   8 parcels - load now"; "Thu 15 Oct, 10–12 · 3 parcels - shelve") and **Courier · 4 parcels**. Also
   design the offline state: "Checked in - sending, the split will show when you're back online".

### 5.4 Delivery run - two taps to a delivered drop
1. **Run overview** - drops in order, each with suburb, window, package count and a status chip
   (Next / Delivered / Failed). A progress bar (counts, never money).
2. **Drop**
   - Customer first name, full address, window chip, the customer's instructions (a highlighted
     callout, including "Leave at the door" or "Meet at the door").
   - Packages by position, with cold markers.
   - **Navigate** and **Call customer**.
   - One primary button, **Deliver**, and a secondary **Can't deliver**.
3. **Choose proof** - a bottom sheet led by the customer's preference: **Photo** (handed over),
   **Signature**, **Left safely (contactless)**.
4. **Photo capture** - full-screen viewfinder, shutter, retake / use. For contactless, add a "Left
   at" picker (Front door / Reception / Mailroom / With a neighbour) and an optional note.
5. **Signature** - a full-width pad, the customer's name, clear / done.
6. **Delivered** - a success tick, "Drop 4 of 7 done", **Next drop**. Also design the offline
   variant: "Delivered - proof saved on this phone, sending when you're back online".
7. **Can't deliver** - a reason list (Nobody home / Wrong address / Customer refused / Access
   blocked / Other - Other requires a note), Submit, then "Keep the parcel - return it to the hub".
8. **Return to hub** - a list of the failed parcels and "Checked in at hub".

### 5.5 History
- A list by day: runs (collection or delivery, time, stop count) and deliveries (suburb, time, a
  "proof captured" mark).
- **Detail** - a run's stops, or a delivery's proof (photo or signature thumbnail, method, time,
  note).
- An empty state.

### 5.6 Account
- Name, work email, vehicle and plate, hub, duty status.
- Appearance (Match phone / Light / Dark) as an inline control, not a separate screen.
- Notifications status (on/off, with a link to settings).
- **Help**: Call dispatch, Call hub desk, Driver handbook. A contact that isn't configured shows
  "Not set up".
- App version.
- **Sign out**, which confirms and says it also sets the driver off duty. If the driver still holds
  work, warn them.

### 5.7 Notifications (system tray, both platforms)
- "New run assigned - Collection run, 5 shops, opens 3:15 pm"
- "Your run changed - 2 drops added"
- "Run withdrawn"
- "Your delivery run opens in 15 minutes"

Tapping a notification opens that run.

### 5.8 Shared states (one example of each)
- Loading skeletons, matching each list.
- Error with Retry.
- "No longer yours" (reassigned): a short message and Back to Today.
- "Not open yet - opens at…" on any action.
- A validation message from the server, shown inline.
- A refusal sheet for an offline write that the server refused.

## 6. Not in this app (do not design)

Map tab or in-app map · activity feed · earnings, pay, tips or any currency · accepting or declining
jobs · ratings · chat · ETA and distance (the platform has no routing data) · shift timers and stats
dashboards · sign-up or passwords · shop names at the customer's door · the words "same-day" and
"standard".

## 7. Deliverable

- Every screen in §5, in **light and dark**, on an iPhone 15 frame and an Android (Pixel 8) frame.
  The two only need to differ where the platforms differ: back navigation, sheets, the status bar.
- The states listed for each screen.
- A small component sheet:
  - buttons (primary, secondary, destructive);
  - swipe-to-confirm;
  - status chips;
  - the stop/drop hero;
  - list rows (shop, drop, package);
  - banners (offline, pending, refused, live-paused);
  - bottom sheet;
  - the bottom tab bar, plus the tablet navigation rail.
- Flow arrows for:
  - sign in → Today;
  - collection: Today → stop → collect → hub check-in;
  - delivery: Today → drop → Deliver → proof → Next;
  - Can't deliver → return to hub.

## 8. Short version (if a one-paragraph prompt is needed)

Design a simple iOS + Android app for Effy's salaried delivery drivers, with three tabs: Today,
History, Account. A driver signs in with a work email and a 6-digit code and goes on duty. Today
shows the current round:
- a **collection run** - visit shops, tick packages, swipe to confirm, check in at the hub, which
  splits parcels into Effy windows and Courier;
- or a **delivery run** - Navigate, **Deliver**, choose proof (photo, signature, or left safely with
  a photo), done → next drop; or **Can't deliver** with a reason, then return the parcel to the hub.

Every screen has an offline state ("saved on this phone, sending later"). There is no map tab, no
money, no ETA, no accept/decline. Style: flat, bordered (never shadowed), Geist type, cobalt
`#1d4ed8` (dark `#60a5fa`) as the only action colour, near-black `#151515` dark mode, 48dp+ targets,
primary actions at the bottom within thumb reach.
