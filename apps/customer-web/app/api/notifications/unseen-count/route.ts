import { NextResponse } from "next/server"

import { proxyToEdge } from "@/lib/api/proxy"
import { getSession } from "@/lib/dal"

/** The bell (110). A guest has no bell: 204, and nothing is asked of the backend. */
export async function GET() {
  if (!(await getSession())) return new NextResponse(null, { status: 204 })
  return proxyToEdge((c) => c.get("/customer/v1/notifications/unseen-count"))
}
