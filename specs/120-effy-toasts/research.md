# Research: Effy's Own Toasts (120)

Every decision below is ours. Outside toast products (sonner, which the consoles use today, and Ding, which the operator
pointed at) were read to learn **what** makes a toast feel good. Nothing is copied from either; where we chose the same
convention (for example the Alt+T shortcut), the reason is given.

## R1 - Where the toast lives: a subpath of the design system, with no dependencies

- **Decision**: `@effy/design-system/toast` (new export) holds the whole toast: a framework-free core (`store.ts`,
  `spring.ts`, `sound.ts`, `announce.ts`) and a React layer (`Toaster.tsx`). It imports nothing outside React and the
  package's own CSS. `@effy/design-system/ui` re-exports `toast` and `Toaster` from it, so the 27 console imports from
  `ui` keep working unchanged.
- **Rationale**: the storefront's guest pages may not reach radix, vaul or sonner (`dependency-cruiser.first-load.cjs`),
  and `ui/index.ts` re-exports radix-based primitives. A separate subpath lets customer-web import the toast without the
  barrel. One toast for three apps is Principle II (shared package, no copy per surface).
- **Alternatives**: `@effy/web-kit/toast` - rejected: web-kit is console-side (tours, tables, product form) and pulls
  TanStack; the toast is a primitive like a button. A new `@effy/toast` package - rejected: a ninth package for one
  component, and its CSS must read `tokens.css`, which lives here.

## R2 - Motion: lay out once, reveal by clipping, drive with springs

- **Decision**: the toast's content is laid out **once, at its final size**. A separate **surface** layer (background,
  hairline border, shadow) is what changes shape: its visible box is a `clip-path: inset(... round var(--radius-lg))`
  driven by three springs - **width**, **height** and **arrival offset** - written as CSS custom properties from one
  shared `requestAnimationFrame` loop. Content fades and un-blurs as the surface's width passes it.
  - **Arrival**: the surface starts as the mark's own square (44×44), travels in from below the edge with a slight
    overshoot, then the width spring opens it to the message.
  - **Change**: when the words change, the content is re-measured and the springs are **retargeted, keeping their
    velocity**, so a change mid-opening flows instead of restarting. The old words move up and fade; the new words come
    up from below (Web Animations, 260 ms).
  - **Close**: width closes back to the mark, then the mark sinks out with a fade.
  - **Gestures** (FR-015) are spring impulses on the same loop: failure = a sideways kick on an under-damped spring
    (one shake that settles); warning = an upward kick (a hop); success = the mark scales 1 → 1.12 → 1 (CSS keyframes);
    in progress = the ring spins (Web Animations, infinite) and, on becoming a result, is eased to its nearest full turn
    before the result's mark draws in.
- **Physics**: a mass-spring-damper stepped with **semi-implicit Euler at a fixed 1/240 s sub-step** (stable for the
  stiffness range we use, frame-rate independent). Settled when |velocity| and |offset| are both under 0.5 px. When no
  toast is moving the loop stops; at rest the toast carries **no transform** (so text is never resampled - FR-017).
- **Spring settings** (tuned in the quickstart walk, starting values): arrival `k 300, c 24`; shape `k 360, c 30`;
  shake `k 600, c 12`; close `k 420, c 40` (no overshoot).
- **Reduced motion** (FR-016): the loop is never started; every spring jumps to its target; the toast fades in 150 ms and
  out 120 ms; no shake, hop, pulse, spin or text roll. Read live from `matchMedia`, so changing the setting applies to
  the next toast.
- **Rationale**: clipping animates **paint, not layout** - the page under the toast never reflows during an animation,
  and the content never re-wraps mid-flight, which is what makes text jitter. Springs that keep velocity are what make a
  message change feel physical rather than "replay the entrance".
- **Alternatives**: animating `width`/`height` each frame - rejected: a layout per frame and re-wrapping text. CSS
  transitions with a spring sampled into a `linear()` easing - rejected as the driver: a transition restarts from zero
  velocity when retargeted. FLIP with `transform: scale` - rejected: it stretches the border radius and the text.

## R3 - One toast at a time: the rules are a small state machine, tested without a browser

