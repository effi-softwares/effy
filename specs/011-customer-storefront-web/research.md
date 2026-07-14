# Research — 011 Customer Storefront Web Foundation

**Phase 0 output.** Mandated by [operator-directives.md](./operator-directives.md) **OD6** ("deep research
on how the industry handles a high-speed, low-latency, low-bundle, SEO-friendly storefront — and we
follow those rules exactly"). Every decision here is **binding on the plan and on later customer
slices**, not advisory.

Four parallel investigations ran: (1) the industry rules for a fast, indexable storefront, (2) the
**bundled Next.js 16.2.6 documentation** shipped inside the installed package, (3) AWS Cognito's
ability to carry three credential routes on one pool, (4) Amplify's Next.js SSR integration against a
**Terraform-owned** pool.

> **A note on sources.** The scaffolded app ships an `AGENTS.md` that says: *"This is NOT the Next.js
> you know. This version has breaking changes — APIs, conventions, and file structure may all differ
> from your training data. Read the relevant guide in `node_modules/next/dist/docs/`."* That warning
> is accurate. Where the bundled v16.2.6 docs and a web source disagreed, **the bundled docs won** —
> and they overturned three things the web research asserted (D8, D12, D15). Anything still unverified
> is marked **⚠ SPIKE** and has a task attached; nothing unverified is presented as settled.

---

## Part A — The scaffold (what the mandated command actually produces)

### D1 — The preset's output, verified by running it

`pnpm dlx shadcn@latest init --preset b2BnwlLOK --base radix --template next --pointer` was executed
in a scratch directory (**OD2** requires verifying it *before* building on it). It is **interactive** — it
prompts for a project name.

**Decision**: adopt it, then reconcile to the monorepo.

| What it produces | Value |
|---|---|
| Next.js | **16.2.6** |
| React / React DOM | **19.2.4** |
| Tailwind | **v4** (`@tailwindcss/postcss`) |
| shadcn style | `radix-vega`, `rsc: true`, `baseColor: neutral`, `cssVariables: true` |
| Also | `radix-ui` 1.6.2 (unified pkg), `next-themes` 0.4.6, `tw-animate-css`, `lucide-react` **1.24.0**, `tailwind-merge` **3.6.0** |
| Layout | **no `src/`** — `app/`, `components/`, `lib/`, `hooks/` at the root; `@/*` → `./*` |

**Reconciliation required** (the preset assumes a standalone repo):

1. **Delete** its `.git`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` — a nested workspace breaks the
   root pnpm workspace.
2. **Rename** the package to `@effy/customer-web`, mark `private`, and align scripts with the Turborepo
   pipeline (`lint` / `typecheck` / `test` / `build` / `dev`).
3. `baseColor: neutral` is a **happy accident**: it matches 005's Amendment D2 (neutral surfaces, Jade
   as the single accent). The preset's own token block in `app/globals.css` is nonetheless **replaced**
   by `@effy/design-system` tokens — Principle V allows exactly one brand source.
4. Keep `next-themes` for dark mode (Principle V requires it). The SPA consoles roll their own; on an
   SSR surface `next-themes` is the correct tool because it prevents the flash-of-wrong-theme by
   writing the class before paint.

### D2 — Dependency collisions with the shared packages

Three, found by diffing the preset against `@effy/design-system` and `@effy/web-kit`:

| Package | Preset | Platform | Decision |
|---|---|---|---|
| `radix-ui` | `^1.6.2` | `^1.6.2` | ✅ no action |
| `tailwind-merge` | `^3.6.0` | `^2.5.5` | **Bump the platform to v3.** v3 is the Tailwind-v4-aware release; the design system is *already on Tailwind v4*, so v2's merge tables are subtly wrong for it. This is a latent bug in the existing consoles, not a new one. |
| `lucide-react` | `^1.24.0` | `^0.468.0` | **Bump the platform to v1.** Two majors of an icon library = two copies in the graph = a bundle-budget breach on the one surface that has a budget. |

Both bumps touch `design-system`, `web-kit`, `back-office`, `shop-web` — so both are **verified by the
existing 184-test suite**, which is exactly the safety net that makes this the right call rather than a
scary one. Pinning `customer-web` *down* to the old majors was rejected: it freezes the platform on a
dead icon major forever to spare one afternoon.

---

## Part B — Rendering, caching, and the personalization problem

### D3 — Next 16 with `cacheComponents: true`, from day one

**Decision**: enable `cacheComponents: true` in `next.config.ts` immediately.

**Rationale.** In Next 16 this single flag replaces `experimental.dynamicIO`, `experimental.ppr` and
`useCache` (both PPR flags are **removed**; PPR is now simply *what `cacheComponents` does*). It
inverts the default: **everything is dynamic unless explicitly cached**, and uncached data accessed
outside a `<Suspense>` boundary is a **build error** (`Uncached data was accessed outside of
<Suspense>`).

That build error is the single most valuable thing in this slice. It converts "is this page still
cacheable?" from a production incident into a **compile-time gate** — which is precisely the automatic
enforcement FR-005 and FR-007 demand. We adopt it now rather than migrate later because the Next 14/15
implicit-`fetch`-cache model and the `use cache` model are **incompatible mental models**, and every
line written against the old one would have to be rewritten.

**Alternatives rejected**: Next 15's model (obsolete on arrival); static export (`use cache` is
unsupported there, and a grocery catalog can't be a build artifact); fully-dynamic SSR (throws away the
CDN and puts `core-api` on the critical path of every bot and every anonymous browse).

### D4 — The personalization problem: a server-rendered Suspense island

This is **the** architectural question of the slice, and the reason FR-007 exists. A cart badge or a
"Hi Janith" in the header would normally make every page dynamic and uncacheable — destroying the
speed and SEO the whole surface exists for.

**Decision**: the page body is `'use cache'` and prerenders into a **static shell**; the personalized
header island is a **Server Component inside `<Suspense>`** that reads `cookies()` at request time and
**streams in**.

```tsx
// app/layout.tsx — NOT 'use client', and cookies() is NEVER called at this level
<header>
  <Logo /> <Nav />                              {/* static → in the shell */}
  <Suspense fallback={<UserSlotSkeleton />}>
    <UserIsland />                              {/* dynamic hole → streams */}
  </Suspense>
</header>
{children}                                       {/* 'use cache' → in the shell */}
```

One HTML response, one round trip, **zero added client JS**, and no layout shift (the skeleton reserves
the exact box). The public content stays cacheable and fully indexable. The bundled docs walk through
this exact case — a product list with a per-user promo banner — in
`02-guides/public-static-pages.md`, and the build output marks it `◐ (Partial Prerender)`.

**Two hard rules follow, and both are review-enforced:**

- **Never call `cookies()` or `headers()` above a Suspense boundary** (e.g. bare in the root layout).
  It defers the entire app to request time and silently destroys the static shell for every page.
- **Never put `<Suspense fallback={null}>` above `<body>`.** The docs name this explicitly as the way
  to accidentally opt the whole app out of the static shell.

**Alternatives rejected**:

- **`'use cache: private'`** — it *can* read cookies inside a cached scope, but it is **experimental**,
  results are "never stored on the server… cached only in the browser's memory and do not persist
  across page reloads", it is unavailable in Route Handlers, and the docs say plainly it is "not
  recommended for production". Do not build the header on it. Revisit when it stabilizes.
- **Client-side fetch after hydration** — adds a client fetch layer and hydration cost to the *guest*
  path, guarantees a badge flicker, and re-introduces the hand-cached-server-data pattern Principle VI
  forbids. Kept only as a fallback if a CDN turns out not to serve PPR shells (see D6).
- **Edge/proxy HTML rewriting** — fragile string surgery on streamed HTML, breaks hydration invariants.

### D5 — Cache lifetimes and the tag vocabulary (for the catalog slice to inherit)

No catalog ships here, but the **rules** are set now so the catalog slice cannot invent its own.

| Data | Profile | Tag |
|---|---|---|
| Catalog taxonomy / nav | `max` | `catalog:taxonomy` |
| Category listing | `hours` | `category:<slug>` |
| Product detail body | `hours` | `product:<sku>` |
| Home merchandising | `minutes` | `promo:home` |
| **Price** | tag-invalidated, not time-based | `product:<sku>` |
| **Stock / availability** | **never cached** — a streamed hole | — |
| Cart, orders, profile | **never cached** | — |

- `revalidateTag(tag, 'max')` — **the second argument is mandatory in Next 16**; the single-arg form is
  deprecated and raises a TS error. Gives stale-while-revalidate.
- `updateTag(tag)` — **Server Actions only**, read-your-own-writes. This is the right tool for "the cart
  badge must reflect the item I just added", *not* for background invalidation.
- ⚠ `cacheLife('seconds')` (and any profile with `expire < 5 min`) is **automatically excluded from
  prerenders and becomes a dynamic hole**. It means "dynamic but deduped", not "briefly static".
- Search results are **never** cached: `searchParams` is a request-time API and cannot appear inside
  `use cache`, and high-cardinality keys give near-zero hit rates anyway.

### D6 — ⚠ The CDN / hosting risk (flagged now, owned by the go-live slice)

Two findings that would silently gut this design if discovered late:

1. **`use cache` mostly evaporates on serverless.** The docs: in serverless environments "cache entries
   typically don't persist across requests (each request can be a different instance)." If
   `customer-web` is deployed to Lambda, runtime cache hit-rate trends to **zero** and every request
   hammers `core-api`. **Mitigation, in order**: run it as a long-lived Node server (Fargate, beside
   `core-api`), or configure a custom `cacheHandlers` (Redis/ElastiCache), or `use cache: remote`.
2. **A CDN does not honour `revalidateTag`.** The docs: those calls invalidate the *Next.js* cache, but
   "the CDN will continue serving its cached copy until the `s-maxage` TTL expires." A price change
   therefore needs **two** actions: `revalidateTag(...)` **plus** a CDN purge — for **both the HTML and
   the RSC variants**. The CDN must also keep `_rsc` in its cache key and forward the `rsc` header, or
   client-side navigation breaks.

**Neither is in scope here** (this slice is local-only by operator decision), but both are **recorded as
binding constraints on the deployment slice**, because they are choices about *hosting shape* that are
extremely expensive to reverse. The plan carries them into a Deferred Risks section rather than letting
them evaporate.

---

## Part C — Speed, bundle, and SEO

### D7 — Core Web Vitals budgets

Internal gates set **tighter** than Google's "good" thresholds, so field regression doesn't
immediately breach the public standard. Measured at p75, mobile.

| Metric | Google "good" | **Our gate** |
|---|---|---|
| LCP | ≤ 2.5 s | **≤ 2.0 s** |
| INP | ≤ 200 ms | **≤ 150 ms** |
| CLS | ≤ 0.1 | **≤ 0.05** |

SC-002 quotes the Google thresholds; these tighter numbers are what CI actually asserts.

### D8 — Images and fonts (**a web-research correction**)

**`next/image`'s `priority` prop is DEPRECATED in Next 16.** The web research recommended it; the
bundled docs (`03-api-reference/02-components/image.md`) say: *"Starting with Next.js 16, the `priority`
property has been deprecated in favor of the `preload` property… In most cases, you should use
`loading="eager"` or `fetchPriority="high"` instead."*

**Decision**: for the LCP image use `loading="eager"` + `fetchPriority="high"`. Never on grid tiles —
marking everything high-priority de-prioritizes the real LCP element. `sizes` is **mandatory** on every
responsive/`fill` image (a missing `sizes` downloads a 1920px image into a 200px slot — the single most
common storefront LCP bug). Always give `width`/`height` or a sized parent → CLS.

Other Next 16 default changes that will bite silently: `images.qualities` now defaults to **`[75]` only**
(a `quality={90}` prop is coerced), `minimumCacheTTL` moved 60 s → 4 h, and `images.domains` is
deprecated in favour of `remotePatterns`.

**`next/font`**: self-hosts at build time (so **no `preconnect` to Google Fonts** and no third-party
origin on the critical path), auto-preloads, and generates a **metric-matched fallback** that eliminates
swap-induced CLS. One family, two weights. The preset already wires `next/font/google`.

### D9 — The client-JS budget: **≤ 160 KB** on guest routes ⚠ **CORRECTED AT IMPLEMENTATION**

> **⚠ This decision was revised on 2026-07-14, during implementation, against measured evidence.
> The original number was wrong and is preserved below so the correction is auditable.**
>
> **Originally decided**: ≤ 120 KB guest First Load JS, on the stated assumption that "Next 16's
> baseline framework chunk is ~90–110 KB compressed before you write a line."
>
> **That assumption is false for Next 16 + React 19.** Measured on the real build, with
> essentially **zero application client code** (the guest path is server-components-only), the
> framework floor is **~136 KB**, and total guest first-load is **148.5 KB**:
>
> ```
>   ✓ /           148.5 KB / 160 KB   (9 chunks)
>   ✓ /browse     148.5 KB / 160 KB   (9 chunks)
> ```
>
> A 120 KB budget was therefore **unreachable by construction** — it would have failed on an
> empty app. That is a **broken gate, not a strict one**, and a broken gate gets "fixed" by
> raising the limit until it stops complaining, which is how bundle budgets die. This research
> section itself said *"measure it in your own build; do not trust the number."* We did, and it
> didn't survive contact.

**Decision (revised, measured)**:

| Route class | Budget | Measured today |
|---|---|---|
| **Guest** (home, browse, public) | **≤ 160 KB** gz | **148.5 KB** (≈11 KB headroom) |
| Auth routes (the SDK legitimately lives here) | ≤ 300 KB | — (Phase 4) |

**The budget still does the job it was created for**, which is the test of whether the revision is
honest or merely convenient:

- **`aws-amplify` (~30–45 KB gz) cannot reach the guest path without blowing it** — 148.5 + 40 =
  ~188 KB, well past 160. The number that matters most is still enforced.
- App-code and vendor bloat on public pages is still caught: there are only ~11 KB of slack.
- It **ratchets** — raising it requires editing `scripts/bundle-budget.mjs` in a reviewed diff,
  with a reason. It cannot drift upward silently.

**Two measurement errors were found and fixed while landing this** (both would have made the
number fiction):

1. **The `noModule` polyfill bundle must be excluded.** Next emits a ~39 KB `core-js` chunk with
   `noModule`, which **no modern browser downloads**. Counting it inflates every reading by 39 KB
   and measures a page nobody is served.
2. **A glob over `.next/static/chunks/**` is not a budget.** It sums chunks no single page loads.
   The gate now parses the **prerendered HTML Next actually serves** and takes exactly the
   `<script>` tags a browser will fetch — ground truth by construction. It also **fails if it
   finds zero scripts**, because a gate that silently measures nothing is worse than no gate.

This resolves the placeholder in **SC-003**.

### D10 — ⚠ Next 16 gives us **no** bundle gate. We must build one.

Two findings that invalidate the obvious approach:

- **`next build` no longer prints `size` / `First Load JS` at all** — removed in 16 as "inaccurate in
  server-driven architectures using RSC." So the budget cannot be read from build output.
- **Next ships no bundle-budget feature**, and **Turbopack is now the default builder**, which means a
  custom `webpack` config *fails* `next build` — killing **`@next/bundle-analyzer`** (webpack-only).

**Decision**: enforce the budget ourselves, in CI, blocking:

1. **`size-limit`** pointed at the built client chunks — the actual gate that fails the build.
2. **Lighthouse CI** assertions (`resource-summary:script:size`, LCP, CLS) against a local production
   build — the field-shaped gate.
3. **`next experimental-analyze`** (Turbopack-native, ships with 16) — the *diagnostic* used to find
   what grew. Not a gate.

### D11 — Keeping Amplify out of the guest bundle (the rule the budget depends on)

The measurements are contested and this matters, so it is stated honestly: AWS's own v6 launch post
claims **Auth ≈ 32 KB** min+gzip, while an open issue against 6.15.4 reports an auth-only import at
**~120 KB** (units unclear). **Planning number: ~30–45 KB gzipped, and we measure it in our own build
rather than trusting either figure.**

**The decisive finding**: `Amplify.configure()` in a `"use client"` module imported by
`app/layout.tsx` lands in the **shared client chunk, which every page loads — including guest catalog
pages.** The pattern Amplify's own docs recommend is therefore *exactly wrong* for a storefront with
anonymous browsing; their docs assume an all-authenticated app.

**Decision — a four-part quarantine, CI-enforced:**

1. **`aws-amplify` is never imported from `app/layout.tsx`** or anything a guest page can reach.
2. **Route-group isolation**: the client SDK is configured in **`app/(auth)/layout.tsx`** only. Guest
   pages read session state **server-side** (`runWithAmplifyServerContext`), where bundle size is
   irrelevant — so the header can render "Sign in" vs. the customer's name with **zero client auth JS**.
3. **`next/dynamic`** the sign-in form on top of that, so even `/sign-in` server-renders first.
4. **A dependency-cruiser rule in CI** that **fails the build** if any module under the guest route
   group transitively imports `aws-amplify`. This regression is one careless import in a shared header
   away, so it gets a machine guard, not a code-review convention.

> **⚠ Implementation note (2026-07-14) — the guard was WRONG on its first attempt, and the proof
> meant to validate it was too weak to notice.**
>
> dependency-cruiser's `from`/`to` rules match **direct** dependencies only. The first version of
> the rule therefore reported a clean tree while `aws-amplify` was genuinely on the home page,
> because the leak ran `page.tsx → SomeComponent.tsx → aws-amplify`.
>
> **That is exactly what a real regression looks like.** Nobody imports the SDK straight into a
> page — they import a header, a hook, or a provider that does. The T020 proof passed only because
> it injected the import *directly* into the root layout: the one shape the mistake never takes.
> The **bundle-budget gate caught what the dependency guard missed** (162.7 KB > 160 KB), which is
> the only reason it was found at all.
>
> **Fix**: `to: { reachable: true, path: "aws-amplify|@aws-amplify" }`, and T020 now breaks it with
> a **transitive** leak. The lesson generalizes beyond this rule: *break a guard the way it will
> actually break, not the way that is easiest to simulate* — and keep two independent gates, because
> one of them will be wrong.

**`@aws-amplify/ui-react` is rejected**: its `<Authenticator />` drags in a second component library and
its own CSS on top of the SDK, and it cannot wear the Jade design system. We build the forms on
`@effy/design-system` primitives and call `signIn`/`confirmSignIn` directly.

### D12 — SEO (**partly a web-research correction**)

- **Metadata API**: `generateMetadata()` must read from **the same `'use cache'` function the page body
  uses** — in Next 16, uncached I/O in `generateMetadata` on an otherwise-prerenderable page is a
  **build error**. Memoize the shared fetch with `React.cache`.
- `metadataBase` from `NEXT_PUBLIC_SITE_URL`; a **canonical on every page**.
- **`sitemap.ts` / `robots.ts`** — both cached by default. ⚠ Breaking in 16: `generateSitemaps`' `id` is
  now a **`Promise<string>`** and must be awaited.
- **JSON-LD**: the docs are explicit — render it as a **native `<script>` tag** in the page/layout, *not*
  via `next/script* ("structured data, not executable code"). From a **Server Component** → zero client
  JS. XSS-scrub with `JSON.stringify(ld).replace(/</g, '\\u003c')`.
- **Facets/pagination (catalog slice)**: facets are **query params**, never path segments; `robots.txt`
  **`Disallow`** each facet param (this is the *crawl-budget* fix — `noindex` is not: Google still
  fetches the page, then drops it); `rel=canonical` from every facet/sort URL back to the clean
  category URL; paginated pages canonical to **themselves**, never to page 1.
- **Streaming metadata**: Next auto-detects HTML-limited bots and serves them metadata in `<head>`.
  **Leave `htmlLimitedBots` at its default** — widening it to `/.*/` "to be safe" costs TTFB on every
  request, and Googlebot executes JS anyway.
- **The cloaking rule is absolute** (FR-008): never branch page *content* on User-Agent. No
  render-full-HTML-for-bots. It is a Search spam-policy violation. Our answer is the one this whole
  document describes — **serve everyone the same server-rendered HTML**.

---

## Part D — Identity: three credential routes on one pool

### D13 — Cognito can do it, and **no destructive Terraform change is required**

The single most important infrastructure finding, because the opposite would have put every existing
account at risk.

**The pool already permits passwords.** `infra/modules/cognito-user-pool/main.tf` computes
`allowed_first_auth_factors = concat(var.allowed_first_auth_factors, ["PASSWORD"])` — the module appends
`PASSWORD` because *the CreateUserPool API refuses to omit it*. And per AWS: *"The `PASSWORD` value in
`AllowedFirstAuthFactors` includes both the plain-password and SRP authentication flow options."* So the
pool-level policy that enables route (a) **is already there**. No `sign_in_policy` change at all.

**Replacement risk, checked against the Terraform provider source** (the website docs omit the ForceNew
flags, so the schema was read directly). On `aws_cognito_user_pool` the **only** `ForceNew` arguments
are `username_attributes`, `alias_attributes`, and `username_configuration.case_sensitive`. **We touch
none of them.**

| Change | Result |
|---|---|
| `sign_in_policy.allowed_first_auth_factors` | in-place (**and not needed**) |
| app client `explicit_auth_flows`, `supported_identity_providers`, `allowed_oauth_*`, `callback_urls` | **in-place** (only `generate_secret` / `user_pool_id` replace a client) |
| add `aws_cognito_identity_provider` (Google) | new resource; pool untouched |
| add `aws_cognito_user_pool_domain` | new resource; pool untouched |
| add `lambda_config { pre_sign_up }` | **in-place** |
| `password_policy`, `account_recovery_setting` | in-place |

**The whole change set is non-destructive.** We still `terraform plan` and grep for `must be replaced`
before applying — the same discipline 007 used — and add `lifecycle { prevent_destroy = true }` to the
pool as a seatbelt.

### D14 — Passwordless **sign-up** is first-class. No random-password hack.

The sticking point everyone hits, resolved at the API level. Cognito's `SignUp` API marks `Password` as
**`Required: No`**: *"Users can sign up without a password when your user pool supports passwordless
sign-in… To create a user with no password, omit this parameter."*

**One condition matters**: *"Managed login and the hosted UI always require passwords."* The
password-free sign-up works **only from our own SDK-driven form** — which we are building anyway. Google
still redirects through the Cognito domain (D15), but our sign-up and OTP forms are ours.

Amplify surfaces this directly, and `signUp` can chain into an auto-sign-in so registration + verify +
sign-in costs the customer **one code**:

```ts
await signUp({ username: email,
  options: { userAttributes: { email }, autoSignIn: { authFlowType: 'USER_AUTH' } } })
await confirmSignUp({ username: email, confirmationCode })  // → COMPLETE_AUTO_SIGN_IN
await autoSignIn()
```

Passwordless support landed in **`aws-amplify@6.10.0`**; we pin `^6.18.0`.

The three routes coexist in **one** `Amplify.configure`, chosen **per call**:

| Route | Call |
|---|---|
| Password | `signIn({ username, password, options: { authFlowType: 'USER_SRP_AUTH' } })` — SRP never puts the password on the wire |
| Email OTP | `signIn({ username, options: { authFlowType: 'USER_AUTH', preferredChallenge: 'EMAIL_OTP' } })` → `confirmSignIn(code)` |
| Google | `signInWithRedirect({ provider: 'Google' })` |

App client gains `ALLOW_USER_SRP_AUTH` alongside its existing `ALLOW_USER_AUTH`.

### D15 — Google forces a Cognito domain. There is no pure-SDK path.

AWS: *"You **must enable managed login** to integrate with supported social identity providers."*
Federation is an OAuth redirect (`/oauth2/authorize` → Google → `/oauth2/idpresponse`); no `InitiateAuth`
flow federates, and Amplify exposes it only as `signInWithRedirect`.

**Decision**: create `aws_cognito_user_pool_domain` with a **prefix domain** in dev
(`<prefix>.auth.ap-southeast-2.amazoncognito.com`). A *custom* domain (`auth.dev.effyshopping.com`) is
CloudFront-fronted and would drag in an **ACM certificate in `us-east-1`** — exactly the carve-out
CLAUDE.md already documents for 010. **Dev takes the prefix domain and pays nothing.**

The customer never sees a Cognito-branded page: we deep-link
`/oauth2/authorize?identity_provider=Google&…` so "Continue with Google" jumps **straight to Google's
consent screen**, with the Cognito domain as an invisible transit hop.

**Out-of-code dependency**: a **Google OAuth client** (id + secret), operator-registered — the same class
of dependency as the GoDaddy registrar in 010. Terraform can wire it; it cannot create it.

### D16 — Account linking: the security-critical decision

Cognito creates a **separate** `Google_<sub>` profile for a federated sign-in, distinct from a native
user with the same email. Left alone, that is a **duplicate account** — a direct FR-011 violation.

**Decision**: a **pre-sign-up Lambda trigger** (`lambda_config { pre_sign_up }`, Terraform-native) that,
on `PreSignUp_ExternalProvider`, finds the native profile by email and calls
**`AdminLinkProviderForUser`** — and, if none exists, **creates the native profile first and links to
it**, so the local profile is *always* the `DestinationUser`.

**Why that ordering is non-negotiable**: after linking, "the user's JWTs always carry the **same `sub`**
regardless of how they sign in." Our database record is keyed on `sub` (FR-023), so **linking preserves
the key** — but only if the native profile is the destination. If Cognito auto-creates a `Google_…`
profile first, you get two profiles, two `sub`s, and **there is no retroactive merge** (linking requires
that the federated user *not yet exist*).

**⚠ THE SECURITY TRAP — FR-012 exists because of this.** Linking on an email match alone is a complete
**account-takeover primitive**:

> An attacker registers `victim@gmail.com` at an IdP that does not verify email ownership, federates
> into our pool, the trigger matches the email, links the attacker's identity to the victim's profile —
> and the attacker now receives JWTs **carrying the victim's `sub`**. Full takeover: no password, no
> OTP, no trace.

AWS states it plainly: *"it is critical that it only be used with external IdPs and provider attributes
that have been trusted by the application owner."*

**The mitigations are mandatory, all of them:**

1. **Link only when the IdP asserts `email_verified === true`.** Google does assert it — so it **must be
   mapped**: `attribute_mapping = { email = "email", email_verified = "email_verified", username = "sub" }`.
   Without that mapping the merged profile lands with `email_verified = false`, which *also* locks the
   customer out of password recovery.
2. **Link only into a native profile whose own email is verified** (guaranteed by construction here —
   assert it anyway).
3. **Google is the only federated provider.** The moment a generic OIDC IdP is added, the email-match
   link becomes an ACL. This is why "other providers" is explicitly out of scope.
4. **`email` must not be client-writable** (`write_attributes` excludes it), or a signed-in user could
   simply update their email to the victim's — the adjacent, well-known Cognito takeover.
5. **Key on `sub`, never on email.** Effy already does. Email is only the *matching heuristic*.

### D17 — ⚠ SPIKE: `AliasExistsException` on first Google sign-in

**The highest-risk unknown in the slice, and it is unresolved.**

Because `username_attributes = ["email"]`, the email is a sign-in alias and must be unique. When the
trigger links a federated identity to an existing native profile with the same email, Cognito is widely
reported to raise **`AliasExistsException`, failing the customer's *first* Google sign-in** — the link
*is* created, and the *second* attempt succeeds. AWS documentation **neither confirms nor refutes this**;
the evidence is AWS re:Post threads and `aws-amplify/amplify-js#11565`.

We will not design around a rumour, nor ship on the assumption it is false. **T-spike: reproduce it in
dev before the sign-in UI is finalized.** If it reproduces, the fallbacks, in order: (a) transparently
retry the redirect once on the callback; (b) move linking out of band (an explicit "connect Google" from
an already-authenticated session).

⚠ Related, also unverified: whether a customer who **never had a password** can set one via the
forgot-password flow. If not, the supported path is an authorized `AdminSetUserPassword` after an
OTP-authenticated session — the same Cognito-first admin-write shape as 006/009. **Second spike.**

### D18 — Abuse protection on a genuinely public surface (FR-016)

This is the platform's first endpoint the whole internet can call. Cognito's **per-user** throttles are
the real brake and are not adjustable: `ResendConfirmationCode` **5/user/hour**; `ConfirmSignUp`
15/user/hour; `ForgotPassword` 5–20/user/hour; **email OTP messages 5–20 per address per hour, per
requester IP**. Account-level category quotas: `UserCreation` (`SignUp`) 50 RPS, `UserAuthentication`
120 RPS.

**Decision**: rely on Cognito's per-user throttles for this slice, add an **app-level cooldown** on
"send me a code", and record that **threat protection (breached-password detection, adaptive auth) is
`PLUS`-tier only** — not `ESSENTIALS`, which is what dev runs. Since route (a) introduces **passwords to
a public consumer pool for the first time**, PLUS's compromised-credentials check is worth pricing
before production. The tier change is **in-place** (D13), so it is a cost decision, not an architectural
one. WAF in front of the sign-up form is the production answer and is out of scope here.

---

## Part E — Amplify integration

### D19 — The client library only. **Not** Gen 2 backend tooling.

**This corrects the feature description**, which asked for "AWS Amplify SDK **gen2** react version".
The two things called "Amplify Gen 2" are different products, and one of them would fight Terraform:

| | Package | What it does | Adopt? |
|---|---|---|---|
| Gen 2 **backend** | `@aws-amplify/backend`, the `ampx` CLI, `amplify/backend.ts` | **Provisions AWS resources** via CDK → CloudFormation | ❌ **No** |
| Amplify **client** | **`aws-amplify` v6** (`^6.18.0`) | `Amplify.configure`, `signIn`, `fetchAuthSession` | ✅ Yes |
| Next.js SSR adapter | **`@aws-amplify/adapter-nextjs`** (`^1.7.3`) | `createServerRunner`, cookie-based server context | ✅ Yes |
| Prebuilt UI | `@aws-amplify/ui-react` | `<Authenticator />` | ❌ No (D11) |

**`defineAuth()` would create a second, CloudFormation-managed pool — two owners of one concern.** Even
Gen 2's `referenceAuth()` escape hatch requires an identity pool and two IAM roles we neither have nor
want, and its docs concede "Amplify cannot modify the configuration of your referenced resources" — so
it buys a CloudFormation stack and nothing else.

Configuring the **client library** manually against an existing Terraform-owned pool is an explicitly
**documented, supported path** ("Use existing Cognito resources"). `amplify_outputs.json` is just a JSON
blob in the shape `Amplify.configure` expects — nothing requires `ampx` to emit it. We feed it from the
existing SSM contract (`/effy/<env>/auth/customer/*`), exactly as `@effy/web-kit` already does for the
Vite surfaces.

**So: the *SDK* is adopted as directed; the *backend tooling* is not.** No `ampx`, no `amplify/`
directory, no `amplify_outputs.json`.

Compatibility confirmed: `@aws-amplify/adapter-nextjs@1.7.3` declares `next: ">=13.5.0 <17.0.0"` →
**Next 16 is supported**.

### D20 — Where auth is checked (**a correction to ARCHITECTURE.md**)

ARCHITECTURE.md § *Customer web (SSR)* currently says: *"**SSR auth guard:** edge middleware runs the
auth server-context per request to guard the auth-gated segment."* Next 16's own authentication guide
contradicts this:

> *"While Proxy can be useful for initial checks, **it should not be your only line of defense in
> protecting your data. The majority of security checks should be performed as close as possible to your
> data source.**"* … *"only read the session from the cookie (optimistic checks), and avoid database
> checks"* … and, separately: *"**Always verify authentication and authorization inside each Server
> Function rather than relying on Proxy alone.**"*

It also warns against auth checks **in layouts**, because "due to Partial Rendering… these don't
re-render on navigation, meaning the user session won't be checked on every route change."

**Decision**: a two-tier model.

- **`proxy.ts`** (Next 16's rename of `middleware.ts` — Node runtime, *not* Edge, and it cannot be
  configured otherwise) does an **optimistic cookie-presence check** on `/account/*` and `/checkout/*`,
  purely to redirect early and preserve the `next` destination. Its matcher is an **allowlist of
  protected segments** — guest routes never run it.
- **A Data Access Layer** (`lib/dal.ts`, `import 'server-only'`) does the **real** verification —
  session decode + the platform's own customer-record check (FR-025) — and is called by **every**
  protected page, Server Action, and Route Handler. Server Actions are treated as public endpoints,
  because that is what they are.

This requires a small **ARCHITECTURE.md amendment**, recorded in the plan.

### D21 — Known pitfalls to design around

1. **Cookie size.** id + access + refresh ≈ **4.5 KB**, against a ~4 KB per-cookie / per-domain browser
   limit. Overflow silently truncates → the server sees "not authenticated" while the browser thinks it
   is signed in. **Mitigation**: keep the customer pool's token lean — **no RBAC groups** (the customer
   pool defines none — Principle IV), no custom attributes, no pre-token-generation Lambda. This is a
   real risk precisely because the admin/shop pools *do* use group claims; the customer pool must not
   follow them.
