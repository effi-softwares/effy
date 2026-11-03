# Contract: back-office tour wiring (on 106's `@effy/web-kit/tour`)

## web-kit changes (shared with shop-web)

```ts
interface TourStepDef { /* 106 fields */ roles?: readonly string[] }      // replaces managersOnly
interface TourDef     { /* 106 fields */ roles?: readonly string[]; needsRecord?: string }
<TourProvider roles={readonly string[]} analyticsRole?={string} … />     // roles replaces { manager }
type TourEvent = (106's four) & { role?: string }
// Node-only, for tests:
import { checkToursAgainstSpec, tourCoverage, checkRoleFiltering } from "@effy/web-kit/tour/testing"
```

`stepVisible` / `shownSteps` / `nextShown` / `counter` take `{ roles: ReadonlySet<string> }`. `AutoStart`, Help,
search and `AllToursDialog` drop any tour whose `roles` the person lacks.

## back-office wiring

| Where | Change |
|---|---|
| `components/shell/AppShell.tsx` | `TourProvider` around `StaffShell` (`tours={BACK_OFFICE_TOURS}`, `roles={roles}`, `analyticsRole={roleLabel(roles)}`, state and write from `features/tours/repo.ts`, `openRecord`, `onEvent={track}`); `headerActions={<TourHelpButton />}`; `<AllToursDialog />` in `overlays` |
| `components/shell/CommandPalette.tsx` | **Tour this page**, **All tours** (keywords tour / help / guide) |
| `lib/telemetry.ts` | `tour_started/finished/closed/declined` with `role` |
| `features/tours/` | `tours.ts` (49 tours, the words), `repo.ts` (`/admin/v1/me/tours`), `openRecord.ts` (R6), `tours.test.ts`, `tours.guard.test.ts`, `tours.roles.test.ts` |
| Every routed screen | `useTourPage(key, { status: tourStatus(mainQuery) })` and the `data-tour` keys its tour names |
| `UpdateBanner` | `data-tour-above` |

## Key naming

Generic keys from 106 first (`page-title`, `page-more`, `page-activity`, `list.*`, `nav.*`, `header.*`, `tour` props).
Screen keys are `<area>.<thing>`, for example `overview.attention`, `dispatch.needs-driver`, `round.reassign`,
`exceptions.kinds`, `hub.scan`, `points.value`, `driver.clearances`, `vehicle.compliance`, `shop.danger`,
`review.decision`, `taxonomy.tree`, `promotion.status`, `skin.readability`, `delivery.checker`, `pricing.simulator`.
