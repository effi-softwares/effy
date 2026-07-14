import { NextResponse } from "next/server"

import { endSession } from "@/lib/sign-out"

/**
 * POST /sign-out — the storefront's sign-out (012 FR-028 … FR-031).
 *
 * ⚠⚠ WHY THIS IS A ROUTE HANDLER AND NOT A SERVER ACTION. ⚠⚠
 *
 * The header's sign-out button is reachable from EVERY page, including every page a guest sees. So
 * whatever the header imports lands on the guest path.
 *
 * A Server Action would have to be IMPORTED by the header component. And `signOut` needs the session,
 * which needs `lib/dal.ts`, which imports `aws-amplify/auth/server`. Next erases that at the
 * `"use server"` boundary and would not actually ship the SDK — but `depcruise` (correctly) refuses
 * to reason about that, and its `reachable: true` rule fired the moment the header acquired a path to
 * `aws-amplify`. It was right to: the rule exists BECAUSE 011's first version only checked direct
 * imports and missed a real leak that arrived through a component. A guard you weaken the first time
 * it inconveniences you is not a guard.
 *
 * A ROUTE HANDLER is reached by a **URL, not an import**. The header renders
 * `<form action="/sign-out" method="post">` — a string. There is no module edge from
 * `components/header/` to Amplify at all, so the guard passes for the right reason rather than a
 * suppressed one.
 *
 * ⚠ AND IT IS BETTER: a plain HTML form works with **zero JavaScript**. Sign-out costs the guest
 * bundle nothing whatsoever, and it keeps working if the client JS never loads.
 *
 * ⚠ POST, never GET. A GET sign-out is triggerable by any `<img src="/sign-out">` on any page on the
 * internet — a CSRF logout. Browsers do not preflight or prefetch cross-origin POSTs into navigation,
 * and Next's Server-Action/route-handler origin checks apply.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const form = await request.formData().catch(() => null)

  // "Sign out on all devices" (FR-032) — the remedy for a hotel PC, or a phone left on a train.
  const allDevices = form?.get("scope") === "all"

  await endSession({ allDevices })

  // ⚠ The destination is a CONSTANT, never taken from the request. An open redirect on the sign-out
  // route would let an attacker bounce a customer to a lookalike sign-in page at the exact moment
  // they expect to be asked for credentials (FR-031). The storefront already refuses open redirects
  // elsewhere; the same law applies here.
  const home = new URL("/", request.url)
  home.searchParams.set("reason", allDevices ? "signed-out-everywhere" : "signed-out")

  // 303: turn the POST into a GET so a reload of the destination does not re-submit the sign-out.
  return NextResponse.redirect(home, 303)
}