2. **`Amplify.configure` does not cross the server boundary.** There is no shared singleton between RSC
   and the client. Two configuration sites, always: the `"use client"` module and `createServerRunner`.
3. **Server Components cannot set cookies.** If `fetchAuthSession` refreshes an expired token inside a
   Server Component, the rotated tokens **cannot be written back** — the refresh is lost and repeats
   every render. Refresh-sensitive work belongs in **`proxy.ts`, Route Handlers, or Server Actions**.
4. **`export const dynamic = 'force-dynamic'`** is required on any Server Component reading `cookies()`
   — which **de-opts the route from static generation**. One more reason guest catalog pages must stay
   auth-free and read session state only inside the Suspense island (D4).
5. **OAuth redirect**: `import 'aws-amplify/auth/enable-oauth-listener'` on the callback page, or the
   redirect completes and nothing happens.
6. **Open redirect**: the `next` destination must be validated server-side as a same-origin relative
   path (reject `//…` and anything with a scheme). Cognito's `redirectSignIn` is a fixed allowlist, so
   for the Google route the destination is stashed before redirecting.

---

## Part F — Testing

### D22 — ⚠ Vitest **cannot** test async Server Components

From the bundled docs: *"Since `async` Server Components are new to the React ecosystem, **Vitest
currently does not support them**… we recommend using **E2E tests** for `async` components."*

