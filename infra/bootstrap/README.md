# infra/bootstrap — run me FIRST, once

Creates the single hardened S3 bucket that stores Terraform state for **all** environments
(`envs/<env>/terraform.tfstate` keys, S3-native lockfile — no DynamoDB). It runs on **local
state** because you can't store state in a bucket that doesn't exist yet (research.md D3).

**The operator runs this by hand — never Claude, never CI.**

## One-time procedure

1. Edit [terraform.tfvars](./terraform.tfvars): set `aws_account_id` to the real 12-digit
   account id (the `REPLACE_…` placeholder fails validation on purpose).
2. From the repo root:

   ```sh
   make bootstrap-init
   make bootstrap-apply     # review the plan, type "yes"
   ```

**Expected**: bucket `effy-apse2-tfstate` — versioned, SSE-encrypted, all public access
blocked, non-TLS requests denied, `prevent_destroy` set.

Then wire up the first environment:

```sh
make init ENV=dev
make plan ENV=dev
```

## Notes

- **This root's own state** (`terraform.tfstate`) stays on your machine and is git-ignored.
  It is tiny and rarely changes. Optional follow-up: migrate it into the bucket it created
  with a `backend "s3"` block + `terraform init -migrate-state` (not required for
  correctness).
- **Bucket name is the backend contract.** Every `infra/envs/*/backend.tf` references
  `effy-apse2-tfstate` literally (Terraform backends cannot use variables). If you must
  rename: change `state_bucket_name` here **and** all four `backend.tf` files.
- The bucket's region (`ap-southeast-2`) is independent of any environment's `aws_region` —
  relocating an env does not move its state.
