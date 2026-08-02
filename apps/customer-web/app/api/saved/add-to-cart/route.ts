import { proxyToCore } from "@/lib/api/proxy"

/**
 * Add every purchasable saved item to the cart (033 FR-051).
 *
 * ⚠ The SERVER decides what is purchasable. A client filtering by its own copy of the verdict would
 * be re-implementing the four-term delivery predicate, and the two would drift.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  return proxyToCore((c) => c.post("/v1/saved/add-to-cart", body))
}
