import { proxyToEdge } from "@/lib/api/proxy"

/** The signed-in customer's notification choices and offers consent (111). */
export async function GET() {
  return proxyToEdge((c) => c.get("/customer/v1/notification-preferences"))
}

/** Change choices or give/withdraw consent, all or nothing (111). The website is always the `web` surface. */
export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  return proxyToEdge((c) => c.patch("/customer/v1/notification-preferences", { ...body, surface: "web" }))
}
