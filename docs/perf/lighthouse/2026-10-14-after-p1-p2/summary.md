# Lighthouse — after-p1-p2 (2026-10-14)

`https://dev.effyshopping.com` · mobile, simulated throttling · lighthouse@13.5.0 · median of 3 runs by LCP.
Lab numbers: compare with other runs of `make cw-lighthouse`, not with field data.

| Page | Score | LCP ms | FCP ms | TBT ms | CLS | Speed index ms | TTFB ms | KB | Requests | LCP of each run |
|---|---|---|---|---|---|---|---|---|---|---|
| home | 72 | 6306 | 1985 | 32 | 0.000 | 5169 | 1850 | 693 | 85 | 7098 / 4285 / 6306 |
| aisle | 92 | 3110 | 1910 | 18 | 0.000 | 2352 | 724 | 625 | 80 | 3097 / 3110 / 3113 |
| product | 93 | 2917 | 1867 | 8 | 0.000 | 3071 | 1212 | 471 | 41 | 2990 / 2908 / 2917 |

## What this run measured

dev was running commit `84554373`: PERF-01..19 deployed except where the backlog says otherwise. It is
**not** a before-baseline — that was not taken before the work landed, and lab numbers cannot be taken
for code that is no longer deployed. For "before", use the web-vitals events in PostHog from before
2026-10-14.

- **Home's LCP is the promo hero's headline** — text on a drawn band, streamed in its own Suspense
  boundary once the home payload arrives. So home's LCP is the home read: fast from a warm server's
  cache, seconds on a cold one. That is the spread between runs (4.3–7.1 s).
- **TTFB is 0.7–1.9 s on every page**, and the HTML is `private, no-store` and a CloudFront miss: Amplify
  renders each page per request, including its static shell. Not something this backlog changed.
- CLS 0 on all three.
