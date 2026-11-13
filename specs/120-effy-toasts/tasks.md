---
description: "Tasks for 120 - Effy's own toasts"
---

# Tasks: Effy's Own Toasts

**Input**: `specs/120-effy-toasts/` - spec.md, plan.md, research.md (R1-R9), data-model.md, contracts/, quickstart.md
**Tests**: REQUIRED - spec FR-033 requires the behaviour rules (FR-007-FR-012, FR-016, FR-018-FR-023) to be held by
automated tests, and contracts/toast-api.md lists nine guarantees, each a test.
**Rule for every task**: build it from the design in research.md, not from any outside toast product's source (spec
FR-002). Words shown to people are copied unchanged from the call sites (FR-003).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1-US5 from spec.md

---

## Phase 1: Setup

**Purpose**: the new subpath, its test runner and its stylesheet entry, before any code.

- [X] T001 Add exports `"./toast": "./src/toast/index.ts"` and `"./toast.css": "./src/toast.css"` to `packages/design-system/package.json`; add devDependencies `vitest` `^3.0.0`, `jsdom` `^25.0.1`, `@testing-library/react` (the version web-kit uses) and `esbuild` (the version the repo already resolves); add script `"test:unit": "vitest run"` and append `&& vitest run && node scripts/check-toast-size.mjs` to `"test"`. Do NOT remove `sonner` yet (T024)
- [X] T002 [P] Create `packages/design-system/vitest.config.ts` (environment `jsdom`, include `src/**/*.test.{ts,tsx}`), mirroring `packages/web-kit`'s config
- [X] T003 [P] Create empty module files with a one-line header comment each: `packages/design-system/src/toast/{index.ts,store.ts,spring.ts,motion.ts,sound.ts,announce.ts,marks.tsx,Toaster.tsx}` and `packages/design-system/src/toast.css`
- [X] T004 Run `pnpm install` at the repo root and confirm `pnpm --filter @effy/design-system exec vitest run --passWithNoTests` succeeds

---

## Phase 2: Foundational - the toast itself (blocks every story)

**Purpose**: the whole toast, tested, with no app using it yet, then the consoles switched to it through `ui`.
Design references: research R2 (motion), R3 (rules), R4 (sound), R5 (reading), R6 (look), data-model.md, contracts/.

### Tests first (write them failing)

- [X] T005 [P] Write `packages/design-system/src/toast/store.test.ts` with an injected fake clock, one test per guarantee 1-5 in `contracts/toast-api.md` plus: owner update applies in place; stale caller's success is dropped; stale caller's failure takes over (spec FR-008 as amended); a lesser message behind a failure waits, a later one replaces it (newest only), and it is shown with its full life when the failure closes; a warning also waits behind a failure; two failures - the newer takes over; `id` option makes repeated calls one caller; `toast.promise` resolves to success, rejects to failure and returns the same promise; `duration` overrides (0 = sticky); a toast with `action` is sticky; a button's `onClick` returning a patch changes the toast in place and removes its buttons unless the patch names them; `dismiss()` with no argument clears visible and waiting
- [X] T006 [P] Write `packages/design-system/src/toast/spring.test.ts`: a spring settles at its target; retargeting mid-flight keeps velocity (no restart from 0); result is the same at 30 fps and 120 fps within 0.5 px (fixed 1/240 s sub-step); the shared frame loop stops when nothing moves
- [X] T007 [P] Write `packages/design-system/src/toast/sound.test.ts` with a fake `AudioContext`: each kind's cue schedules its notes; `loading` and progress-only changes play nothing; policy `off` and `never` play nothing; `opt-in` plays only with `sound: true`; `never` ignores `sound: true`; a missing `AudioContext`, a `suspended` context and a throwing `createOscillator` never throw; `new-order` schedules exactly the old chime (880 Hz then 1318.5 Hz sine, 0.18 s apart, gain 0.0001 → 0.25 → 0.0001 over 0.02 s / 0.32 s, stop at +0.34 s); `subscribeAudio` reports the context's state changes
- [X] T008 [P] Write `packages/design-system/src/toast/announce.test.ts`: success/info/warning/loading go to the polite text, failure to the assertive text; text is `title` or `title. description`; identical text twice is announced twice (cleared, then written on the next frame); a progress-only change writes nothing
- [X] T009 [P] Write `packages/design-system/src/toast/Toaster.test.tsx` (React Testing Library, jsdom, `matchMedia` stubbed): renders two live regions with `role="status"`/`role="alert"` and explicit `aria-live` even with no toast; one toast at a time in the DOM; pointer enter pauses and leave resumes (fake timers); Alt+T (`code: "KeyT"`, `altKey`) focuses the toast and Escape closes it and restores the previous focus; buttons have `tabIndex -1` until the toast is open; close button only on sticky toasts; with `prefers-reduced-motion: reduce` no frame loop is requested; a second mounted `Toaster` renders nothing and logs an error

