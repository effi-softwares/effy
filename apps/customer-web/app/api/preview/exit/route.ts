import { draftMode } from "next/headers"
import { NextResponse } from "next/server"

/**
 * Leave the draft preview (042 US3, T077).
 *
 * ⚠ A `POST`, AND IT MUST NEVER BE REACHABLE FROM A `<Link>`. Next prefetches links on hover and on
 * viewport entry — a GET exit behind a link would end the session before the operator ever clicked
 * it, and the page would snap back to published content while they were still reading the draft. It
 * would present as the preview randomly expiring, and it would be reproducible only by hovering.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const draft = await draftMode()
  draft.disable()

  const response = NextResponse.redirect(new URL("/", request.url), {
    // 303: the browser must follow with a GET. Without it the redirect repeats the POST at the new
    // location, which is not what "take me back to the ordinary page" means.
    status: 303,
  })
  response.cookies.delete("effy_preview_token")
  return response
}
