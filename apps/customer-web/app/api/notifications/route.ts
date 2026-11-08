import { proxyToEdge } from "@/lib/api/proxy"

/** One page of the signed-in customer's notification inbox (110). Only the inbox's own filters pass through. */
export async function GET(req: Request) {
  const from = new URL(req.url).searchParams
  const q = new URLSearchParams()
  for (const key of ["filter", "category", "cursor", "limit"]) {
    const v = from.get(key)
    if (v) q.set(key, v)
  }
  const qs = q.toString()
  return proxyToEdge((c) => c.get(`/customer/v1/notifications${qs ? `?${qs}` : ""}`))
}
