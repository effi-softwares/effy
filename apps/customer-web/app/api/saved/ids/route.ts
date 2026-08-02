import { proxyToCore } from "@/lib/api/proxy"

/**
 * The membership read (033) — the shopper's whole set of saved product ids.
 *
 * ⚠ ONE request per screen, regardless of how many products it shows (FR-020). An `isSaved` field on
 * catalogue reads would make every product response shopper-specific and destroy the static shell;
 * a per-product lookup would be one request per tile.
 *
 * A guest gets `401` here, which is a NORMAL state meaning "you are a guest" — the client falls back
 * to its device-local mirror rather than treating it as a failure.
 */
export async function GET() {
  return proxyToCore((c) => c.get("/v1/saved/ids"))
}
