# tflint config for all Terraform under infra/ (research.md D12).
# Run via `make lint` (tflint --recursive from infra/, --minimum-failure-severity=error).

plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

plugin "aws" {
  enabled = true
  version = "0.45.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}

# qa/staging/prod roots declare pool variables ahead of promotion (authored-but-unapplied);
# unused-declaration findings stay visible as warnings but must not fail the lint gate.
rule "terraform_unused_declarations" {
  enabled = true
}
