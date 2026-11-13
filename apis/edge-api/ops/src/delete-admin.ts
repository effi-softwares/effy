// make delete-admin EMAIL=… ENV=dev [FORCE=1]. Disables and removes the person through the team's one writer (the
// record is KEPT, marked Removed, so their name stays on what they did - 119 FR-019, FR-034) and deletes their sign-in
// account. Refuses the last active Administrator unless forced. Irreversible for the account; the make target confirms.
import * as cognito from "@aws-sdk/client-cognito-identity-provider";
import { cognitoSignIn } from "@effy/edge-shared/team";

import { clientTransactor, deleteAdmin } from "./admin-bootstrap";
import { parseFlags, runTool, withDatabase } from "./db";

runTool("delete-admin", async () => {
  const flags = parseFlags(process.argv.slice(2), { email: "string", force: "boolean" });
  const email = typeof flags.email === "string" ? flags.email : "";
  if (email === "") throw new Error("--email is required");

  const poolId = process.env.BACK_OFFICE_POOL_ID;
  const region = process.env.AWS_REGION;
  if (!poolId || !region || !process.env.DB_DSN) {
    throw new Error("missing required env: BACK_OFFICE_POOL_ID, DB_DSN, AWS_REGION must all be set (use `make delete-admin`)");
  }

  const port = cognitoSignIn(new cognito.CognitoIdentityProviderClient({ region }), poolId, cognito);
  const result = await withDatabase((db) => deleteAdmin(port, clientTransactor(db), email, flags.force === true));
  console.log(JSON.stringify(result, null, 2));
});
