import { proxyToCore } from "@/lib/api/proxy"

/**
 * The shopper's lists (068). With `?productId=`, each list also says whether it holds that product —
 * the list chooser's one request.
 *
 * ⚠ A `401` here is not a failure: it means "you are a guest", and the chooser reads it as the
 * moment to say lists need an account.
 */
export async function GET(req: Request) {
  const productId = new URL(req.url).searchParams.get("productId")
  const query = productId ? `?productId=${encodeURIComponent(productId)}` : ""
  return proxyToCore((c) => c.get(`/v1/lists${query}`))
}

/** Create a list, optionally placing one product in it in the same action. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  return proxyToCore((c) => c.post("/v1/lists", body))
}
