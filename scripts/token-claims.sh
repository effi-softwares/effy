#!/usr/bin/env bash
# Decode a Cognito ACCESS token's claims — settles research R6 (specs/007-shop-web).
#
#   usage: make shop-token-claims TOKEN=eyJ...
#
# WHY THIS EXISTS
#
# The shop and back-office pools both set `username_attributes = ["email"]`. In that configuration
# Cognito's internal username is widely reported to be a generated UUID, and a Cognito ACCESS token
# carries no `email` claim at all. We refused to guess that behaviour inside a migration, so:
#
#   • 007 made public.store_staff.email nullable, resolved it only when the token really carries an
#     address, and made the operator provisioning step authoritative.
#   • 005's /admin/v1/me does `claim("username") ?? sub` — if `username` is a UUID, admin.staff.email
#     is storing UUIDs today. Recorded at the tail of specs/005-back-office-web/plan.md.
#
# This script tells you which world you are in, in about ten seconds. It does NOT verify the
# signature — it only decodes the payload, so never treat its output as authenticated.
set -euo pipefail

TOKEN="${TOKEN:?TOKEN not set — paste a shop-pool ACCESS token}"

command -v python3 >/dev/null 2>&1 || { echo "python3 required"; exit 1; }

python3 - "$TOKEN" <<'PY'
import base64, json, sys

token = sys.argv[1].strip()
parts = token.split(".")
if len(parts) != 3:
    sys.exit("not a JWT (expected three dot-separated segments)")

payload = parts[1]
payload += "=" * (-len(payload) % 4)  # restore base64url padding
claims = json.loads(base64.urlsafe_b64decode(payload))

print(json.dumps(claims, indent=2, sort_keys=True))
print()

use = claims.get("token_use")
if use != "access":
    print(f"⚠  token_use = {use!r} — this is not an ACCESS token. The consoles send the access")
    print("   token as bearer; decode that one, or the answer below will be misleading.\n")

username = claims.get("username")
email = claims.get("email")

print("── research R6 ──")
print(f"  sub            {claims.get('sub')}")
print(f"  username       {username!r}")
print(f"  email          {email!r}")
print(f"  cognito:groups {claims.get('cognito:groups')}")
print()

if email:
    print("→ The access token DOES carry `email`. 007's first branch wins; nothing changes.")
elif isinstance(username, str) and "@" in username:
    print("→ No `email` claim, but `username` IS the address. 007's second branch wins.")
    print("  005's `claim(\"username\") ?? sub` happens to be correct here — verify before relying on it.")
else:
    print("→ CONFIRMED: no `email` claim, and `username` is an opaque id, not an address.")
    print("  • 007 is correct by construction: email is nullable and operator-authoritative.")
    print("  • 005 IS DEFECTIVE: /admin/v1/me writes this value into admin.staff.email.")
    print("    Fix per specs/005-back-office-web/plan.md § Follow-up raised by 007-shop-web.")
PY
