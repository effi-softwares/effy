import { proxyToEdge } from "@/lib/api/proxy"

/**
 * The account cart, re-priced.
 *
 * Every route under `app/api/cart/` proxies to the core api with the server session, so no client module
 * ever reaches `aws-amplify` and the storefront's quarantine guard stays green.
 */
export async function GET() {
  return proxyToEdge((c) => c.get("/commerce/v1/cart"))
}

/** Empties the payable cart; set-aside items survive. There is no whole-cart replace, so a stale device cannot delete a line it never knew. */
export async function DELETE(req: Request) {
  const changeId = new URL(req.url).searchParams.get("changeId") ?? ""
  return proxyToEdge((c) => c.delete(`/commerce/v1/cart?changeId=${encodeURIComponent(changeId)}`))
}
