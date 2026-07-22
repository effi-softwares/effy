#!/usr/bin/env node
// ⚠ DEV-ONLY SCAFFOLD — the 020 driver-stub tail (picked up → delivered).
//
// Marks a `collected` portion `delivered` by a PLACEHOLDER driver, so the full lifecycle
// (received → picking → ready_for_pickup → collected → delivered) can be exercised end to end
// before a driver surface exists. Pairs with invoke-pickup-stub.mjs.
//
// A LOCAL SCRIPT, never an HTTP route — same reason as the pickup stub: it accepts a caller-supplied
// driver identity, so a deployed endpoint would be an order-state forgery primitive. `POST
// /shop/v1/fulfillments/{id}/deliver` is 404 everywhere.
//
// Do NOT "improve" this by adding a route. REMOVAL TRIGGER: delete this file, the handler, and
// service/repository.deliverViaStub() when the driver slice ships a real dispatch path (FR-034).
//
// Usage (requires the local env the shop service normally gets from SSM):
//   DB_HOST=… DB_PORT=… DB_NAME=… DB_USER=… DB_SECRET_ARN=… \
//   node scripts/invoke-deliver-stub.mjs <fulfillmentId> <operatorCognitoSub> [driverRef]

import { handler } from "../src/functions/fulfillment-deliver-v1-post.ts";

const [fulfillmentId, sub, driverRef = "test-driver-1"] = process.argv.slice(2);

if (!fulfillmentId || !sub) {
  console.error(
    "usage: node scripts/invoke-deliver-stub.mjs <fulfillmentId> <operatorCognitoSub> [driverRef]",
  );
  process.exit(1);
}

// The same event shape the gateway would deliver, so the handler's gate() runs unchanged — the
// operator still has to be an active member of an active shop, and the portion still has to be
// theirs and collected. The stub bypasses the ROUTE, never the authorization.
const event = {
  rawPath: `/shop/v1/fulfillments/${fulfillmentId}/deliver`,
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
