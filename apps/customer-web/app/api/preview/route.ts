import { draftMode } from "next/headers"
import { NextResponse } from "next/server"

/**
 * Enter a preview of the DRAFT home page (042 US3, T076).
 *
 * ⚠ IT LIVES AT THE APP ROOT, NOT INSIDE `(shop)`, so it inherits no storefront layout and stays
 * clear of the 011 Amplify quarantine boundary — `aws-amplify` may only be imported under
 * `app/(auth)/`, and dependency-cruiser enforces it by reachability. A route handler that pulled the
 * storefront layout's tree in would drag that graph with it.
 *
 * ⚠ IT IS A `GET`, and that is not laziness. The operator arrives here by opening a link in a new
 * tab from the back office; a POST would need a form or a fetch, and the whole point of the new-tab
 * design (research R5) is that the storefront is a DIFFERENT ORIGIN. An iframe would need a
 * third-party cookie, which Safari blocks by default — it would work on a developer's machine and
 * fail for the operator.
 *
 * The token is NOT verified here. Verification happens in the hot path, which holds the secret; this
 * route only carries the token into the draft session. An invalid one costs nothing: the hot path
 * serves published content, so a bad link shows the ordinary page rather than an error.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get("token")

  if (!token) {
    return NextResponse.json({ error: "a preview token is required" }, { status: 400 })
  }

  const draft = await draftMode()
  draft.enable()

  /**
   * ⚠ THE REDIRECT TARGET IS FIXED SERVER-SIDE AND CANNOT BE INFLUENCED BY THE REQUEST (T074).
   *
   * The obvious convenience — `?redirect=/wherever` — is an open redirect, and this one would be
   * unusually valuable: the attacker's link would first ENABLE A DRAFT SESSION and then bounce the
   * operator wherever it liked, on a domain they trust and had just authenticated against. There is
   * exactly one page with a preview, so there is nothing to parameterise.
   */
  const response = NextResponse.redirect(new URL("/", request.url))

  /**
   * ⚠ The token rides a session cookie so every subsequent render can present it to the hot path.
   * Draft Mode's own cookie says "you are previewing"; it carries no payload of ours.
   *
   * `httpOnly` because no client code needs it; `secure` because it grants access to unpublished
   * content; `sameSite: lax` because the operator ARRIVES from another origin (the back office) and
   * `strict` would drop the cookie on exactly that navigation — the one this route exists to serve.
   */
  response.cookies.set("effy_preview_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Matches the token's own 15-minute life. A cookie outliving its token would leave the operator
    // in a session that silently shows published content — the failure preview exists to prevent.
    maxAge: 15 * 60,
  })

  return response
}