Our cached data components are exactly that. **Decision** — a three-layer strategy:

| Layer | Tool | Covers |
|---|---|---|
| Unit | **Vitest** | plain async data functions, DTO↔domain mappers, the `next` redirect validator, client components, the DAL's decision logic |
| **E2E** | **Playwright** (new to the repo) | SSR/SEO assertions (raw HTML contains content — SC-004), the three credential routes, the deferred-sign-in return (SC-008), cross-pool refusal |
| Budget | **size-limit** + **Lighthouse CI** | SC-002, SC-003 |

Playwright is the only way to honestly prove SC-004 ("content present with **no** client-side code
executed") — it can fetch the raw response and assert on it, which no unit test can.

---

## Summary — the rules this slice is bound by

1. **Next 16 + `cacheComponents: true`.** PPR is the rendering model. The "uncached data outside
   Suspense" build error is a **gate**, never suppressed.
2. **Personalization is a server-rendered Suspense island.** Never a whole-page dynamic downgrade,
   never `use cache: private` (experimental), never proxy HTML rewriting.
3. **Guest routes ≤ 120 KB First Load JS**, enforced by `size-limit` + Lighthouse CI — **we build the
   gate; Next 16 no longer reports the number.**
4. **`aws-amplify` never appears in a guest route's module graph** — route-group isolated, dynamically
   imported, and **CI-guarded by a dependency rule**.
5. **Amplify *client library* only.** Gen 2 backend tooling is rejected: it would fight Terraform for
   ownership of the pool.
6. **The Cognito change set is non-destructive** — verified against the provider schema. Plan is still
   grepped for `must be replaced` before apply.
7. **Passwordless sign-up needs no password hack** — `SignUp` legitimately omits `Password`.
8. **Google requires a Cognito domain** (prefix domain in dev; a custom one would need a us-east-1 cert).
9. **Account linking is a security control**: link only on `email_verified === true`, always into the
   **native** profile, keyed on `sub`. Getting this wrong is an account-takeover primitive.
10. **Auth is verified in a Data Access Layer**, not in `proxy.ts` — which amends ARCHITECTURE.md.
11. **Async Server Components are E2E-tested, not unit-tested.**
12. **Two spikes must run before the design is locked**: `AliasExistsException` (D17) and
    passwordless-user-sets-a-password (D17).

---

## D23 — The 6-vs-8 digit OTP mismatch (2026-07-15) — **accepted, not fixed**

**Observed**: sign-up confirmation emails a **6-digit** code; email-OTP **sign-in** emails an **8-digit**
code. Reported as a bug. It is not one — it is two different Cognito mechanisms with two different
email templates:

| | Sign-up | Sign-in |
|---|---|---|
| API | `SignUp` → `ConfirmSignUp` | `InitiateAuth USER_AUTH` → `RespondToAuthChallenge` |
| Template | `verification_message_template` | `email_mfa_configuration` |
| Length | **6 digits** | **8 digits** |

**⚠ NEITHER LENGTH IS CONFIGURABLE — anywhere.** Not on the user pool, not on the app client, not in
the message templates; not in the Cognito API, CloudFormation, or the Terraform provider schema. AWS
does not even *document* the digit counts — both are empirical. The open feature request is
[amplify-js#14428](https://github.com/aws-amplify/amplify-js/issues/14428) ("Allow configuration of the
email and phone OTP length; currently fixed at an 8 digit PIN"), routed to the Cognito service team.
Nothing has shipped.

**Decision: accept the mismatch** (operator, 2026-07-15). Rationale:

- **Nothing is broken.** The OTP inputs are length-agnostic — no `maxLength`, no fixed-box grid, no
  auto-submit on the Nth keystroke. Both codes work today.
- **A new customer never meets both in one journey.** Sign-up auto-signs them in (FR-009b), so they
  see the 6-digit code exactly once, at registration, and only ever see 8-digit codes thereafter. The
  inconsistency surfaces across sessions, not within a flow.
- **The only way to force 6 everywhere is `CUSTOM_AUTH`** — Define/Create/Verify challenge Lambdas.
  That would cost: choice-based auth (**foreclosing WEB_AUTHN passkeys**), auto-sign-in-after-sign-up,
  and Cognito's managed rate limiting — replaced by our own OTP store, expiry and throttling, with
  three Lambdas on the critical path of every sign-in. **~600 lines of security-critical code to
  delete two digits.** Rejected.

**Binding consequence — do not "fix" this by hardcoding a length.** A `maxLength={6}` on the code input
would silently truncate every *sign-in* code and produce a "that code isn't right" error the customer
cannot possibly resolve. The two OTP inputs carry a comment saying so.

**Alternative left on the table** (if the mismatch ever becomes a real complaint): eliminate the
6-digit code entirely by dropping `email` from `auto_verified_attributes` and routing new sign-ups
straight into `USER_AUTH`/`EMAIL_OTP` — AWS documents that answering a passwordless OTP both verifies
the email *and* flips the user `UNCONFIRMED` → `CONFIRMED`. That yields **one** code type platform-wide
(8-digit), zero Lambdas, and stays on the managed path. ⚠ Gated on an unverified precondition: whether
`InitiateAuth USER_AUTH` admits an `UNCONFIRMED` user. Fallback: a `PreSignUp` trigger with
`autoConfirmUser = true`.

### ⚠ D23a — a related gap that 010 will expose

The **email-OTP sign-in message is governed by `email_mfa_configuration`, NOT by
`verification_message_template`** — they are separate settings, and we currently configure **neither**
for the sign-in OTP.

Today that is invisible: Cognito's built-in sender uses its own default text. But **010 switches all
four pools to branded SES sending** (`no-reply@dev.effyshopping.com`), at which point the sign-in code
email will go out **from the Effy address with Cognito's generic default body** — branded envelope,
unbranded letter. Two traps to expect when wiring it:

1. **Terraform drops `email_mfa_configuration` on pool *create*** when `mfa_configuration = OFF` (which
   ours is — passwordless is a first factor, not MFA). It is only sent on *update*, so it may need a
   second apply.
2. **Cognito rejects `EmailMfaConfiguration` when account recovery is email-only** — it demands a
   recovery mechanism other than `verified_email`. Our customer pool currently has exactly one.

Neither blocks this slice. Both belong to 010's operator run, and are recorded here so they are not
rediscovered from a confused customer email.