- **Decision**: `createToaster()` (`store.ts`) holds `{ visible, waiting, owners }` and implements FR-007-FR-012 as
  pure transitions over an injected clock (`now()`, `setTimer`, `clearTimer`), so every rule is a unit test with fake
  time. The React layer only renders `visible` and forwards hover, focus and button presses.
  - **Rank**: failure 3 · warning 2 · success / information / in progress 1.
  - **A new message** (from a caller who does not own the visible toast): no toast → show it. Visible is a failure and
    the new message ranks below 3 → it becomes `waiting` (newest only; a later lesser message replaces an earlier
    waiting one). Otherwise → it takes over the visible toast in place and its caller becomes the owner.
  - **The owner's update** (a promise settling, a button returning a new message) always applies in place.
  - **A stale caller's update** (it lost the toast to someone newer): a **failure** is treated as a new message (so it
    takes over, or replaces a waiting one); anything else is dropped (spec FR-008 as amended).
  - **Repeat** (FR-009): same kind, title and second line, no buttons → `count + 1`, countdown restarted.
  - **Closing the visible toast** shows `waiting`, if any, with its full time.
  - **Life**: 5 000 ms for success, warning and information without buttons; sticky for failure, in progress and any
    toast with a button, unless the caller sets `duration`. Pause on pointer-over or focus-within the viewport; resume
    with what was left.
- **Rationale**: the rules are the part that can hide a failure; they must be provable without rendering.

## R4 - Sound: one Effy sound set, made in the browser, with three policies

