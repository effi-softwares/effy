import { proxyToCore } from "@/lib/api/proxy"

/**
 * Remove a kept card (051 FR-024).
 *
 * ⚠ Ownership is verified SERVER-SIDE before anything is detached. The id arrives from the client, so
 * a route that trusted it would let one shopper remove another's card by guessing an id (FR-026). A
 * card that is not this shopper's answers 404 — deliberately indistinguishable from "no such card", so
 * the route cannot be used as an oracle for which payment-method ids exist.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyToCore((c) => c.delete(`/v1/payment-methods/${encodeURIComponent(id)}`))
}
