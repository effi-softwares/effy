// make create-first-admin EMAIL=… NAME="…" ENV=dev
// the email is always an argument, never inferred from the machine. The database password stays
// inside DB_DSN, never on the command line.
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

import { cognitoIdentityProvider, createFirstAdmin, staffRecords, validateInput } from "./admin-bootstrap";
import { parseFlags, runTool, withDatabase } from "./db";

runTool("create-first-admin", async () => {
  const flags = parseFlags(process.argv.slice(2), { email: "string", name: "string" });
  const email = typeof flags.email === "string" ? flags.email : "";
  const name = typeof flags.name === "string" ? flags.name : "";
  if (email === "") throw new Error("--email is required");
  validateInput(email, name);

  const poolId = process.env.BACK_OFFICE_POOL_ID;
  const region = process.env.AWS_REGION;
  if (!poolId || !region || !process.env.DB_DSN) {
    throw new Error("missing required env: BACK_OFFICE_POOL_ID, DB_DSN, AWS_REGION must all be set (use `make create-first-admin`)");
  }

  const result = await withDatabase((db) =>
    createFirstAdmin(cognitoIdentityProvider(new CognitoIdentityProviderClient({ region }), poolId), staffRecords(db), email, name),
  );
  console.log(JSON.stringify(result, null, 2));
});
