import { proxyToEdge } from "@/lib/api/proxy"

/** Fold a device-held guest list into the account on sign-in (033 FR-028). Idempotent. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({ items: [] }))
  return proxyToEdge((c) => c.post("/commerce/v1/saved/merge", body))
}
