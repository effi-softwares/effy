import { proxyToEdge } from "@/lib/api/proxy"

/** A tap: the notification is read (109's route). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyToEdge((c) => c.post(`/customer/v1/notifications/${encodeURIComponent(id)}/read`))
}
