import { NextResponse } from "next/server"

import { proxyToEdge } from "@/lib/api/proxy"
import { getSession } from "@/lib/dal"
import { edgeApiBaseUrl } from "@/lib/config"

/**
 * The order's tax invoice and adjustment notes: `?doc={number}` downloads one as a PDF,
 * otherwise the list as JSON. The first request issues the invoice - it is on request, never on
 * page view, so a customer can add their business details first.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const doc = new URL(request.url).searchParams.get("doc")
  const path = `/commerce/v1/orders/${encodeURIComponent(id)}/tax-documents`
  if (!doc) return proxyToEdge((c) => c.get(path))

  const session = await getSession()
  if (!session?.idToken) return NextResponse.json({ error: "authentication required" }, { status: 401 })
  const res = await fetch(`${edgeApiBaseUrl()}${path}?doc=${encodeURIComponent(doc)}&format=pdf`, {
    headers: { Authorization: `Bearer ${session.idToken}` },
    cache: "no-store",
  })
  if (!res.ok) return NextResponse.json({ error: "unavailable" }, { status: res.status === 403 ? 401 : res.status >= 500 ? 502 : res.status })
  return new NextResponse(await res.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": res.headers.get("content-disposition") ?? 'attachment; filename="effy-tax-invoice.pdf"',
      "Cache-Control": "private, no-store",
    },
  })
}
