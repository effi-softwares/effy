// make create-first-admin EMAIL=… NAME="…" ENV=dev — bootstrap the first back-office administrator.
//
// ⚠ THE EMAIL IS ALWAYS AN ARGUMENT. It is never defaulted from the environment, the git user or
// anything else this machine happens to expose: an address being visible is not consent to use it
// (constitution, Real-World Identifiers). No argument, no run.
//
// Non-secret configuration arrives in the environment from the make target; the database password
// is inside DB_DSN and never on the command line.
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

import { cognitoIdentityProvider, createFirstAdmin, staffRecords, validateInput } from "./admin-bootstrap";
import { parseFlags, runTool, withDatabase } from "./db";

runTool("create-first-admin", async () => {
  const flags = parseFlags(process.argv.slice(2), { email: "string", name: "string" });
  const email = typeof flags.email === "string" ? flags.email : "";
  const name = typeof flags.name === "string" ? flags.name : "";
  if (email === "") throw new Error("--email is required");
  validateInput(email, name); // before anything is touched

  const poolId = process.env.BACK_OFFICE_POOL_ID;
  const region = process.env.AWS_REGION;
  if (!poolId || !region || !process.env.DB_DSN) {
    throw new Error("missing required env: BACK_OFFICE_POOL_ID, DB_DSN, AWS_REGION must all be set (use `make create-first-admin`)");
  }

  const result = await withDatabase((db) =>
    createFirstAdmin(cognitoIdentityProvider(new CognitoIdentityProviderClient({ region }), poolId), staffRecords(db), email, name),
  );
  // To the operator, on stdout: their own input echoed back with what was done. No secret is in it.
  console.log(JSON.stringify(result, null, 2));
});
