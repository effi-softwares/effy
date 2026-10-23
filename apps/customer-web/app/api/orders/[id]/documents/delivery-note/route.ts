import { NextResponse } from "next/server"

import { getSession } from "@/lib/dal"
import { edgeApiBaseUrl } from "@/lib/config"

/**
 * The delivery note as a PDF, downloaded through the storefront's own server so the session
 * never leaves its cookies. The JSON client cannot carry bytes, so this one call is a plain
 * fetch with the same credential `edgeApi` sends.
 *
 * A refusal is relayed as its status only — 404 for not-yours, 409 before delivery — never the
 * service's prose.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session?.idToken) return NextResponse.json({ error: "authentication required" }, { status: 401 })
  const res = await fetch(`${edgeApiBaseUrl()}/commerce/v1/orders/${encodeURIComponent(id)}/delivery-note?format=pdf`, {
    headers: { Authorization: `Bearer ${session.idToken}` },
    cache: "no-store",
  })
  if (!res.ok) return NextResponse.json({ error: "unavailable" }, { status: res.status === 403 ? 401 : res.status >= 500 ? 502 : res.status })
  return new NextResponse(await res.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": res.headers.get("content-disposition") ?? 'attachment; filename="effy-delivery-note.pdf"',
      "Cache-Control": "private, no-store",
    },
  })
}
