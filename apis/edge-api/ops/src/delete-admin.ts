// make delete-admin EMAIL=… ENV=dev [FORCE=1] — COMPLETELY remove a back-office administrator from
// the identity provider and the platform's staff record. Irreversible; the make target confirms.
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

import { cognitoIdentityProvider, deleteAdmin, staffRecords } from "./admin-bootstrap";
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

  const result = await withDatabase((db) =>
    deleteAdmin(cognitoIdentityProvider(new CognitoIdentityProviderClient({ region }), poolId), staffRecords(db), email, flags.force === true),
  );
  console.log(JSON.stringify(result, null, 2));
});
