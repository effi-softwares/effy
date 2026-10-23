import { proxyToEdge } from "@/lib/api/proxy"

/** The buyer's own business name and ABN for this order's tax invoice. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { businessName?: unknown; abn?: unknown }
  return proxyToEdge((c) =>
    c.put(`/commerce/v1/orders/${encodeURIComponent(id)}/business-identity`, {
      businessName: typeof body.businessName === "string" ? body.businessName : null,
      abn: typeof body.abn === "string" ? body.abn : null,
    }),
  )
}
