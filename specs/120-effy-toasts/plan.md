# Implementation Plan: Effy's Own Toasts

**Branch**: `120-effy-toasts` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/120-effy-toasts/spec.md`

## Summary

One toast of Effy's own, built from scratch, for shop-web, back-office and customer-web, replacing sonner (consoles) and
customer-web's `toast-store`. It lives in the design system as a dependency-free subpath, `@effy/design-system/toast`:
a framework-free core (the one-at-a-time rules, the spring motion, the sound set, the screen-reader announcer) and a
thin React `Toaster`. The content is laid out once and revealed by a spring-driven clip, so motion never reflows the page.
Sound is one Effy sound set made in the browser, with a policy per app (shop: its Sound setting; back-office: scanning
only; storefront: never); the shop's new-order chime moves into it unchanged. Phase 2 adds a toast when a new item
arrives in the shop or customer inbox, reusing the inbox's own reads. No backend, database or infrastructure change.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19 (all three web apps)
**Primary Dependencies**: none new at runtime. Web Audio, Web Animations, `requestAnimationFrame`, `matchMedia`,
`ResizeObserver` (browser APIs). Removes `sonner`.
**Storage**: N/A (reads the existing shop Sound setting only)
**Testing**: Vitest + jsdom added to `@effy/design-system` (same versions as web-kit: vitest ^3, jsdom ^25); the apps'
existing Vitest suites; the design-system node guards; a new shell guard.
**Target Platform**: evergreen browsers (desktop and mobile Safari, Chrome, Firefox, Edge)
**Project Type**: shared web UI package + three web apps
**Performance Goals**: toast visible within 100 ms of the result (SC-003); motion on the compositor-friendly path (clip
and opacity, no layout per frame); the frame loop stops when nothing moves
**Constraints**: storefront guest first-load budget 174 KB gz (toast ≤ 6 KB gz, checked); no radix/vaul/sonner on guest
routes; tokens only; WCAG AA; reduced motion
**Scale/Scope**: about 81 messages in 40 files across the three apps; 5 kinds; 5 cues; 2 arrival hooks

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design: still passes.*

| Principle | Check | Result |
|---|---|---|
| I. Spec-driven | spec.md (120), this plan, tasks to follow; spec FR-008 amended during planning (a late failure still shows) | Pass |
| II. Shared contracts | one toast in `@effy/design-system`, used by all three apps; one sound set replaces `shop-web/lib/chime.ts`; one stylesheet `toast.css` (like `skeleton.css`) | Pass |
| III. One serverless backend | no backend change, no route, no gateway change (both gateways untouched) | Pass |
| IV. Auth isolation | arrivals read each audience's own inbox route through its own client | Pass |
| V. Design | tokens only (`--popover`, `--border`, `--success`, `--destructive`, `--warning`, `--primary`, `--primary-fill`), radius `lg` 8 px, Geist, shadow only because it is a floating layer, no gradients, AA; reduced motion; 44 px targets; micro-animation is a requirement here. Not a card layout | Pass |
| VI. Architecture | framework-free core (rules, physics, sound) beneath a thin React edge; the toaster is a module singleton wired explicitly; no DI; no server data cached by the toast (arrivals read through the existing query/fetch) | Pass |
| VII. Telemetry | phase 2: `notif_arrival_shown { count, type }`, `notif_arrival_opened { type }` in each app's typed taxonomy; no PII; toasts themselves add no events (they report events other features already track). No metrics or alarms (client-only) | Pass |
| Technology standards | React 19 + TS, TanStack Store for the shop Sound setting (existing), no new library; removing sonner swaps no locked technology | Pass |
| Quality gates | new guards: `check-toast-size.mjs`, `scripts/check-one-toast.sh`; `check-component-shape.mjs` learns the toast | Pass |

No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/120-effy-toasts/
├── spec.md
├── plan.md               # this file
├── research.md           # R1-R9: every design decision
├── data-model.md         # in-memory shapes and transitions
├── quickstart.md         # checks and walks
├── contracts/
│   ├── toast-api.md      # the one toast API + migration table
│   ├── sound-api.md      # the one sound set
│   └── inbox-arrivals.md # phase 2
└── checklists/requirements.md
```

### Source Code

