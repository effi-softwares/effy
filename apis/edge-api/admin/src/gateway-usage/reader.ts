// The ONLY file that talks to API Gateway (075). Everything above it takes a `GatewayReader`, so the
// counting rules are tested without a network and this file holds nothing worth testing but paging.
import { ApiGatewayV2Client, GetIntegrationsCommand, GetRoutesCommand } from "@aws-sdk/client-apigatewayv2"

export interface GatewayReader {
  countRoutes(apiId: string): Promise<number>
  countIntegrations(apiId: string): Promise<number>
}

let client: ApiGatewayV2Client | undefined
function gateway(): ApiGatewayV2Client {
  client ??= new ApiGatewayV2Client({})
  return client
}

/**
 * ⚠ EVERY PAGE, OR THE NUMBER IS A LIE. Both calls return at most a page at a time, and a count of
 * the first page reads as "plenty of room" on a gateway that is full — which is the one moment the
 * number matters. The page size is left to the service; the loop ends only when no token comes back.
 */
async function countAll(page: (token: string | undefined) => Promise<{ count: number; next: string | undefined }>): Promise<number> {
  let total = 0
  let token: string | undefined
  do {
    const { count, next } = await page(token)
    total += count
    token = next
  } while (token)
  return total
}

export const apiGatewayReader: GatewayReader = {
  countRoutes: (apiId) =>
    countAll(async (token) => {
      const res = await gateway().send(new GetRoutesCommand({ ApiId: apiId, NextToken: token }))
      return { count: res.Items?.length ?? 0, next: res.NextToken }
    }),
  countIntegrations: (apiId) =>
    countAll(async (token) => {
      const res = await gateway().send(new GetIntegrationsCommand({ ApiId: apiId, NextToken: token }))
      return { count: res.Items?.length ?? 0, next: res.NextToken }
    }),
}
