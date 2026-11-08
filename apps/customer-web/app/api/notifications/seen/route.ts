import { proxyToEdge } from "@/lib/api/proxy"

/** Opening the inbox: everything up to `before` is seen (110). */
export async function POST(req: Request) {
  const { before } = (await req.json().catch(() => ({}))) as { before?: unknown }
  return proxyToEdge((c) => c.post("/customer/v1/notifications/seen", { before }))
}