### Core implementation

- [X] T010 Implement `packages/design-system/src/toast/store.ts`: `createToaster({ now, setTimer, clearTimer })` holding `{ visible, waiting, callers, position, sound, liveText }` per data-model.md; ranks, show/update/dismiss/pause/resume transitions exactly as data-model.md "Transitions"; lives per the Kind table; `subscribe`/`getState` for React; and a module singleton `toast` (callable as `toast(title, opts)` = info, plus `.info/.success/.error/.warning/.loading/.message/.promise/.update/.dismiss`) per contracts/toast-api.md. Make T005 pass
- [X] T011 [P] Implement `packages/design-system/src/toast/spring.ts`: a `Spring` (position, velocity, target, stiffness, damping, mass 1) stepped by semi-implicit Euler at a fixed 1/240 s sub-step, settled under 0.5 px and 0.5 px/s; `retarget(to)` keeps velocity; one shared `requestAnimationFrame` loop (`runFrame(task)`) that stops when every task reports it is at rest; the spring presets from research R2 (arrival 300/24, shape 360/30, shake 600/12, close 420/40). Make T006 pass
- [X] T012 [P] Implement `packages/design-system/src/toast/sound.ts` per contracts/sound-api.md and research R4: one lazily created `AudioContext`; `unlockAudio`, `unlockOnFirstGesture`, `subscribeAudio`, `audioReady`, `playCue`, `previewCue`; cues `success` (G5→D6 triangle, 12 ms attack, 220 ms decay), `error` (E4→C#4 triangle, 260 ms), `warning` (A4 twice, 140 ms apart, 120 ms), `info` (C6 sine, 180 ms), `new-order` (the existing chime copied from `apps/shop-web/src/lib/chime.ts`, unchanged); a 2.4 kHz low-pass and master gain 0.3 for the four toast cues; everything inside `try`; `cueFor(kind, policy, askedFor)` deciding whether a toast plays. Make T007 pass
- [X] T013 [P] Implement `packages/design-system/src/toast/announce.ts`: pure function from (previous live text, change) to next live text, with the clear-then-write repeat rule; used by the store to fill `liveText`. Make T008 pass
- [X] T014 [P] Implement `packages/design-system/src/toast/marks.tsx`: Effy's own 24×24 stroke marks - tick (success), cross (failure), exclamation (warning), "i" (information) - each path with `pathLength={1}` so toast.css can draw it in, and the in-progress ring (a 3/4 arc); `aria-hidden`; colours come from CSS (`currentColor`)
- [X] T015 Implement `packages/design-system/src/toast/motion.ts`: `bindMotion(element, getToast, subscribe)` returning a cleanup. Content is laid out once; a `ResizeObserver` on the content measures its size; springs for width, height and arrival offset write `--tw`, `--th`, `--ty` on the surface, which toast.css turns into `clip-path: inset(... round var(--radius-lg))` and `translate`; content opacity and blur follow the width's progress past the mark; retarget on every resize (keeps velocity); gestures as impulses - failure: sideways kick on the shake spring; warning: upward kick; success: add a class for the CSS pulse; in-progress ring: Web Animations infinite spin, eased to its next full turn when the kind changes; a change of words rolls the old text up/out and the new in (Web Animations, 260 ms), at most once per 400 ms; closing: width to the mark then sink and fade; at rest remove every transform; with reduced motion (read live from `matchMedia`) set targets directly and use a 150 ms fade in / 120 ms fade out only (research R2)
- [X] T016 Implement `packages/design-system/src/toast/Toaster.tsx`: `<Toaster position sound nonce?>` subscribing with `useSyncExternalStore`; renders the viewport (`data-tour-above`, `data-position`), the two lasting live regions with `role` and explicit `aria-live` (research R5), and the visible toast: surface, mark (or `image`), title, `×n` count, `meta`, description, progress bar, up to two buttons and a close button on sticky toasts; binds `motion.ts`; pointer enter/leave and focus within pause/resume; Alt+T (by `event.code`) focuses the toast remembering the previous focus, Escape closes and restores it; swipe away (pointer drag past 48 px toward the edge or 80 px sideways, or a flick; never started on a button) closes it; buttons `tabIndex -1` until open; plays cues through `sound.ts` per the `sound` prop; one-Toaster check (second instance renders nothing, `console.error` in development). Make T009 pass
- [X] T017 Write `packages/design-system/src/toast.css` (tokens only, research R6): viewport fixed, `z-index: 60`, 16 px + `env(safe-area-inset-*)` from the edge, `bottom-right` and `bottom-center` (other four positions too); surface `--popover` / `--popover-foreground`, 1 px `--border`, `--shadow-lg`, radius `--radius-lg`, clip from `--tw`/`--th`, `translate` from `--ty`; content 14/20 `--font-sans`, description `--muted-foreground`; mark colours `--success`, `--destructive`, `--warning`, `--primary`; stroke draw-in keyframes; success pulse; progress bar in `--primary`; main button = `--primary-fill` + `--primary-foreground`, radius `--radius-md`, 32 px visual with a 44 px hit area; quieter button ghost (`--muted` on hover); close button 32/44; focus rings `--ring`; width between 44 px and `min(420px, 100vw - 32px)`; `@media (prefers-reduced-motion: reduce)` removes every animation but opacity. No gradients, no colour literal
- [X] T018 Implement `packages/design-system/src/toast/index.ts`: export `toast`, `Toaster`, the sound functions, and the types `ToastOptions`, `ToastPatch`, `ToastButton`, `Kind`, `SoundPolicy`, `Cue` (contracts/toast-api.md, contracts/sound-api.md). Nothing in `src/toast/` may import from `../ui`, radix, vaul, sonner or lucide
- [X] T019 [P] Create `packages/design-system/scripts/check-toast-size.mjs`: bundle `src/toast/index.ts` with esbuild (ESM, minify, `react`/`react-dom` external), gzip, print the size, fail above 6 KB (research R7)
- [X] T020 [P] Extend `packages/design-system/scripts/check-component-shape.mjs` to read `src/toast.css`: the surface uses `--radius-lg`, buttons use `--radius-md` (never a pill/full radius), surface ≥ its rows
- [X] T021 Run `pnpm --filter @effy/design-system test` - all guards, all unit tests and the size check pass

### Switch the consoles (both, through the shared barrel)

- [X] T022 Replace `packages/design-system/src/ui/sonner.tsx` by re-exporting from `../toast` in `packages/design-system/src/ui/index.ts` (`export { toast, Toaster } from "../toast"` and its types) and delete `src/ui/sonner.tsx`
- [X] T023 In `packages/design-system/src/console.css` delete the `[data-sonner-toast]` rules and add `@import "./toast.css";` beside `@import "./skeleton.css";`
- [X] T024 Remove `sonner` from `packages/design-system/package.json` dependencies and run `pnpm install`
- [X] T025 [P] In `apps/shop-web/src/features/today/NeedsYou.tsx` import `toast` from `@effy/design-system/ui` instead of `sonner`
- [X] T026 [P] Remove the sonner-only `icon` option from the one shop-web call that passes it (find with `grep -rn "icon:" apps/shop-web/src` near a `toast(` call; candidates `features/today/QuickActionsSheet.tsx`, `features/catalog/AvailabilityScreen.tsx`, `features/fulfillment/OrderListScreen.tsx`); words unchanged
- [X] T027 Run `pnpm --filter @effy/shop-web typecheck`, `pnpm --filter @effy/back-office typecheck` and both apps' tests (including `features/today/__tests__/quick-actions.test.tsx`, `features/fulfillment/__tests__/pack-bags.test.tsx`, `features/notifications/__tests__/inbox.test.tsx`, back-office `CreditPointsSheet.test.tsx`, `AssignSheet.test.tsx`); fix any test that relied on sonner's DOM, keeping its assertion about the words

**Checkpoint**: both consoles show Effy's toast (silent everywhere until US1/US2 set their policies).

---

## Phase 3: User Story 1 - A shop worker sees, and hears, what just happened (P1) 🎯 MVP

**Goal**: shop-web's toasts with the shop's Sound setting, and its new-order chime in the one sound set.
**Independent Test**: quickstart §3 steps 1-5 and 9 (Sound on and off, failure protected, ×2, reduced motion, dark).

- [X] T028 [US1] In `apps/shop-web/src/routes/__root.tsx` read `soundOn` from `consoleStore` (`useStore`) and render `<Toaster position="bottom-right" sound={soundOn ? "on" : "off"} />`
- [X] T029 [P] [US1] In `apps/shop-web/src/components/console/NewOrderAlert.tsx` replace `playChime()` with `playCue("new-order")` from `@effy/design-system/toast` (both calls); keep `REPEAT_MS`, snooze and every rule as is
- [X] T030 [P] [US1] In `apps/shop-web/src/components/console/SoundChip.tsx` import `unlockAudio` and `unlockOnFirstGesture` from `@effy/design-system/toast`, and in the same effect subscribe `subscribeAudio(setAudioReady)` so `consoleStore.audioReady` keeps working
- [X] T031 [P] [US1] In `apps/shop-web/src/features/notifications/NotificationSettings.tsx` replace `previewChime` with `() => previewCue("new-order")`
- [X] T032 [US1] Delete `apps/shop-web/src/lib/chime.ts`; keep `setAudioReady` in `apps/shop-web/src/lib/console-store.ts`; update the mock in `apps/shop-web/src/components/console/__tests__/new-order-alert.test.tsx` to mock `@effy/design-system/toast`'s `playCue` and assert it is called with `"new-order"`
- [X] T033 [US1] Add `apps/shop-web/src/components/console/__tests__/toaster-sound.test.tsx`: with the Sound setting on, a success toast calls `playCue("success")`; with it off, nothing
- [X] T034 [US1] Walk quickstart §3 steps 1-5 and 9 in `pnpm --filter @effy/shop-web dev`; tune the spring presets (`spring.ts`) and cue pitches (`sound.ts`) by eye and ear on a laptop and a phone-width window; record the final values in research.md R2/R4 - walked and signed off 2026-11-13; values kept as built (tones raised once, see FEATURE-HISTORY)

**Checkpoint**: US1 complete - shippable on its own (back-office already shows the silent toast).

---

## Phase 4: User Story 2 - Back-office, with sound only when scanning (P1)

**Goal**: back-office's toasts silent except the scan box.
**Independent Test**: quickstart §4.

- [X] T035 [US2] In `apps/back-office/src/routes/__root.tsx` render `<Toaster position="bottom-right" sound="opt-in" />`
- [X] T036 [US2] In `apps/back-office/src/components/shell/ScanBox.tsx` add `sound: true` to its three toasts ("No bag has that label.", "That label was removed from its order. Throw it away.", "Couldn't look that label up. Try again."), words unchanged; check `apps/back-office/src/features/delivery/` for any other toast that reports a scan and do the same (HubScreen's "Saved." is not a scan)
- [X] T037 [US2] Add `apps/back-office/src/components/shell/__tests__/scanbox-sound.test.tsx`: an unknown label raises a failure toast with `sound: true`; a settings save elsewhere raises one without it
- [X] T038 [US2] Walk quickstart §4

**Checkpoint**: US1 + US2 - both consoles complete.

---

## Phase 5: User Story 3 - Shoppers get the same toast, silently (P2)

**Goal**: customer-web uses Effy's toast; its own toast is gone; guest pages within budget.
**Independent Test**: quickstart §2 and §5 steps 1-2.

- [X] T039 [US3] Add `@import "@effy/design-system/toast.css";` to `apps/customer-web/app/globals.css` beside the skeleton import
- [X] T040 [US3] In `apps/customer-web/app/(shop)/_components/StorefrontChrome.tsx` replace `<ToastRegion />` with `<Toaster position="bottom-center" sound="never" />` from `@effy/design-system/toast`
- [X] T041 [P] [US3] Move `apps/customer-web/app/(shop)/_components/AddToCartControl.tsx` and `SaveControl.tsx` to `@effy/design-system/toast` per the migration table in contracts/toast-api.md (`toast(msg)` → `toast.success(msg)`, `tone: "error"` → `toast.error`, `action.run` → `action.onClick`); words unchanged
- [X] T042 [P] [US3] Same migration in `apps/customer-web/app/(shop)/cart/page.tsx` (four calls, including the Undo action)
- [X] T043 [P] [US3] Same migration in `apps/customer-web/components/notifications/InboxView.tsx` (three calls) and `NotificationSettingsForm.tsx` (two calls); update `InboxView.test.tsx` and `NotificationSettingsForm.test.tsx` to mock `@effy/design-system/toast` and read `action.onClick` instead of `action.run`
- [X] T044 [US3] Update the comment in `apps/customer-web/lib/saved-store.ts` that points at `toast-store.ts`; delete `apps/customer-web/lib/toast-store.ts`, `apps/customer-web/lib/toast-store.test.ts` and `apps/customer-web/app/(shop)/_components/ToastRegion.tsx`
- [X] T045 [US3] Run `pnpm --filter @effy/customer-web test`, `typecheck`, `depcruise`, `build` and `size`; record each guest page's size before (from `main`) and after in the 120 entry of FEATURE-HISTORY.md; if any page has less than 6 KB of room, switch the storefront to load the toast on demand following `components/overlays/lazy.ts` (research R7 fallback)
- [X] T046 [US3] Walk quickstart §5 steps 1-2

**Checkpoint**: one toast on all three web apps.

---

## Phase 6: User Story 4 - Everyone can read and act on a toast (P2)

**Goal**: the accessibility behaviour (built in Phase 2) proven in each app, including inside dialogs and tours.
**Independent Test**: quickstart §3 steps 6-8 and §5 step 3.

- [X] T047 [P] [US4] Add `packages/design-system/src/toast/Toaster.a11y.test.tsx`: a toast raised while a Radix `Dialog` (from `../ui`) is open is announced (its live region is not `aria-hidden`) and its button is clickable by pointer; the same words twice are announced twice; a progress-only update changes neither live region
- [X] T048 [P] [US4] Check `packages/web-kit/src/tour/TourProvider.tsx` keeps elements with `data-tour-above` bright and clickable (it does - the new-order banner relies on it), and pin that the drawn toast carries the mark (`packages/design-system/src/toast/Toaster.test.tsx`) - built 2026-11-13: the mark is on the toast itself, not the viewport, so the tour never cuts a hole where no toast is
- [X] T049 [US4] Confirm Alt+T is unused: `grep -rn "Alt+\|altKey" apps/shop-web/src apps/back-office/src apps/customer-web/app apps/customer-web/components packages/web-kit/src` shows no other Alt shortcut (MiniCart's `altKey` is a modifier check, not a shortcut)
- [X] T050 [US4] Walk quickstart §3 steps 6-8 and §5 step 3 with VoiceOver; fix and add a test for anything found

---

## Phase 7: User Story 5 - A new notification shows up while you are working (P3, phase 2)

**Goal**: an arrival toast in shop-web and in customer-web when signed in (contracts/inbox-arrivals.md).
**Independent Test**: quickstart §6.

- [X] T051 [P] [US5] Extract `openInboxItem(item, deps)` from `apps/shop-web/src/features/notifications/InboxList.tsx` into `apps/shop-web/src/features/notifications/openInboxItem.ts` (records the read, `markLocallyRead`, telemetry `notif_inbox_item_opened`, navigates to `shopPathFor(destination)`, or to `/notifications` with the item open when the list reads it in place); make `InboxList.tsx` call it, behaviour unchanged
- [X] T052 [P] [US5] Extract `openInboxItem(item, deps)` from `apps/customer-web/components/notifications/InboxView.tsx` into `apps/customer-web/components/notifications/openInboxItem.ts` the same way (marketing and message items open in the inbox's reader; otherwise `customerWebPathFor(destination)`); `InboxView.tsx` calls it, behaviour unchanged
- [X] T053 [P] [US5] Add `notif_arrival_shown { count, type? }` and `notif_arrival_opened { type? }` to `apps/shop-web/src/lib/telemetry.ts` and the customer equivalents to `apps/customer-web/lib/telemetry.ts` (type only; no title, no id)
- [X] T054 [US5] Write `apps/shop-web/src/features/notifications/__tests__/inbox-arrivals.test.tsx`: nothing on first read; one new unread item → one info toast with its title and "Open"; two → "2 new notifications" opening `/notifications`; `shop_new_order` never toasts; nothing while on `/notifications`; nothing when already on the item's destination; no timer is created
- [X] T055 [US5] Implement `apps/shop-web/src/features/notifications/useInboxArrivals.ts` per contracts/inbox-arrivals.md (trigger: the `useUnseenCount()` value rising; read `GET /shop/v1/notifications?limit=5` through `inbox-api.ts`; high-water mark; exclusions; `toast.info(...)`; telemetry) and call it from `apps/shop-web/src/features/notifications/NotificationBell.tsx`. Make T054 pass
- [X] T056 [US5] Write `apps/customer-web/components/notifications/useInboxArrivals.test.tsx` with the customer cases (no excluded type; inbox page `/account/notifications`)
- [X] T057 [US5] Implement `apps/customer-web/components/notifications/useInboxArrivals.ts` (trigger: the count `NotificationBell.tsx` re-reads rising; read `GET /api/notifications?limit=5`) and call it from `apps/customer-web/components/notifications/NotificationBell.tsx` (rendered only for signed-in customers). Make T056 pass
- [X] T058 [US5] Run `make live-guards` (no timer added) and walk quickstart §6

---

## Phase 8: Polish & cross-cutting

- [X] T059 Create `scripts/check-one-toast.sh` (fails on: `from "sonner"` or `from 'sonner'` anywhere under `apps/` and `packages/`; a `"sonner"` key in any `package.json`; any file named `toast-store*`; a `role="status"` region in `apps/*/` whose file name or component contains "Toast"); add a `toast-guard` target to `Makefile` beside `live-guards`, and a step running it to `.github/workflows/web.yml` beside `check-no-refresh-timers.sh`; prove it by breaking it once (re-add a sonner import) and restoring
- [X] T060 [P] Update the "toasts" mentions in `CLAUDE.md` (Design system section: "the toasts" restyled by console.css → Effy's own toast in `@effy/design-system/toast` + `toast.css`; overlays paragraph: sonner no longer exists) and `ARCHITECTURE.md` if it names sonner; update `apps/customer-web/scripts/dependency-cruiser.first-load.cjs`'s comment (sonner gone; the toast is allowed on first load)
- [X] T061 [P] Add the 120 entry to `FEATURE-HISTORY.md` (what changed, the guest-page sizes from T045, the tuned spring and cue values from T034, operator steps: deploy the three web apps, no backend) and add `120-effy-toasts` to the feature list in `CLAUDE.md`
- [X] T062 Run the whole quickstart §1 and §2 from a clean install; every check passes

---

## Dependencies & execution order

- **Phase 1 → Phase 2** (T001-T004 before anything).
- **Phase 2** blocks every story. Inside it: T005-T009 (tests) before T010-T016; T011-T014 in parallel; T015 after T011; T016 after T010-T015; T017-T020 in parallel with T015-T016; T021 after all; T022-T027 after T021.
- **US1 (Phase 3)** and **US2 (Phase 4)** depend only on Phase 2 and can run in parallel.
- **US3 (Phase 5)** depends only on Phase 2 (T017-T018); independent of US1/US2.
- **US4 (Phase 6)** after Phase 2; its walks are best after US1-US3 so every app is covered.
- **US5 (Phase 7)** after Phase 2; shop half after US1 (sound policy), customer half after US3 (the storefront Toaster).
- **Polish (Phase 8)** last; T059 needs US3 done (toast-store gone) or it fails.

## Parallel examples

- Phase 2 tests: T005, T006, T007, T008, T009 together.
- Phase 2 core: T011, T012, T013, T014 together; then T017, T019, T020 beside T015/T016.
- US1: T029, T030, T031 together.
- US3: T041, T042, T043 together.
- US5: T051, T052, T053 together.

## Implementation strategy

1. **MVP** = Phases 1-3: Effy's toast in both consoles, with sound in the shop console. Ship and walk.
2. Add US2 (one prop, one option) - consoles complete; sonner is already gone (T024).
3. Add US3 - one toast platform-wide; measure the storefront budget.
4. US4 - prove accessibility everywhere.
5. US5 - arrivals.
6. Polish - guard, docs, history.