```text
packages/design-system/
├── package.json                    # + "./toast", "./toast.css"; - sonner; + vitest, jsdom (dev)
├── vitest.config.ts                # new
├── scripts/
│   ├── check-toast-size.mjs        # new: esbuild-bundles toast/index.ts, fails > 6 KB gz
│   └── check-component-shape.mjs   # + the toast surface and buttons
└── src/
    ├── console.css                 # - [data-sonner-toast] rules; + @import "./toast.css"
    ├── toast.css                   # new: the look (tokens only)
    ├── ui/index.ts                 # re-exports toast + Toaster from ../toast
    ├── ui/sonner.tsx               # DELETED
    └── toast/
        ├── index.ts                # public API (toast, Toaster, sound functions, types)
        ├── store.ts  (+ .test.ts)  # rules FR-007-FR-012 over an injected clock
        ├── spring.ts (+ .test.ts)  # spring stepping + the one frame loop
        ├── motion.ts               # binds springs to one toast's element (clip, offset, gestures, text roll)
        ├── sound.ts  (+ .test.ts)  # the Effy sound set, unlock, ready state, policy
        ├── announce.ts (+ .test.ts)# the two live regions' text
        ├── marks.tsx               # Effy's four marks + the in-progress ring
        └── Toaster.tsx (+ .test.tsx) # viewport, toast, buttons, hover/focus pause, Alt+T, Escape, swipe

apps/shop-web/src/
├── routes/__root.tsx               # <Toaster sound={soundOn ? "on" : "off"} />
├── lib/chime.ts                    # DELETED (moved to sound.ts)
├── lib/console-store.ts            # audioReady fed by subscribeAudio
├── components/console/{SoundChip,NewOrderAlert}.tsx   # sound functions from the toast package
├── features/notifications/NotificationSettings.tsx     # previewCue("new-order")
├── features/today/NeedsYou.tsx     # import from @effy/design-system/ui, not sonner
├── features/{today,catalog,fulfillment}/…              # one `icon` option removed; otherwise unchanged
└── features/notifications/{useInboxArrivals.ts, openInboxItem.ts, InboxList.tsx, NotificationBell.tsx}  # phase 2

apps/back-office/src/
├── routes/__root.tsx               # <Toaster sound="opt-in" />
└── components/shell/ScanBox.tsx    # sound: true on its three toasts

apps/customer-web/
├── app/globals.css                 # @import "@effy/design-system/toast.css"
├── app/(shop)/_components/StorefrontChrome.tsx  # <Toaster position="bottom-center" sound="never" />
├── app/(shop)/_components/ToastRegion.tsx       # DELETED
├── lib/toast-store.ts (+ .test.ts)              # DELETED
├── app/(shop)/{_components/AddToCartControl,_components/SaveControl,cart/page}.tsx, lib/saved-store.ts,
│   components/notifications/{InboxView,NotificationSettingsForm}.tsx (+ tests)   # the new API
└── components/notifications/{useInboxArrivals.ts, openInboxItem.ts, NotificationBell.tsx}  # phase 2

scripts/check-one-toast.sh           # new; Makefile `toast-guard`, .github/workflows/web.yml
```

**Structure Decision**: the toast is a primitive of the design system, beside `ui/`, in its own dependency-free subpath
so the storefront's guest pages can load it (research R1). Each app only mounts it, sets its sound policy, and (phase 2)
adds an arrival hook beside its existing bell.

## Phasing

1. **Core** - store, springs, sound, announcer, marks, Toaster, toast.css, tests, size check. Nothing uses it yet.
2. **Consoles** - `ui/index.ts` re-export; shop-web and back-office mount it with their sound policy; chime moved;
   sonner removed from the package; `console.css` cleaned; guard added. (US1, US2, US4)
3. **Storefront** - customer-web moves to it; its own toast deleted; budget measured. (US3)
4. **Arrivals** - phase 2 hooks and `openInboxItem` extraction in shop-web and customer-web. (US5)

Each phase is independently shippable: after 2 the consoles have the new toast while the storefront keeps its own.

## Risks

- **Motion quality is a judgement**: the spring values in R2 are starting points; the walk (quickstart §3) tunes them on
  a laptop and a phone before sign-off.
- **Tones are a judgement**: same (R4).
- **Radix modal + toast**: verified that live regions survive Radix's hiding; buttons in a toast are pointer-reachable
  over a dialog but keyboard-reachable only after it closes (R5) - accepted.
- **One at a time** changes the storefront slightly (today it can stack); acceptable per the spec's assumptions.

## Complexity Tracking

None.
