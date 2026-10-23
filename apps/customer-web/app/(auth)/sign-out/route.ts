import { NextResponse } from "next/server"

import { siteUrl } from "@/lib/config"
import { endSession } from "@/lib/sign-out"

/**
 * POST /sign-out. A route handler, not a Server Action: the header reaches it by URL from a plain form,
 * so nothing on the guest path imports the session code (and it works without JavaScript). POST only:
 * a GET sign-out could be triggered by any `<img>` on the internet.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const form = await request.formData().catch(() => null)

  // "Sign out on all devices".
  const allDevices = form?.get("scope") === "all"

  await endSession({ allDevices })

  // The destination is a constant, never from the request (no open redirect), on `siteUrl`, never
  // `request.url` (behind Amplify's SSR proxy that is the internal localhost origin).
  const home = new URL("/", siteUrl())
  home.searchParams.set("reason", allDevices ? "signed-out-everywhere" : "signed-out")

  // The POST becomes a GET, so a reload does not re-submit.
  return NextResponse.redirect(home, 303)
}
