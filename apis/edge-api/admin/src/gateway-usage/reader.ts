// The only file that talks to API Gateway; the counting rules are tested without a network.
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

/** Every page, or the count reads as "plenty of room" on a full gateway. */
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
