# Effy Driver App — Design Brief for Claude Design

> **Purpose of this document.** This is a complete prompt/brief to hand to **Claude Design** to
> generate the FULL visual design (all screens, all states) of the **Effy Driver** mobile app. It
> defines the product, the audience, the theme/design system, every feature and screen, and the
> states each screen must cover. Copy this whole document in as the design prompt.

---

## 1. What to design (one sentence)

Design a **native-feeling mobile app for delivery drivers** who are **employees** of Effy — a
single-brand grocery + e-commerce delivery platform — that lets a driver sign in, go on/off duty,
see the deliveries assigned to them, navigate to pick up packages from fulfillment shops, verify and
collect items, navigate to the customer, and complete the delivery with proof (photo / code /
signature / contactless). **This is a delivery-operations app only** — no marketplace, no earnings
dashboards, no tips, no accept/reject bidding. It is a work tool for a salaried courier.

Design for **both iOS and Android**, feeling native on each (iOS Human Interface Guidelines and
Android Material). Phone-first, portrait. Assume the driver is one-handed, moving, often outdoors in
bright light, wearing gloves — **large fat-finger touch targets (min 48dp), high contrast, minimal
taps to advance a delivery** are requirements, not polish.

---

## 2. Who the driver is (context that shapes every screen)

- **An Effy employee**, not a gig worker. There is **no sign-up, no password** — accounts are created
  by back-office staff. The driver signs in with their work email and a **6-digit one-time code**.
- They do **not** choose which deliveries to take. Work is **assigned** to them. So there is **no
  "accept/decline offer with earnings preview"** screen — that whole gig-economy pattern is removed.
- They do **not** see money in this app. **No earnings, no tips, no pay breakdown, no cash-out.** At
  most a light "today's activity" count (deliveries done, stops remaining) — never currency.
- They collect orders from **Effy's own fulfillment shops** (internal dark-store-like nodes). Drivers
  physically go to these shops, so they **do** see shop names and addresses here — this is internal,
  not customer-facing.
- A single customer order can be **split across multiple shops**, so one delivery may require
  **collecting from 2+ shops before the single drop to the customer**. The design must handle
  multi-stop pickup gracefully.
- The primary jobs to be done, in priority order: **(1) what do I deliver next and where, (2) get me
  there, (3) let me mark each step done fast and prove it.**

**Reference apps for interaction patterns** (adapt, don't copy): Uber Driver, Bolt Driver, foodpanda
rider, DoorDash Dasher (task flow, map-first home, status-advance swipe), and last-mile courier apps
like Onfleet / Track-POD (proof-of-delivery). Effy's own product references are **Uber Eats + eBay**.

---

## 3. Theme & design system (MANDATORY — this is Effy's locked visual identity)

Effy has a **strict, monochrome design system**. Follow it exactly — do not introduce brand colors.

### 3.1 Color — monochrome, no brand hue
- **There is NO brand hue.** The entire UI is built on a **neutral grayscale ramp** from near-black
  `#0a0a0a` through to `#ffffff`. Every accent, button, active state, and emphasis is a **neutral**
  tone, not a color.
- **The accent INVERTS between light and dark mode.** In light mode the primary accent is
  **near-black** with a near-white label; in dark mode it is **near-white** with a near-black label.
  (A single color can't do this — that's why the accent is neutral.)
- **Exactly TWO semantic colors exist**, and only these two:
  - **Error / destructive:** `#e01010` (red).
  - **Success indicator:** `#0C9409` (green) — used as a **non-text status indicator only** (a dot,
    a check, a bar), never as body text or a large fill.
- **No third color anywhere.** No blue, no orange, no yellow "warning." Warnings and emphasis are
  expressed by **weight, size, and neutral tone**, not hue. (Map pins and route lines should also be
  monochrome/neutral — dark on light, light on dark — with the two semantic colors reserved for
  error/success states only.)

### 3.2 Typography
- Typeface: **General Sans** across the whole app (headings and body). Use its weights for hierarchy.
- Prioritize **legibility at a glance while moving** — generous sizes for the primary action and the
  next address; secondary metadata smaller and lower-contrast (but still AA-legible).

### 3.3 Appearance / dark mode
- **Dark mode is required**, and **user-selectable: Light / Dark / Follow-System** (default
  Follow-System). Design **every screen in both light and dark.** Dark mode is the default assumption
  for a driver working at night — make it excellent, not an afterthought.
- Maintain **WCAG AA contrast** for all text in both appearances.

### 3.4 Shape, spacing, motion
- Rounded corners on the tight radius scale (roughly **sm 6 / md 8 / lg 10 / xl 14 px**). Consistent
  spacing scale.
- **No card-soup / no metric cards.** Do **not** lay the app out as a wall of summary/metric cards,
  and no row of KPI cards at the top of a screen. Prefer **lists, detail rows, sectioned pages, and
  full-bleed maps.** A card is allowed only when it's genuinely the best pattern (e.g. the single
  active-delivery sheet over a map).
