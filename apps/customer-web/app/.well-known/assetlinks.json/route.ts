import { assetLinks, wellKnown } from "@/lib/app-links"

/** 116 B7 - Android App Links: the customer app may open Effy's shopper links. 404 until the operator supplies the key. */
// Prerendered at build (it reads no request data): a change to the identity needs a customer-web redeploy.

export function GET() {
  return wellKnown(assetLinks(process.env.APP_LINK_ANDROID_SHA256))
}
