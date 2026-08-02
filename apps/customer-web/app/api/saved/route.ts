import { proxyToCore } from "@/lib/api/proxy"

/**
 * The saved list with verdicts (033).
 *
 * ⚠ Takes `postcode` from the query because the shopper's delivery location is DEVICE-LOCAL — it
 * lives in localStorage and deliberately not in a cookie, so the server cannot read it during
 * rendering. Absent means "we have not been told", which is a first-class outcome (FR-038), not an
 * error.
 */
export async function GET(req: Request) {
  const postcode = new URL(req.url).searchParams.get("postcode")
  const qs = postcode ? `?postcode=${encodeURIComponent(postcode)}` : ""
  return proxyToCore((c) => c.get(`/v1/saved${qs}`))
}
