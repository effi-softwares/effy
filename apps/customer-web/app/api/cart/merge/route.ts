import { proxyToEdge } from "@/lib/api/proxy"

/** Folds the device cart into the account cart at sign-in, taking the maximum quantity per line: nothing is lost and a retry changes nothing. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({ lines: [] }))
  return proxyToEdge((c) => c.post("/commerce/v1/cart/merge", body))
}