- **Micro-animations are required, not optional:** status-advance transitions, swipe-to-confirm,
  the pickup→dropoff handoff, pull-to-refresh, success checkmarks. They should feel native and quick.
- **Fat-finger targets:** primary actions are large, thumb-reachable at the bottom of the screen.

---

## 4. Information architecture (navigation)

A **bottom navigation** shell with a small number of tabs (native bottom bar on phone). Suggested:

1. **Deliveries** (home) — the assigned queue + the active delivery. The heart of the app.
2. **Map** — full-screen map of the route / all stops (may instead be a mode toggle on Deliveries).
3. **History** — completed deliveries + their proof records.
4. **Account** — driver identity, duty status, appearance, help, sign out.

A persistent **on-duty / off-duty** control should be reachable from the home screen (e.g. a header
toggle), since it gates whether new work is assigned.

---

## 5. Screens to design (the full set)

For **each** screen, design **both light and dark**, and include the **empty, loading, error, and
offline** states where noted. Group them by flow.

### 5.1 Onboarding & Auth (employee, passwordless)
1. **Splash / launch** — Effy driver mark on a neutral ground (brief).
2. **Sign in — enter email** — single email field, "Send code" primary button, note that accounts
   are provisioned by Effy (no "create account" link).
3. **Sign in — enter 6-digit code** — 6-box OTP input (large, auto-advancing), resend timer,
   "wrong email?" back link. States: entering, verifying, invalid code, expired code, too many
   attempts.
4. **Permissions priming** — friendly explanations before the OS prompts for **Location** (required,
   "always/while-using" rationale), **Notifications** (new assignments), and **Camera** (proof
   photos). One screen or a short sequence.

### 5.2 Duty & Home
5. **Off-duty / start-shift screen** — a clear "Go on duty" primary action, current status, and (if
   off duty) an empty, calm state. This is the employee analogue of "go online" — NOT a gig
   availability-for-offers toggle.
6. **Deliveries home (on duty, has work)** — the core screen. A **status-grouped list**:
   - **Active** (the one delivery in progress, shown prominently — this is where a single card/sheet
     over context is acceptable).
   - **Up next / assigned** (queue of upcoming deliveries).
   - Each row: order reference, **pickup shop(s)**, **customer suburb/short address**, item/package
     count, **same-day vs standard** badge and/or delivery window, distance/ETA, and a status pill.
   - Pull-to-refresh. A subtle "N stops remaining today" summary (count only, no money).
7. **Deliveries home — empty (on duty, no work)** — "You're all caught up / waiting for the next
   assignment," calm and reassuring.
8. **Deliveries home — offline / no connectivity** — clearly degraded, with cached last-known list.

### 5.3 The delivery lifecycle (the most important flow — design every step)
A single delivery moves through these statuses; design a screen/state for each transition:
`assigned → en route to pickup → at shop (verify & collect) → picked up → en route to customer →
arrived → delivered` (plus **failed / undeliverable**).

9. **Delivery detail — overview** — top-level view of one delivery: order ref, the **package
   manifest** (list of items + counts, for verification), **pickup shop(s)** with address and a
   collect action, **customer** name + full delivery address + **delivery instructions/notes**, a
   mini-map, and the current status with the **next primary action** as a big bottom button (or a
   **swipe-to-confirm** control).
