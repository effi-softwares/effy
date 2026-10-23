import { proxyToEdge } from "@/lib/api/proxy"

/**
 * Add every purchasable saved item to the cart.
 *
 * The server decides what is purchasable. A client filtering by its own copy of the verdict would
 * be re-implementing the four-term delivery predicate, and the two would drift.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  return proxyToEdge((c) => c.post("/commerce/v1/saved/add-to-cart", body))
}
