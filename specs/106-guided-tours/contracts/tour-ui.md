# Contract: the tour UI pieces (shared by both consoles)

## `@effy/design-system/ui` - `tour.tsx` (presentational, no state of its own)

```tsx
<TourStepView
  open                       // boolean
  target={el | null}         // HTMLElement to outline; null = centred card (Dialog content)
  above={els}                // HTMLElement[]: cut out of the dim layer and left clickable (data-tour-above)
  side="bottom"              // preferred side; Radix flips and shifts on collision
  title="Awaiting pick"
  text="Paid orders nobody has started yet…"
  step={3} of={6}            // "Step 3 of 6"
  onBack={…} onNext={…} onClose={…}   // Back hidden on step 1; Next reads "Done" on the last step
/>
```

Its parts follow Dice UI's anatomy: `TourSpotlight`, `TourCard` (Radix `PopoverContent` anchored by `virtualRef`),
`TourTitle`, `TourDescription`, `TourFooter`, `TourPrev`, `TourNext`, `TourClose`, `TourStepCounter`.
- Keys: **→** next, **←** back, **Esc** close. These are bound while open; text inputs inside the card don't exist,
  so no input is affected.
- `role="dialog"`, `aria-modal="true"`, labelled by the title and described by the text. Focus goes to the card on
  each step and is restored on close.
- Colours are tokens only (`bg-popover`, `border`, `bg-scrim/60` from `overlayClassName`), and buttons are the
  design system's `Button` (`default` for Next, `ghost` for Back, `icon` for ✕). The card is `w-80 max-w-[calc(100vw-32px)]`.
- The spotlight hole is `rounded-md` with 6px padding, and redrawn on resize, scroll and target resize.
- **As built**: the centred step is the SAME card anchored to a virtual point in the middle of the window (not the
  design system's `Dialog`, which becomes a bottom drawer with its own backdrop on a phone - two focus models). The
  spotlight is portalled on its own; Radix's `Popover.Portal` takes exactly one child. Focus is held by Radix
  `FocusScope` (`radix-ui/internal`, the same package).

## `@effy/web-kit/tour` (behaviour)

```ts
defineTours(tours: TourDef[]): readonly TourDef[]           // identity + dev-time shape asserts
<TourProvider
  tours={SHOP_TOURS}
  roles={{ manager: boolean }}
  state={query}                                               // UseQueryResult<ConsoleTourStateDTO>, from tourStateQueries
  write={(patch) => void}                                     // useTourWrite().mutate
  openRecord={(kind) => Promise<boolean>}                     // R12; false = nothing to open (toast shown by app)
  onEvent={(e: TourEvent) => void}                            // R10 → track()
/>
useTourPage(key: string, opts: { status: "loading" | "ready" | "error" }): void   // every routed screen (R6)
tourStateQueries({ load, save }): {                           // R14 - the one query + mutation, both consoles
  stateQuery; useTourWrite(); registerTourMutationDefaults(queryClient)  // mutationKey ["tours","write"], optimistic, resumes after reload
}
EMPTY_TOUR_SENTENCE                                           // the all-steps-skipped card (data-model)
useTours(): { startPage(via): void; start(key, via): void; current: string | null; list: TourListItem[] }
<TourHelpButton />    // header "?"; menu: Tour this page · Welcome tour · All tours… · Show tours on new pages ✓ · Show every tour again
// (no invitation) - the provider's AutoStart starts a page's tour by itself the first time (operator, 2026-11-03):
// once the page is ready, has settled 700ms, and any menu or dialog has closed. Welcome first; after Welcome is
// finished the page's tour follows; closed early, the page's tour waits for the next visit. `via: "auto"`.
<AllToursDialog />    // the list: title, Seen / New, Start. Opened from Help and search
```

Lookup: `querySelectorAll('[data-tour="key"]')`, first **present** element (connected, non-empty rect, not in
`[hidden]`/`[inert]`); `aria-hidden` is not a test (research R2, R7). Fixed `data-tour` keys that web-kit puts on
shared parts:

| Key | On |
|---|---|
| `nav.<item key>` | each sidebar item and group, using `nav.ts` keys (`nav.orders-group`, `nav.manager`, `nav.settings-group`, …) |
| `nav` | the sidebar itself |
| `header.search` | the header's search button |
| `header.account` | the account menu trigger |
| `header.help` | `TourHelpButton` |
| `page-title` | the title block of `PageHeader` **and** `RecordHeader` (order and product pages) |
| (prop) `tour` | `MoreActions`, `Facet`, `ViewSelect`, `SearchBox`, `RecordSection`, `InspectorSection` (web-kit) and `Settings › SettingsSection`, `Segmented` (shop-web) accept `tour="…"` and render it as `data-tour` |
| `page-activity` | `ActivityButton` (a record page's Activity button) |
| `list.first-row`, `list.row-select` | `DataTable`'s first row and its tick box |
| `list.col.<column id>` | every `DataTable` / `StaticTable` column header |
| `data-tour-above` | an urgent element left bright and clickable during a tour (`NewOrderAlert`, `PwaBanners`) |

## shop-web wiring

| Where | Change |
|---|---|
| `routes/app.tsx` | `TourProvider` inside `LiveProvider`; `<TourHelpButton/>` in `headerActions` (after Scan); `<AllToursDialog/>` in `overlays` |
| `CommandPalette.tsx` | Two actions: **Tour this page**, **All tours** (keywords "tour", "help", "guide") |
| `SoundChip` / `ScanButton` | `data-tour="header.sound"` / `"header.scan"` |
| `NewOrderAlert`, `PwaBanners` | `data-tour-above` |
| Each screen | `useTourPage(...)` + the `data-tour` keys its tour names |
| `lib/telemetry.ts` | The four `tour_*` events |
| `features/tours/` | `tours.ts` (the words; each tour carries its own `path`/`search` for All tours - there is no separate `TOUR_PATH` map), `repo.ts` (the two fetch functions, passed to `tourStateQueries`), `openRecord.ts`, `tours.test.ts`, `tours.guard.test.ts` |
| `lib/query-persist.ts` / `main.tsx` | `registerTourMutationDefaults` before the cache restore; `resumePausedMutations()` after it |
| Screens outside a provider | `useTourPage` and `useTours` do nothing without a `TourProvider` (tests, previews) |
