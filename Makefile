# Effy — root Makefile
#
# Single operator entry point for the Terraform infrastructure under infra/
# (contract: specs/001-infra-foundation/contracts/makefile-targets.contract.md).
#
#   make <target> ENV=<dev|qa|staging|prod>     # ENV defaults to dev
#
# Every target wraps the underlying command in AWS_PROFILE=ef so both the AWS
# provider and the S3 state backend resolve the `ef` credentials (FR-017/FR-018).
# `apply` / `destroy` keep Terraform's interactive approval — NO -auto-approve
# anywhere; a human always confirms mutating actions (FR-015).

AWS_PROFILE ?= ef
ENV         ?= dev

INFRA_DIR     := infra
BOOTSTRAP_DIR := $(INFRA_DIR)/bootstrap
ENV_DIR       := $(INFRA_DIR)/envs/$(ENV)
TF            := AWS_PROFILE=$(AWS_PROFILE) terraform

# All Terraform roots (for fmt-check / validate / lint sweeps).
TF_ROOTS := $(BOOTSTRAP_DIR) $(INFRA_DIR)/envs/dev $(INFRA_DIR)/envs/qa $(INFRA_DIR)/envs/staging $(INFRA_DIR)/envs/prod

.PHONY: help bootstrap-init bootstrap-apply init plan apply destroy output fmt validate lint preflight

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

## --- One-time state backend (run FIRST, once — see infra/bootstrap/README.md) ---

bootstrap-init: ## Init the bootstrap root (local state)
	cd $(BOOTSTRAP_DIR) && $(TF) init

bootstrap-apply: ## OPERATOR: create the S3 state bucket (one-time, interactive approval)
	cd $(BOOTSTRAP_DIR) && $(TF) apply

## --- Per-environment workflow (ENV=dev|qa|staging|prod) ---

init: ## Init an env root (configures the S3 backend)
	cd $(ENV_DIR) && $(TF) init

plan: ## Preview changes for an env (never mutates)
	cd $(ENV_DIR) && $(TF) plan -var-file=$(ENV).tfvars

apply: preflight ## OPERATOR: apply an env (interactive approval — never auto-approved)
	cd $(ENV_DIR) && $(TF) apply -var-file=$(ENV).tfvars

destroy: preflight ## OPERATOR: destroy an env (interactive approval)
	cd $(ENV_DIR) && $(TF) destroy -var-file=$(ENV).tfvars

output: ## Show an env's outputs
	cd $(ENV_DIR) && $(TF) output

## --- Hygiene (no AWS calls, never applies) ---

fmt: ## Format all Terraform under infra/
	terraform fmt -recursive $(INFRA_DIR)

validate: ## Validate one env root (ENV=...); backend not required
	cd $(ENV_DIR) && $(TF) init -backend=false -input=false > /dev/null && $(TF) validate

lint: ## fmt-check + validate every root + tflint + trivy/checkov config scan
	terraform fmt -check -recursive $(INFRA_DIR)
	@for dir in $(TF_ROOTS); do \
		echo "==> validate $$dir"; \
		(cd $$dir && $(TF) init -backend=false -input=false > /dev/null && $(TF) validate) || exit 1; \
	done
	@if command -v tflint > /dev/null 2>&1; then \
		echo "==> tflint"; \
		(cd $(INFRA_DIR) && tflint --init > /dev/null && tflint --recursive --minimum-failure-severity=error --config "$$PWD/.tflint.hcl"); \
	else \
		echo "WARN: tflint not installed — skipping (brew install terraform-linters/tflint/tflint)"; \
	fi
	@if command -v trivy > /dev/null 2>&1; then \
		echo "==> trivy config"; \
		trivy config --exit-code 1 --severity HIGH,CRITICAL $(INFRA_DIR); \
	elif command -v checkov > /dev/null 2>&1; then \
		echo "==> checkov"; \
		checkov --directory $(INFRA_DIR) --quiet --compact; \
	else \
		echo "WARN: trivy/checkov not installed — skipping security scan (brew install trivy)"; \
	fi

## --- Guardrail (research.md D8 belt-and-braces; skip with SKIP_PREFLIGHT=1) ---

preflight: ## Assert the resolved AWS account matches the env's tfvars before apply/destroy
	@if [ -z "$(SKIP_PREFLIGHT)" ]; then \
		AWS_PROFILE=$(AWS_PROFILE) bash $(INFRA_DIR)/scripts/preflight.sh $(ENV); \
	else \
		echo "WARN: preflight skipped (SKIP_PREFLIGHT=1)"; \
	fi
