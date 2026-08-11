import { ConfigureAmplify } from "./ConfigureAmplify"
import { BrandPanel } from "./_components/BrandPanel"

/**
 * The (auth) route group — sign-in, sign-up, and the OAuth callback.
 *
 * These pages are PUBLIC (a guest must be able to reach sign-up), but they are the only pages in
 * the application that load the authentication SDK. That containment is the whole reason this
 * route group exists.
 *
 * ⚠ NO HEADER AND NO BRAND MARK (operator direction, 2026-08-11). The step content fills the
 * viewport from the top edge.
 *
 * ⚠ ONE CONSEQUENCE, RECORDED RATHER THAN DISCOVERED LATER. The brand mark was the only link out of
 * this route group. A guest sent here from checkout could press it to decline the demand and carry
 * on browsing — that is 011's FR-021 ("declining is not punished") and it has an end-to-end test
 * asserting exactly that click. With the header gone, the browser's own back button is the only way
 * out of the FIRST step of each journey; later steps still have their own "Back". If that route back
 * to the shop is wanted, it belongs in the step footer beside "Don't have an account? Join" rather
 * than as a returning header.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    /*
     * ⚠ `bg-background`, NOT `pageSurface` (`bg-card`). The auth screens compose the storefront's own
     * field primitive, whose ground is `bg-card`. On a `bg-card` page that is card-on-card: in the
     * light appearance both tokens are `#ffffff`, so a field would have had nothing but a hairline
     * border to distinguish it from the page.
     *
     * ⚠ `100svh`, not `100vh`. A software keyboard does not shrink `vh`, so a column measured in it
     * reports a viewport that is no longer there and pushes the bottom-anchored action underneath the
     * keyboard. `svh` is the small viewport — the one that is actually visible (FR-027).
     */
    <div className="flex min-h-svh bg-background text-foreground">
      <ConfigureAmplify />

      {/*
        ⚠ ONE COLUMN ON A PHONE, TWO ON A DESKTOP (FR-028, defect D-20). A 1440px window used to be a
        384px column of form stranded in the middle of an otherwise empty white page.

        ⚠ CENTRED AT EVERY WIDTH. This used to stretch below `sm` so that a bottom-anchored action
        could reach the foot of the phone screen — but it stretched EVERY step, including the ones
        whose `bottom` is just the "Join" footer, so the sign-in form sat at the top of the screen
        with a few hundred pixels of nothing beneath it. Anchoring is now the step's own decision
        (`StepShell`'s `anchor`), and the layout's job is simply to centre what it is given.
      */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 lg:px-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>

      <BrandPanel />
    </div>
  )
}
