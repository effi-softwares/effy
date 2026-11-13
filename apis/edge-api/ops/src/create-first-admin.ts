// make create-first-admin EMAIL=… NAME="…" ENV=dev - the break-glass way to make a back-office Administrator (119
// FR-034): the same team record and history as Settings › Team and access, signed "Operator". The email is always an
// argument, never inferred from the machine. The database password stays inside DB_DSN, never on the command line.
import * as cognito from "@aws-sdk/client-cognito-identity-provider";
import { cognitoSignIn } from "@effy/edge-shared/team";

import { clientTransactor, createFirstAdmin, validateInput } from "./admin-bootstrap";
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

  const port = cognitoSignIn(new cognito.CognitoIdentityProviderClient({ region }), poolId, cognito);
  const result = await withDatabase((db) => createFirstAdmin(port, clientTransactor(db), email, name));
  console.log(JSON.stringify(result, null, 2));
});
