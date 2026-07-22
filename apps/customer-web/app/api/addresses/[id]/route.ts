import { proxyToEdge } from "@/lib/api/proxy"

/**
 * Edit / set-default (PATCH) and delete (DELETE) a single address (022, US3/US4/US5).
 *
 * Customer-profile capability → the COLD path (edge-api/customer), per the routing law (011 FR-028).
 * Both forward to `/customer/v1/addresses/{id}`. The DELETE endpoint's server-side delete-default
 * guard surfaces a **409** for "you can't delete the default while other addresses exist" (FR-016a);
 * the proxy relays that status untouched so the client can map it to the reassign prompt. A 404
 * relays as a benign "already gone".
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  return proxyToEdge((c) => c.patch(`/customer/v1/addresses/${id}`, body))
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyToEdge((c) => c.delete(`/customer/v1/addresses/${id}`))
}
