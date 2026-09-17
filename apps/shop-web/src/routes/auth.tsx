import { createRoute, Outlet } from "@tanstack/react-router";

import { SignInScreen } from "@/features/auth/SignInScreen";

import { rootRoute } from "./__root";

/**
 * The adopted design's SPLIT sign-in: a flat `--brand` panel beside a 360px form column.
 *
 * ⚠ THE PANEL IS A FLAT FILL, NOT A GRADIENT. The whole platform is flat; a gradient here would be
 * the single largest coloured surface in the product and the only one that breaks the rule.
 *
 * ⚠ IT FILLS WITH `--primary`, NOT `--brand`, AND THAT IS A CORRECTION TO THE REFERENCE. The
 * reference draws `background:var(--brand); color:#fff`. The bug is the hardcoded `#fff`, not the
 * token: the dark brand fill is LIGHT, so white on it was measured at 1.90:1 — an unreadable
 * headline across half the screen, on the one page that has to establish trust before a credential
 * is typed. `--primary`/`--primary-foreground` is the pair check-tokens.mjs already holds to 4.5:1
 * in BOTH appearances (6.70:1 light, 7.05:1 dark), so the panel cannot regress without the build
 * failing.
 *
 * ⚠ --brand AND --primary NOW RESOLVE EQUAL IN BOTH APPEARANCES (the neutral-grey dark rebase
 * removed the one-step split the navy ground had needed), so today the two spellings would render
 * identically. That is NOT a reason to switch to `--brand`: what makes this panel safe is the
 * GUARDED PAIR, and only --primary has one. If the values ever diverge again, this stays correct.
 *
 * ⚠ THE PANEL COLLAPSES BELOW THE FORM on narrow viewports (`flex-wrap`, form column first in the
 * DOM at narrow widths via `order`). On a phone the form is what the operator came for — a
 * full-height marketing panel above it would push it below the fold.
 *
 * ⚠ THE REFERENCE'S BOTTOM STAT ROW IS DELIBERATELY ABSENT. It shows "678 orders last 30 days ·
 * 486 210 kr revenue · 3 locations". A signed-OUT page has no session and no shop, so it cannot know
 * any of those; rendering them would mean inventing three numbers on the one screen whose entire job
 * is to establish trust before a credential is typed. An empty region is better than a padded one.
 */
export const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  component: () => (
    <div className="flex min-h-dvh flex-wrap bg-background">
      <section className="order-2 flex min-w-0 flex-[1_1_440px] flex-col gap-8 bg-primary p-8 text-primary-foreground lg:order-1 lg:p-11">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-lg bg-primary-foreground/20 text-[13px] font-semibold"
          >
            E
          </span>
          <span className="text-sm font-semibold tracking-[-.01em]">Effy Shop Console</span>
        </div>

        <div className="grid max-w-[26em] flex-1 content-center gap-6">
          <h2 className="text-[clamp(26px,4vw,34px)] font-semibold leading-[1.15] tracking-[-.03em]">
            Every order, every shelf, one console.
          </h2>
          {/* ⚠ EACH LINE NAMES A CAPABILITY THIS CONSOLE ACTUALLY HAS. The reference's own three
              promise margin, restock alerts, "every channel" and payout reconciliation — Effy has no
              unit cost or margin (057 A2 refused it), no purchasing (A1 deferred it), exactly one
              sales channel, and no payouts feature at all. Copying them would put four lies on the
              sign-in page. These three are Today, Catalog/stock and Insights, described as they are. */}
          <ul className="grid gap-3.5">
            {[
              "A live order feed — pick, check and hand over in one pass",
              "Stock counts and low-stock alerts on every product you track",
              "Insights on revenue, orders and your best-selling products",
            ].map((line) => (
              <li key={line} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full bg-primary-foreground/20"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                  </svg>
                </span>
                <span className="text-[13.5px] leading-[1.5] text-primary-foreground/90">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="order-1 grid min-w-0 flex-[1_1_360px] place-items-center p-6 lg:order-2 lg:px-6 lg:py-11">
        <div className="w-full max-w-[360px] [animation:effy-fade_.3s_ease]">
          <Outlet />
        </div>
      </div>
    </div>
  ),
});

export const signInRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "sign-in",
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  component: SignInRouteComponent,
});

function SignInRouteComponent() {
  const { next } = signInRoute.useSearch();
  return <SignInScreen next={next} />;
}
