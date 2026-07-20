#!/usr/bin/env node
// ⚠ DEV-ONLY SCAFFOLD — 020 US3a (FR-030…FR-034).
//
// Marks a ready_for_pickup portion as collected by a PLACEHOLDER driver, so the fulfilment
// lifecycle can be exercised end to end before a driver surface exists.
//
// This exists as a LOCAL SCRIPT and not as an HTTP route on purpose. The operation accepts a
// caller-supplied driver identity; exposed as a deployed endpoint it would be an order-state
// forgery primitive — anyone able to reach the URL could mark any shop's order collected with no
// driver involved. There is therefore NO httpApi event for it in serverless.yml, in any stage, and
// `POST /shop/v1/fulfillments/{id}/pickup` correctly returns 404 everywhere (SC-013).
//
// Do NOT "improve" this by adding a route. REMOVAL TRIGGER: delete this file, the handler, and
// repository.collectViaStub() when the driver slice ships a real dispatch path (FR-034).
//
// Usage (requires the local env the shop service normally gets from SSM):
//   DB_HOST=… DB_PORT=… DB_NAME=… DB_USER=… DB_SECRET_ARN=… \
//   node scripts/invoke-pickup-stub.mjs <fulfillmentId> <operatorCognitoSub> [driverRef]

import { handler } from "../src/functions/fulfillment-pickup-v1-post.ts";

const [fulfillmentId, sub, driverRef = "test-driver-1"] = process.argv.slice(2);

if (!fulfillmentId || !sub) {
  console.error(
    "usage: node scripts/invoke-pickup-stub.mjs <fulfillmentId> <operatorCognitoSub> [driverRef]",
  );
  process.exit(1);
}

// The same event shape the gateway would deliver, so the handler's gate() runs unchanged — the
// operator still has to be an active member of an active shop, and the portion still has to be
// theirs and ready. The stub bypasses the ROUTE, never the authorization.
const event = {
  rawPath: `/shop/v1/fulfillments/${fulfillmentId}/pickup`,
  pathParameters: { id: fulfillmentId },
  body: JSON.stringify({ driverRef }),
  queryStringParameters: null,
  requestContext: {
    requestId: `local-${Date.now()}`,
    authorizer: { jwt: { claims: { sub } } },
  },
};

const context = { awsRequestId: `local-${Date.now()}`, callbackWaitsForEmptyEventLoop: true };

const res = await handler(event, context);
console.log(res.statusCode);
console.log(res.body);
process.exit(res.statusCode === 200 ? 0 : 1);
