import { proxyToCore } from "@/lib/api/proxy"

/**
 * The account cart, re-priced (027).
 *
 * Every route under `app/api/cart/` proxies to the CORE api with the SERVER session, so no client module
 * ever reaches `aws-amplify` and the storefront's quarantine guard stays green (011 FR-006 / D11).
 */
export async function GET() {
  return proxyToCore((c) => c.get("/v1/cart"))
}

/**
 * Empty the payable cart (FR-032). Set-aside items deliberately survive it (FR-030).
 *
 * ⚠ The `PUT` that used to live here is GONE. It was 019 Option B's whole-cart replace, fired once at
 * checkout entry, and it is the one operation that lets a client delete a line it has never heard of. The
 * platform is authoritative now, and the absence of that operation is what makes a stale device
 * structurally harmless (specs/027-customer-cart-sync/research.md R0/R1).
 */
export async function DELETE(req: Request) {
  const changeId = new URL(req.url).searchParams.get("changeId") ?? ""
  return proxyToCore((c) => c.delete(`/v1/cart?changeId=${encodeURIComponent(changeId)}`))
}