10. **Multi-shop pickup** — when an order spans several shops: a **checklist of pickup stops**, each
    marked collected independently, before the dropoff unlocks. Show progress ("Collected 1 of 2
    shops").
11. **At pickup / verify items** — the item manifest as a **checkable list** ("I have all items"),
    a report-problem path (missing/short item), and a large **"Picked up / Collected"** confirm
    (swipe-to-confirm).
12. **En route to customer** — map-forward, customer address, ETA, **Navigate** (hands off to
    Google/Apple Maps), **Contact customer** (masked call / message), and delivery instructions
    pinned visibly.
13. **Arrived at customer** — prompt to complete delivery; surfaces the proof options.
14. **Proof of delivery** — design the picker plus each method:
    - **Photo** (camera capture of the drop, e.g. left at door) — capture + review + retake.
    - **Delivery code / OTP** (customer reads a code; driver enters it) — verification input + states.
    - **Signature** (draw on screen) — sign + clear + confirm.
    - **Contactless "leave at door"** with a note/photo.
    - Optional **note** field.
15. **Delivery complete — success** — a satisfying success state (checkmark micro-animation),
    summary, "Next delivery" CTA.
16. **Mark as failed / undeliverable** — reason picker (nobody home, wrong/incomplete address,
    customer refused, access blocked, other + note), with confirm. Design the confirm + resulting
    state.

### 5.4 Map
17. **Route / all-stops map** — full-screen map showing pickup shop pin(s) and the customer pin,
    the route line, current location, and a **bottom sheet** listing the ordered stops. Monochrome
    map styling in both light and dark. Tapping a stop opens its detail.

### 5.5 Notifications
18. **Push notification examples** (design the notification content/anatomy): new assignment,
    pickup ready at shop, reminder to complete, shift reminders.
19. **In-app notification center / activity feed** — chronological list; empty state included.

### 5.6 History
20. **History list** — completed deliveries grouped by day; each row shows order ref, customer
    suburb, time completed, and proof-captured indicator. Empty state included.
21. **History detail** — a completed delivery's record: timeline of status changes with timestamps,
    the captured **proof** (photo/signature/code), addresses, and item manifest. Read-only.

### 5.7 Account
22. **Account / profile** — driver name, photo/initials avatar, work email, assigned **delivery
    zone**, and **vehicle info** (type/plate) as **detail rows** (not cards).
23. **Appearance settings** — Light / Dark / Follow-System selector.
24. **Duty status** (if not on home) — on/off duty control + a light today summary (counts only).
25. **Help / support** — contact/support entry, app version.
26. **Sign out** — confirm dialog.

### 5.8 Cross-cutting states (design a representative example of each)
27. **Loading skeletons** — for the deliveries list and detail.
28. **Error state** — a failed load with retry.
29. **No-connectivity banner** — persistent thin banner when offline.
30. **Permission-denied recovery** — e.g. location off, with a path to settings.

---

## 6. Explicit non-goals (do NOT design these)
- **No earnings / pay / tips / cash-out / instant-pay** anywhere.
- **No accept/decline offer screen** with a countdown and pay preview (work is assigned).
- **No ratings-of-driver, gamification, streaks, or promotions.**
- **No customer-facing storefront, catalog, cart, or checkout** — this is the driver, not the shopper.
- **No colored branding** — monochrome only, per §3.

---

## 7. What the final design deliverable should include
- Every screen in §5, **in both light and dark mode.**
- The **key delivery lifecycle** (§5.3) shown as a connected flow, so the status-advance experience
  is legible end to end.
- A short **design-system reference frame** (the neutral ramp, the two semantic colors, General Sans
  type scale, button/list/pill/OTP-input components) so the system reads as one coherent thing.
- Realistic placeholder content (Australian addresses/suburbs — Effy operates in Melbourne;
  time zone Australia/Melbourne), never Lorem Ipsum, and **never real personal data**.

---

## 8. One-paragraph version (if you need a short prompt instead)

> Design a native iOS + Android **delivery driver app** for **Effy**, a single-brand grocery delivery
> platform. The driver is a **salaried employee** (passwordless email-OTP sign-in, no sign-up, no
> earnings/tips/offers). Core flow: go **on duty** → see **assigned deliveries** in a status-grouped
> list → open a delivery → **collect packages from one or more fulfillment shops** (verify item
> manifest) → **navigate to the customer** (map + hand-off, masked contact, delivery notes) →
> **complete with proof** (photo / delivery code / signature / contactless) → success, or mark
> **failed** with a reason. Plus a **route map**, **push + in-app notifications**, **history with
> proof records**, and an **account** screen. Use Effy's **strict monochrome design system**: a
> neutral grayscale ramp (`#0a0a0a`…`#ffffff`) as the only accent — which **inverts** between light
> and dark — with exactly two semantic colors, **error `#e01010`** and **success `#0C9409`**
> (success is a non-text indicator only) and **no other hue**; typeface **General Sans**; **dark mode
> required and user-selectable (Light/Dark/Follow-System)**; big fat-finger touch targets, native
> feel, micro-animations; **no card-soup, no metric cards** (prefer lists, detail rows, full-bleed
> maps). Design every screen in **both light and dark**, with empty/loading/error/offline states.

---

### Appendix — feature checklist (for your own tracking)

**Auth:** email entry · 6-digit OTP · resend/expiry/error states · permission priming (location,
notifications, camera).
**Duty:** go on/off duty · today activity summary (counts only).
**Deliveries:** status-grouped queue · active vs up-next · pull-to-refresh · empty/offline states.
**Lifecycle:** assigned → en route to pickup → at shop (verify & collect) → picked up → en route to
customer → arrived → delivered; plus failed/undeliverable with reasons.
**Pickup:** package manifest checklist · multi-shop pickup checklist · report missing item.
**Dropoff:** map · navigate hand-off · masked contact (call/message) · delivery instructions.
**Proof of delivery:** photo · delivery code/OTP · signature · contactless leave-at-door · note.
**Map:** full-route map · stop pins · bottom-sheet stop list · monochrome styling both modes.
**Notifications:** push (new assignment, pickup ready, reminders) · in-app notification center.
**History:** completed list by day · detail with status timeline + captured proof.
**Account:** identity · zone · vehicle · appearance (L/D/System) · help · sign out.
**States:** loading skeletons · error+retry · offline banner · permission-denied recovery.
