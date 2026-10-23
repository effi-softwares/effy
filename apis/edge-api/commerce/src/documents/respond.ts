import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import { problem, type RequestScope } from "@effy/edge-shared";

export function pdfResponse(bytes: Uint8Array, filename: string): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 200,
    isBase64Encoded: true,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
    body: Buffer.from(bytes).toString("base64"),
  };
}

/** With a named type the client words itself. */
export function documentConflict(scope: RequestScope, code: string, detail: string): APIGatewayProxyStructuredResultV2 {
  return problem(409, `https://effyshopping.com/problems/${code}`, "Not available yet", detail, scope);
}
