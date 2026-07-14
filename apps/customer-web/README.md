# `@effy/customer-web` — the customer storefront

The platform's **fourth client surface and its first public one**. Every other surface sits behind a
login and serves an Effy employee. This one is open to anyone, must be found by search engines, and
serves a person who has no account until they choose to make one.

Spec: [specs/011-customer-storefront-web](../../specs/011-customer-storefront-web/)

## Run it

```bash
cp .env.example .env.local     # fill from the SSM contract
make core-run                  # the hot path — LOCAL DOCKER ONLY (it is not deployed)
make cw-dev                    # → http://localhost:3000
```

## The four rules that will otherwise be broken by accident

Each is load-bearing, silent when violated, and expensive to discover late. Two are machine-guarded;
all four are worth knowing before you edit anything.

### 1. Never call `cookies()` or `headers()` above a `<Suspense>` boundary

Reading a request API in a layout — or anywhere outside a boundary — defers the **entire app** to
request time. Every page loses its static shell, and the speed and search visibility this surface
exists for go with it. One line in `app/layout.tsx` is enough to do it.

The personalized header (`components/header/UserIsland.tsx`) is a **server-rendered Suspense island**:
the page body prerenders into a cached static shell, the island reads cookies at request time and
streams into a reserved slot. One response, zero added client JS, no layout shift.

**Guarded by** `cacheComponents: true` — a **build error**, not a code-review convention.

### 2. Never import `aws-amplify` outside `app/(auth)/`

Amplify's own docs tell you to call `Amplify.configure()` in the root layout. For an app where
everyone is signed in that is fine. **Here it is exactly wrong**: the root layout is on every route, so
the SDK lands in the shared client chunk that *every* page loads — including the pages a guest visits.
They would download ~30–45 KB of authentication machinery in order to look at a bag of rice.

Guest pages read session state **server-side** (`lib/session.ts`), where bundle size is irrelevant.

**Guarded by** `.dependency-cruiser.cjs` — and it checks **reachability**, not direct imports, because a
real leak runs `page → component → aws-amplify` and never straight into a page. The guard has been
deliberately broken that way and confirmed to catch it.

### 3. Auth is verified in the DAL, not in `proxy.ts`

`proxy.ts` (Next 16's rename of `middleware.ts`) does an **optimistic** cookie-presence check, to
redirect early and keep the customer's destination. It is a UX affordance and nothing more.

The real check is `lib/dal.ts`, called by every protected page and Server Action. It verifies the
session **and consults the platform's own customer record** — because a valid token is not permission:
a **barred** customer holds a perfectly valid token and must still be refused.

Auth checks must **not** live in layouts. They don't re-render on navigation, so they would run once
and then quietly stop guarding.

### 4. The backend routing law

```
product · catalog · search · cart · order · payment   →  core-api (Go, hot path)   lib/api/core.ts
customer profile / account management                 →  edge-api (serverless)     lib/api/edge.ts
```

No commerce feature may go on the cold path without a recorded exception. Both addresses are
**configuration, never literals**, so the hot path's eventual go-live needs no code change here.

## The gates

Both **fail the build**. Neither warns.

```bash
make cw-depcruise   # the Amplify quarantine (FR-006)
make cw-size        # the guest bundle budget — ≤ 160 KB gz (FR-005 / SC-003)
make cw-gates       # both
```

On the budget: Next 16 **removed** First Load JS from its build output and ships no budget feature, so
`scripts/bundle-budget.mjs` computes it from the prerendered HTML Next actually serves. It excludes the
`noModule` polyfill bundle (~39 KB) that no modern browser ever downloads, and it **fails if it finds
zero scripts** — a gate that silently measures nothing is worse than no gate at all.

## Testing

```bash
make cw-test   # Vitest — units
make cw-e2e    # Playwright — SSR / SEO / auth / guest-first
```

⚠ **Vitest cannot test async Server Components.** That is a documented Next limitation, not a
configuration problem — and most of the interesting components here are exactly that. So: Vitest for
data functions, client components and pure logic; **Playwright for anything rendered**. SC-004
("content present with no client-side code executed") can only be proven by fetching the raw response,
which no unit test can do.

## What this surface does NOT have

No catalog, no cart, no checkout, no payment, no product data of any kind (operator decision,
2026-07-14). `/browse` is honest about being empty rather than faking product tiles, and `/checkout`
exists solely to prove that the sign-in demand lands at the point of **ordering** and costs the
customer nothing. The catalog and checkout slices fill them in — they inherit the rules above rather
than inventing them.
