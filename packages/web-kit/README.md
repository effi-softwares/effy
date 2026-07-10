# `@effy/web-kit`

The audience-neutral half of an Effy web console. Every web surface **consumes** this; none
re-implements it (constitution Principle II — "copy-paste of cross-cutting logic across surfaces is
prohibited").

Created by feature [007-shop-web](../../specs/007-shop-web/) by extracting the reusable half of the
back-office console (005). See [research R5](../../specs/007-shop-web/research.md) for why.

## Two entry points

| Import | Contains | Who needs it |
|---|---|---|
| `@effy/web-kit` | the **runtime**: config, Amplify wiring, session/token access, the EMAIL_OTP flow, route guard, server-state client, telemetry, client store | every web surface, SPA or SSR |
| `@effy/web-kit/console` | the **SPA chrome**: `ConsoleShell`, sidebar/header/user-menu, `NavList`, `OtpSignInCard`, `ErrorState` | operator consoles only |

The split exists so `customer-web` (Next.js SSR, a later slice) can take the runtime without
dragging in a sidebar it will never render.

## What lives here vs. in the app

**Here** — anything identical across audiences: how a one-time code is requested and confirmed, how
a missing config key fails, how a `DomainError` becomes a human state, how the shell collapses.

**In the app** — anything audience-specific: the role union, the nav items, the feature slices
(`repo.ts` → `queries.ts` → `<Screen>.tsx`), the analytics event union, and which pool the config
points at.

Rule of thumb: if you find yourself about to copy a file from `apps/back-office` into another app,
it belongs here instead, parameterized.

## Role genericity

`NavList`, `ConsoleShell`, and `createSessionGuard` are generic over the surface's role union
(`BackOfficeRole`, `StoreRole`, …). The kit never knows what a role *means*, only that nav items may
require one.

## Consumers

- `apps/back-office` — `BackOfficeRole` = `admin | manager | csa`
- `apps/shop-web` — `StoreRole` = `store_manager | store_staff`
