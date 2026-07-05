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

.PHONY: help bootstrap-init bootstrap-apply init plan apply destroy output fmt validate lint preflight \
        db-new db-status db-up db-down check-goose

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

## --- Database migrations (goose; specs/003-db-migrations) ---
# DSN is composed at invocation from the platform contract (SSM /effy/<env>/db/* +
# Secrets Manager) by infra/scripts/db-dsn.sh and enters goose ONLY via process env —
# never argv, never echoed, never a file. Forward-only platform: db-down is a single-step,
# DEV-ONLY iteration convenience; shipped mistakes are fixed by a new forward migration.

MIGRATIONS_DIR := db/migrations
GOOSE_ENV      := GOOSE_DRIVER=postgres GOOSE_MIGRATION_DIR=$(MIGRATIONS_DIR)
DB_DSN_CMD      = AWS_PROFILE=$(AWS_PROFILE) bash $(INFRA_DIR)/scripts/db-dsn.sh $(ENV)

check-goose:
	@command -v goose > /dev/null 2>&1 || { echo "goose not installed — brew install goose"; exit 1; }

db-new: check-goose ## Scaffold a SQL migration: make db-new name=snake_case_title
	@test -n "$(name)" || { echo "usage: make db-new name=snake_case_title"; exit 1; }
	@goose -dir $(MIGRATIONS_DIR) create $(name) sql

db-status: check-goose ## Applied vs pending migrations (read-only): make db-status ENV=dev
	@DSN="$$($(DB_DSN_CMD))" || exit 1; \
	$(GOOSE_ENV) GOOSE_DBSTRING="$$DSN" goose status

db-up: check-goose ## OPERATOR: apply pending migrations (confirm; FORCE=1 skips the commit guard for private dev iteration)
	@if [ -z "$(FORCE)" ] && [ -n "$$(git status --porcelain $(MIGRATIONS_DIR))" ]; then \
		echo "db-up BLOCKED: uncommitted changes under $(MIGRATIONS_DIR) — migrations must be committed before applying"; \
		echo "(FORCE=1 to override while privately iterating on your own latest migration)"; \
		git status --porcelain $(MIGRATIONS_DIR); \
		exit 1; \
	fi
	@DSN="$$($(DB_DSN_CMD))" || exit 1; \
	HOST=$$(printf '%s\n' "$$DSN" | tr ' ' '\n' | sed -n 's/^host=//p'); \
	printf 'goose UP  →  env=%s  host=%s\nContinue? [y/N] ' "$(ENV)" "$$HOST"; \
	read ans; [ "$$ans" = "y" ] || { echo "aborted — nothing applied"; exit 1; }; \
	$(GOOSE_ENV) GOOSE_DBSTRING="$$DSN" goose up

db-down: check-goose ## OPERATOR: step back ONE migration — dev-only iteration convenience
	@if [ "$(ENV)" != "dev" ]; then \
		echo "db-down REFUSED for ENV=$(ENV): the platform is forward-only — step-back exists only as a dev iteration convenience."; \
		echo "Shipped mistakes are fixed by a NEW forward migration (constitution / specs/003-db-migrations)."; \
		exit 1; \
	fi
	@DSN="$$($(DB_DSN_CMD))" || exit 1; \
	HOST=$$(printf '%s\n' "$$DSN" | tr ' ' '\n' | sed -n 's/^host=//p'); \
	printf 'goose DOWN (one step)  →  env=%s  host=%s\nContinue? [y/N] ' "$(ENV)" "$$HOST"; \
	read ans; [ "$$ans" = "y" ] || { echo "aborted — nothing changed"; exit 1; }; \
	$(GOOSE_ENV) GOOSE_DBSTRING="$$DSN" goose down
