# `scripts/` — operator verification helpers

Small, reviewable scripts for the checks that **cannot be unit-tested**, invoked through the
Makefile so nobody has to copy a `curl` out of a markdown file.

They are not infrastructure (`infra/scripts/` holds the Terraform/DB plumbing: `db-dsn.sh`,
`preflight.sh`). They verify a *deployed slice* against its spec's success criteria.

| Script | `make` target | Proves |
|---|---|---|
| `verify-cross-pool.sh` | `shop-verify-isolation` | SC-004 — a credential is usable only against its own audience, **both directions** |
| `verify-manager-gate.sh` | `shop-verify-gate` | SC-005 / SC-005a — the manager gate is decided from the platform record (role AND status AND store scope), and its denial names no term |
| `token-claims.sh` | `shop-token-claims` | research R6 — whether a Cognito access token carries `email`, and whether `username` is an address or a UUID |

### `EXPECT_STORE` — which half of the gate has data

007 ships the store schema but **no way to create a store** (that is back-office store management,
the next slice). The gate's predicate inner-joins `public.store`, so:

```bash
make shop-verify-gate …                    # EXPECT_STORE=0 (default, pre-store-management)
                                           #   asserts the manager is REFUSED for lack of a store
make shop-verify-gate … EXPECT_STORE=1     # once a store exists and the manager is assigned
                                           #   asserts the manager is SERVED
```

Both settings prove the gate. What changes is which side of it there is data for. The `0` case is
not a weaker check — a `store_manager` holding the role in `cognito:groups` and still being refused
is the clearest possible demonstration that the **platform record, not the token, decides**.

## Why these are scripts and not tests

Two of this platform's most important guarantees live outside application code:

- **Cross-pool isolation** is enforced by the shared gateway's per-pool JWT authorizers. A vitest
  assertion could only prove that a fixture *I wrote* is shaped the way I expect — it would tell you
  nothing about the deployed gate. So it is a `curl` against the real gateway with two real tokens.
- **Store-scoped authorization** is enforced by a SQL join. Mocking the `pg` seam proves the query
  text; only a real database proves the query's *meaning*.

Asserting either in a unit test would be theater. See `specs/007-shop-web/research.md` R9.

Each script exits non-zero on failure and prints what the specific failure code *means* — a `403`
where a `401` belongs is a different bug from a `200` on a cross-pool call, and the difference
matters more than the fact that something went wrong.

## Conventions

- `bash`, `set -euo pipefail`, shellcheck-clean.
- Required inputs are `${VAR:?message}` — the script refuses to run half-configured rather than
  silently testing nothing.
- Tokens arrive by environment variable, never argv, so they stay out of shell history.
