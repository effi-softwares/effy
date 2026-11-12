import { appleAssociation, wellKnown } from "@/lib/app-links"

/** 116 B7 - iPhone universal links. 404 until the paid Apple account's team id is set (`apple_team_id`). */
// Prerendered at build (it reads no request data): a change to the identity needs a customer-web redeploy.

export function GET() {
  return wellKnown(appleAssociation(process.env.APP_LINK_APPLE_APP_ID))
}