- **Decision**: `sound.ts` owns the platform's **one** `AudioContext`, its unlock (first pointer or key press), its
  ready state (`subscribeAudio`) and the cues:
  - `success` - two notes rising a fifth (G5 → D6), triangle wave, 12 ms attack, 220 ms decay.
  - `failure` - two notes falling a minor third (E4 → C#4), triangle, 260 ms decay.
  - `warning` - the same note twice (A4, 140 ms apart), 120 ms decay.
  - `info` - one note (C6), sine, 180 ms decay.
  - `new-order` - **the existing chime, unchanged** (880 Hz then 1318.5 Hz sine, 180 ms apart, the same gains): it is the
    sound shops already know, moved from `apps/shop-web/src/lib/chime.ts` (FR-019).
  Through a gentle low-pass (2.4 kHz) and a master gain of 0.3. Every cue is under 450 ms. Pitches are a starting point,
  tuned by ear on a laptop and a phone during the walk.
- **Policy per Toaster** (`sound` prop): `"on"` (every toast plays its kind's cue), `"off"` (nothing), `"opt-in"` (only
  toasts that pass `sound: true`; unused since 2026-11-13), `"never"` (nothing, and per-toast `sound` is ignored). shop-web: `on`/`off` from the
  existing Sound setting. back-office: `on` (operator 2026-11-13; first `opt-in`, scanning only). customer-web: `never` (FR-021).
  In progress and progress-only updates never play (FR-018). A blocked or missing audio context is a silent no-op inside
  `try` (FR-022).
- **Rationale**: two sound systems (the chime and toast cues) would be two sources for one fact. Tones are generated, so
  there is nothing to download or cache.
- **Alternatives**: recorded files - rejected by the spec. Sound on in back-office for everything - rejected by the spec
  (only scanning helps).

## R5 - Screen readers: two lasting live regions, kept outside dialogs' hiding

- **Decision**: the Toaster renders two visually hidden regions that never unmount: `role="status"` (polite) and
  `role="alert"` (assertive, failures only). A change writes `title. second line` into the right region; a repeat of the
  same words is re-announced by clearing the region and writing it on the next frame. Progress-only updates write
  nothing (FR-023). The toast itself is not a live region and never takes focus.
- **Inside a modal dialog**: Radix hides everything outside an open dialog from assistive technology, **except elements
  carrying `aria-live`** (verified in `aria-hidden` - `[aria-live]` elements are never hidden). Both regions carry
  explicit `aria-live`, so a toast raised from inside a dialog is still heard. The toast's buttons are reachable by
  pointer while a dialog is open (the viewport sets `pointer-events: auto` on the toast) and by keyboard once it closes.
- **Shortcut** (FR-013): **Alt+T** (`event.code === "KeyT"`, so it works on macOS where Alt+T types a character) moves
  focus into the toast and remembers where focus was; Escape closes the toast and returns focus. No console or storefront
  shortcut uses Alt (checked: the consoles use Mod+K, A, B, J, K, R and the arrows). It is also the shortcut sonner gives
  console users today, so nothing they have learned changes.
- Buttons have `tabIndex={-1}` until the toast has finished opening (FR-024); every button's hit area is 44 px tall.

## R6 - Appearance: tokens only, one stylesheet for three apps

- **Decision**: `packages/design-system/src/toast.css` (exported `./toast.css`), imported by `console.css` and by
  customer-web's global stylesheet, the same way `skeleton.css` is shared. Surface `--popover` / text
  `--popover-foreground`, hairline `--border`, `--shadow-lg` (a floating layer may have a shadow), corner
  `--radius-lg` (8 px - the dialog step), marks in `--success`, `--destructive`, `--warning`, `--primary` (in progress
  and information: the closed status mapping gives in-progress → brand), type `--font-sans` 14/20, second line
  `--muted-foreground`. Buttons: main = the `default` button look (`--primary-fill` with `--primary-foreground`), quieter
  = `ghost`; drawn by toast.css with the same tokens (the toast cannot import `ui/button`, which pulls radix's Slot).
  No gradients. The four marks are Effy's own SVG strokes (tick, cross, exclamation, i) drawn in on arrival.
- The old `[data-sonner-toast]` rules in `console.css` are deleted.
- `check-component-shape.mjs` gains the toast surface (floating layer at the `lg` step, buttons at `md`, never pills);
  `check-token-usage.mjs` already scans the package.
- **Positions** (FR-026): consoles `bottom-right`, storefront `bottom-center`; 16 px from the edges plus
  `env(safe-area-inset-*)`. Width fits the message, between 44 px and `min(420px, 100vw - 32px)`.
- **Layering** (FR-027): `z-index: 60` (overlays are 50) and the viewport carries `data-tour-above`, which the tour
  layer already keeps bright and clickable.

## R7 - The storefront budget

- **Decision (as built, 2026-11-13)**: the first load carries only the rules (`store.ts`), the announcer and the
  `Toaster` shell with its two live regions - **3.2 KB gzipped**, held at **≤ 4 KB** by `check-toast-size.mjs`
  (bundles `toast` + `Toaster` with esbuild the way the storefront ships them; `import()`ed code is not first load).
  The drawing code (`ToastView.tsx`: motion, springs, marks, buttons - 4.6 KB) is fetched when the page is idle, or
  at once when a toast arrives first; the sound set (0.9 KB) is fetched the first time a tone is wanted (`cue.ts`
  decides), so the storefront, which never plays sound, never downloads it. A toast raised before the view has
  loaded is still read out at once (the live regions are on first load) and drawn when it arrives.
- ⚠ **Why**: with everything on first load (6.1 KB) the storefront's search page measured **173.8 / 174 KB** -
  inside the budget with 0.2 KB to spare. The first plan's 6 KB estimate was close, but the room left was not.
- **Alternative**: keep it all on first load - rejected after measuring (above).

## R8 - Notifications arriving (phase 2): reuse the inbox's reads, no new route

- **Decision**: each app gets `useInboxArrivals()` beside its bell:
  - Its trigger is the bell's existing re-read of the unseen count (live kind `inbox`, and coming back to the tab) - no
    timer (FR-032).
  - When the count **rises**, it reads the inbox's first page (`limit=5`) through the route it already uses, and keeps
    items **newer than its high-water mark** (set to the newest item on first read, so nothing old is announced on page
    load), unread, and not of an excluded type.
  - **Excluded**: shop `shop_new_order` (the new-order banner owns it - FR-031).
  - **Skipped** when the person is on their inbox page, or already on the item's destination page.
  - One item → `toast.info(title, { action: { label: "Open", onClick: () => openInboxItem(item) } })`. Several →
    `toast.info("3 new notifications", { action: Open → the inbox })`.
  - `openInboxItem` is **extracted** from each app's inbox list (shop-web `InboxList.tsx`, customer-web `InboxView.tsx`)
    so the toast and the list open an item identically - records the read, sends the same telemetry, goes to the
    destination; an item the inbox reads in place (a message, an offer) goes to the inbox with that item open.
- **Rationale**: the inbox already knows how to read and open items; a second way would drift. No backend change, no
  new route (both gateways untouched).

## R9 - Migrating the 81 messages

- **Decision**: the API keeps the shapes call sites use today, so most sites change only their import (customer-web) or
  nothing (consoles, which import from `ui`): `toast(title, opts)` = information; `toast.success/error/warning/info/
  loading`; `toast.message` = information; `toast.promise`; `toast.dismiss(id?)`; options `description`, `action
  {label, onClick}`, `id`, `duration`. customer-web's `toast(message, { tone, action: { label, run } })` sites are
  rewritten to the same API (six files). sonner's `icon` option (one site) is removed - every kind has its own mark.
- **Guard**: `scripts/check-one-toast.sh` (a new Makefile target `toast-guard`, and `.github/workflows/web.yml`) fails `from "sonner"`, a `sonner` dependency in any
  `package.json`, `toast-store`, and any second `role="status"` toast region in the three web apps.
