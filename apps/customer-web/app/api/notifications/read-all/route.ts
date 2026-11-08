import { proxyToEdge } from "@/lib/api/proxy"

/** Mark all read, up to `before` (110). */
export async function POST(req: Request) {
  const { before } = (await req.json().catch(() => ({}))) as { before?: unknown }
  return proxyToEdge((c) => c.post("/customer/v1/notifications/read-all", { before }))
}
