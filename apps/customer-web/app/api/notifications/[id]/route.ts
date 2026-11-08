import { proxyToEdge } from "@/lib/api/proxy"

/** Archive one of the customer's own notifications, or undo it (110). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { archived } = (await req.json().catch(() => ({}))) as { archived?: unknown }
  return proxyToEdge((c) => c.patch(`/customer/v1/notifications/${encodeURIComponent(id)}`, { archived }))
}
