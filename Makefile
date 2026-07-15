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
AWS_REGION  ?= ap-southeast-2

INFRA_DIR     := infra
BOOTSTRAP_DIR := $(INFRA_DIR)/bootstrap
GLOBAL_DIR    := $(INFRA_DIR)/global
ENV_DIR       := $(INFRA_DIR)/envs/$(ENV)
TF            := AWS_PROFILE=$(AWS_PROFILE) terraform

# All Terraform roots (for fmt-check / validate / lint sweeps).
TF_ROOTS := $(BOOTSTRAP_DIR) $(GLOBAL_DIR) $(INFRA_DIR)/envs/dev $(INFRA_DIR)/envs/qa $(INFRA_DIR)/envs/staging $(INFRA_DIR)/envs/prod

.PHONY: help bootstrap-init bootstrap-apply init plan apply destroy output fmt validate lint preflight \
        global-init global-plan global-apply global-output dns-verify mail-verify edge-health \
        db-new db-status db-up db-down check-goose \
        core-run core-test core-lint core-build create-first-admin delete-admin edge-install edge-offline edge-test edge-deploy edge-remove \
        verify-naming verify-pool-credentials \
        bo-dev bo-build bo-lint bo-test \
        shop-dev shop-build shop-lint shop-test \
        cw-dev cw-build cw-lint cw-test cw-e2e cw-gates cw-size cw-depcruise \
        shop-verify-isolation shop-verify-gate shop-token-claims \
        cm-contract-gen cm-contract-check cm-tokens-gen cm-tokens-check cm-guard cm-codegen cm-ngrok-edge cm-ngrok-core \
        sm-contract-gen sm-contract-check sm-tokens-check sm-guard sm-codegen sm-test sm-ngrok-edge \
        dev-status dev-stop dev-start check-dev-park

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

## --- One-time state backend (run FIRST, once — see infra/bootstrap/README.md) ---

bootstrap-init: ## Init the bootstrap root (local state)
	cd $(BOOTSTRAP_DIR) && $(TF) init

bootstrap-apply: ## OPERATOR: create the S3 state bucket (one-time, interactive approval)
	cd $(BOOTSTRAP_DIR) && $(TF) apply

## --- Platform-wide root (010): the parent DNS zone. NOT an environment — no ENV= here. ---

global-init: ## Init the global root (parent hosted zone)
	cd $(GLOBAL_DIR) && $(TF) init

global-plan: ## Preview the global root (never mutates)
	cd $(GLOBAL_DIR) && $(TF) plan -var-file=global.tfvars

global-apply: ## OPERATOR: apply the global root — creates the parent zone (interactive approval)
	@echo "⚠  This root owns effyshopping.com. Destroying it mints NEW name-servers and needs a manual GoDaddy repoint."
	cd $(GLOBAL_DIR) && $(TF) apply -var-file=global.tfvars

global-output: ## Show the parent zone's name-servers (paste these into GoDaddy)
	cd $(GLOBAL_DIR) && $(TF) output

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

verify-naming: ## One-name rule (008): fail on any retired audience token lacking a documented exclusion
	@bash scripts/verify-no-store.sh

verify-pool-credentials: ## OPERATOR (011 FR-017): assert driver/shop/admin stay passwordless, unfederated, admin-provisioned
	@ENV=$(ENV) AWS_PROFILE=$(AWS_PROFILE) AWS_REGION=$(AWS_REGION) bash scripts/verify-pool-credentials.sh

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

## --- Backend services (specs/004-backend-bootstrap) ---
# core-api runs LOCALLY only this slice (Fargate deferred). The DSN and the customer
# pool ids enter the container as process env composed AT INVOCATION from the platform
# contract (SSM /effy/<env>/db|auth/* + Secrets Manager) — never a file, never echoed
# (contracts/config.contract.md). edge-deploy mutates AWS → OPERATOR-run.

CORE_DIR := apis/core-api
# Cold path (A3): a family of services under apis/edge-api/<service>; SERVICE selects one.
EDGE_DIR := apis/edge-api/$(SERVICE)

AUTH_PARAM_CMD = AWS_PROFILE=$(AWS_PROFILE) aws ssm get-parameter --region $(AWS_REGION) --query Parameter.Value --output text --name

core-run: ## Run core-api locally in Docker with live reload (DSN + pool ids composed at invocation)
	@DSN="$$($(DB_DSN_CMD))" || exit 1; \
	POOL_ID="$$($(AUTH_PARAM_CMD) /effy/$(ENV)/auth/customer/user_pool_id)" || { echo "core-run: cannot read customer pool id from SSM (001 contract)"; exit 1; }; \
	CLIENT_ID="$$($(AUTH_PARAM_CMD) /effy/$(ENV)/auth/customer/app_client_id)" || exit 1; \
	EFFY_ENV=$(ENV) DB_DSN="$$DSN" AUTH_CUSTOMER_POOL_ID="$$POOL_ID" AUTH_CUSTOMER_CLIENT_ID="$$CLIENT_ID" \
		docker compose -f $(CORE_DIR)/docker-compose.yml up --build

core-test: ## core-api unit + handler tests (add FULL=1 for container-backed repository tests)
	@if [ -n "$(FULL)" ]; then \
		cd $(CORE_DIR) && go test ./...; \
	else \
		cd $(CORE_DIR) && go test -short ./...; \
	fi

core-lint: ## gofmt check + go vet for core-api
	@cd $(CORE_DIR) && test -z "$$(gofmt -l .)" || { echo "gofmt needed on:"; gofmt -l .; exit 1; }
	@cd $(CORE_DIR) && go vet ./...

core-build: ## Build the production core-api image (distroless, TARGETARCH-aware)
	@docker build --target runtime -t effy/core-api:local $(CORE_DIR)

create-first-admin: ## OPERATOR: bootstrap the FIRST back-office super-admin (EMAIL=.. NAME=".." ENV=dev) — specs/006
	@test -n "$(EMAIL)" && test -n "$(NAME)" || { echo 'usage: make create-first-admin EMAIL=jane@effy.test NAME="Jane Doe" ENV=dev'; exit 1; }
	@DSN="$$($(DB_DSN_CMD))" || exit 1; \
	POOL_ID="$$($(AUTH_PARAM_CMD) /effy/$(ENV)/auth/back-office/user_pool_id)" || { echo "create-first-admin: cannot read back-office pool id from SSM (001 contract)"; exit 1; }; \
	EFFY_ENV=$(ENV) DB_DSN="$$DSN" BACK_OFFICE_POOL_ID="$$POOL_ID" AWS_REGION=$(AWS_REGION) AWS_PROFILE=$(AWS_PROFILE) \
		sh -c 'cd $(CORE_DIR) && go run ./cmd/create-first-admin --email "$(EMAIL)" --name "$(NAME)"'

delete-admin: ## OPERATOR: COMPLETELY delete a back-office admin (EMAIL=.. ENV=dev [FORCE=1]) — irreversible — specs/006
	@test -n "$(EMAIL)" || { echo 'usage: make delete-admin EMAIL=jane@effy.test ENV=dev [FORCE=1]'; exit 1; }
	@printf 'DELETE admin %s from %s (Cognito + platform record) — IRREVERSIBLE\nContinue? [y/N] ' "$(EMAIL)" "$(ENV)"; \
	read ans; [ "$$ans" = "y" ] || { echo "aborted — nothing deleted"; exit 1; }
	@DSN="$$($(DB_DSN_CMD))" || exit 1; \
	POOL_ID="$$($(AUTH_PARAM_CMD) /effy/$(ENV)/auth/back-office/user_pool_id)" || { echo "delete-admin: cannot read back-office pool id from SSM (001 contract)"; exit 1; }; \
	EFFY_ENV=$(ENV) DB_DSN="$$DSN" BACK_OFFICE_POOL_ID="$$POOL_ID" AWS_REGION=$(AWS_REGION) AWS_PROFILE=$(AWS_PROFILE) \
		sh -c 'cd $(CORE_DIR) && go run ./cmd/delete-admin --email "$(EMAIL)" $(if $(FORCE),--force,)'

edge-install: ## Install the JS/TS workspace dependencies (pnpm)
	@pnpm install

edge-test: ## typecheck + vitest for every cold-path service (edge-shared + admin + shop)
	@pnpm --filter "@effy/edge-*" run typecheck && pnpm --filter "@effy/edge-*" run test

edge-offline: ## Run ONE service locally via serverless-offline (SERVICE=admin|shop; needs the ef profile)
	@test -n "$(SERVICE)" || { echo "usage: make edge-offline SERVICE=admin|shop ENV=dev"; exit 1; }
	@cd $(EDGE_DIR) && AWS_PROFILE=$(AWS_PROFILE) pnpm exec serverless offline --stage $(ENV)

edge-deploy: ## OPERATOR: deploy ONE cold-path service to AWS (SERVICE=admin|shop ENV=dev)
	@test -n "$(SERVICE)" || { echo "usage: make edge-deploy SERVICE=admin|shop ENV=dev"; exit 1; }
	@printf 'serverless DEPLOY  →  service=%s stage=%s (attaches to the shared HTTP API, live AWS)\nContinue? [y/N] ' "$(SERVICE)" "$(ENV)"; \
	read ans; [ "$$ans" = "y" ] || { echo "aborted — nothing deployed"; exit 1; }; \
	cd $(EDGE_DIR) && AWS_PROFILE=$(AWS_PROFILE) pnpm exec serverless deploy --stage $(ENV) --verbose

edge-remove: ## OPERATOR: tear down ONE cold-path service's CloudFormation stack (SERVICE=.. ENV=dev)
	@test -n "$(SERVICE)" || { echo "usage: make edge-remove SERVICE=admin|shop ENV=dev"; exit 1; }
	@test -d "$(EDGE_DIR)" || { echo "edge-remove: no such service directory: $(EDGE_DIR)"; exit 1; }
	@printf 'serverless REMOVE  →  service=%s stage=%s (DESTROYS the stack: lambdas, routes, alarms, deployment bucket)\nContinue? [y/N] ' "$(SERVICE)" "$(ENV)"; \
	read ans; [ "$$ans" = "y" ] || { echo "aborted — nothing removed"; exit 1; }; \
	cd $(EDGE_DIR) && AWS_PROFILE=$(AWS_PROFILE) pnpm exec serverless remove --stage $(ENV) --verbose

# --- back-office web (005): Vite SPA, LOCAL-ONLY this slice (no hosted deploy). Runs on
# :5173 against the live dev edge-api + admin Cognito pool. VITE_* config comes from
# apps/back-office/.env.local (git-ignored) per contracts/config.contract.md.
BO_DIR := apps/back-office

bo-dev: ## Run back-office web locally (vite dev on http://localhost:5173)
	@pnpm --filter @effy/back-office dev

bo-build: ## Production build of back-office web
	@pnpm --filter @effy/back-office build

bo-lint: ## back-office typecheck (tsc --noEmit)
	@pnpm --filter @effy/back-office typecheck

bo-test: ## back-office unit/component tests (vitest)
	@pnpm --filter @effy/back-office test

# --- shop web (007): Vite SPA, LOCAL-ONLY this slice (no hosted deploy). Runs on :5174
# (an approved dev CORS origin — infra/envs/dev/edge-gateway.tf) against the live dev
# shop service + SHOP Cognito pool. VITE_* config comes from apps/shop-web/.env.local
# (git-ignored) per specs/007-shop-web/contracts/config.contract.md.
SHOP_DIR := apps/shop-web

shop-dev: ## Run shop web locally (vite dev on http://localhost:5174)
	@pnpm --filter @effy/shop-web dev

shop-build: ## Production build of shop web
	@pnpm --filter @effy/shop-web build

shop-lint: ## shop-web typecheck (tsc --noEmit)
	@pnpm --filter @effy/shop-web typecheck

shop-test: ## shop-web unit/component tests (vitest)
	@pnpm --filter @effy/shop-web test

# --- customer storefront (011) — the platform's first PUBLIC surface. SSR-first, guest-first.
# It runs against a LOCAL core-api (`make core-run`) + the LIVE dev edge-api.
cw-dev: ## Run the customer storefront locally (next dev on http://localhost:3000)
	@pnpm --filter @effy/customer-web dev

cw-build: ## Production build of the customer storefront
	@pnpm --filter @effy/customer-web build

cw-lint: ## customer-web typecheck (tsc --noEmit)
	@pnpm --filter @effy/customer-web typecheck

cw-test: ## customer-web unit tests (vitest — async Server Components are E2E-tested, not unit-tested)
	@pnpm --filter @effy/customer-web test

cw-e2e: ## customer-web E2E (playwright) — SSR/SEO/auth/isolation. Proves what units cannot.
	@pnpm --filter @effy/customer-web e2e

# --- the three GATES (011 FR-005/FR-006). These FAIL THE BUILD; they do not warn.
cw-gates: ## customer-web: the two build-failing gates (Amplify quarantine + guest bundle budget)
	@pnpm --filter @effy/customer-web depcruise
	@pnpm --filter @effy/customer-web size

cw-size: ## customer-web bundle budget — guest routes MUST stay <= 120 KB First Load JS
	@pnpm --filter @effy/customer-web size

cw-depcruise: ## customer-web: FAIL if any guest route imports aws-amplify (the quarantine, FR-006)
	@pnpm --filter @effy/customer-web depcruise

# --- customer-mobile (013). Principle-II codegen (committed + drift-guarded) + the build-failing guard.
cm-contract-gen: ## customer-mobile: regenerate the Kotlin DTOs from @effy/shared-types (013 D15)
	@pnpm --filter @effy/shared-types contract:gen
cm-contract-check: ## customer-mobile: FAIL if the committed Kotlin DTOs drift from the TS source (Principle II)
	@pnpm --filter @effy/shared-types contract:check
cm-tokens-gen: ## customer-mobile: regenerate the Compose theme from tokens.css (013 D16)
	@pnpm --filter @effy/design-system tokens:gen
cm-tokens-check: ## customer-mobile: FAIL if the committed Compose theme drifts from tokens.css (Principle II)
	@pnpm --filter @effy/design-system tokens:check
cm-guard: ## customer-mobile: the build-failing guard — escape-hatch ban (FR-024) + no secret-shaped keys (FR-042)
	@bash scripts/mobile-guard.sh
cm-codegen: cm-contract-check cm-tokens-check ## customer-mobile: both Principle-II drift checks together

# --- shop-mobile (014). Same Principle-II codegen + build-failing guard as 013; EMAIL_OTP-only surface.
# The shop contract (from shop.ts) and the shop-packaged Compose theme are committed + drift-guarded.
sm-contract-gen: ## shop-mobile: regenerate the Kotlin shop DTOs from @effy/shared-types (014 D4s)
	@pnpm --filter @effy/shared-types shop-contract:gen
sm-contract-check: ## shop-mobile: FAIL if the committed shop Kotlin DTOs drift from the TS source (Principle II)
	@pnpm --filter @effy/shared-types shop-contract:check
sm-tokens-check: ## shop-mobile: FAIL if the committed Compose theme drifts from tokens.css (shared generator)
	@pnpm --filter @effy/design-system tokens:check
sm-guard: ## shop-mobile: the build-failing guard — escape-hatch ban (FR-028) + no secret-shaped keys (FR-036)
	@bash scripts/mobile-guard.sh
sm-codegen: sm-contract-check sm-tokens-check ## shop-mobile: both Principle-II drift checks together
sm-test: ## shop-mobile: shared unit tests (JVM host) — the role-narrowing + gate logic
	@cd apps/shop-mobile && ./gradlew :shared:testAndroidHostTest
sm-ngrok-edge: ## Expose local edge-api on your ngrok static domain → SHOP_API_BASE_URL (run 'make edge-offline SERVICE=shop' first)
	@test -n "$(NGROK_STATIC_DOMAIN)" || { echo "usage: make sm-ngrok-edge NGROK_STATIC_DOMAIN=<your-static>.ngrok-free.app  (run 'make edge-offline SERVICE=shop' first)"; exit 1; }
	@command -v ngrok >/dev/null || { echo "sm-ngrok-edge: ngrok not found — install it and reserve a static domain first"; exit 1; }
	ngrok http $(NGROK_EDGE_PORT) --domain=$(NGROK_STATIC_DOMAIN)

# --- expose a local backend to a physical phone via an ngrok STATIC domain (013 quickstart § 0 Path A).
# A phone cannot reach localhost; ngrok gives a stable public https URL to put in secrets.properties.
# The static domain is reserved on YOUR ngrok account — pass it in (or export it); nothing is hardcoded.
# Ports: core-api = 8080 (make core-run); edge-api serverless-offline = 3000 (make edge-offline).
#
#   ⚠ For 013 the account routes the app calls are on EDGE (cm-ngrok-edge → EDGE_API_BASE_URL). core-api
#   is commerce and has nothing to call yet, so cm-ngrok-core is forward-looking. A FREE ngrok account
#   has ONE static domain (one tunnel at a time) — for this slice, point it at edge.
NGROK_CORE_PORT   ?= 8080
NGROK_EDGE_PORT   ?= 3000
NGROK_STATIC_DOMAIN ?=

cm-ngrok-edge: ## Expose local edge-api on your ngrok static domain (NGROK_STATIC_DOMAIN=<name>.ngrok-free.app) → EDGE_API_BASE_URL
	@test -n "$(NGROK_STATIC_DOMAIN)" || { echo "usage: make cm-ngrok-edge NGROK_STATIC_DOMAIN=<your-static>.ngrok-free.app  (run 'make edge-offline SERVICE=customer' first)"; exit 1; }
	@command -v ngrok >/dev/null || { echo "cm-ngrok-edge: ngrok not found — install it and reserve a static domain first"; exit 1; }
	ngrok http $(NGROK_EDGE_PORT) --domain=$(NGROK_STATIC_DOMAIN)

cm-ngrok-core: ## Expose local core-api (:8080, make core-run) on your ngrok static domain → CORE_API_BASE_URL
	@test -n "$(NGROK_STATIC_DOMAIN)" || { echo "usage: make cm-ngrok-core NGROK_STATIC_DOMAIN=<your-static>.ngrok-free.app  (run 'make core-run' first)"; exit 1; }
	@command -v ngrok >/dev/null || { echo "cm-ngrok-core: ngrok not found — install it and reserve a static domain first"; exit 1; }
	ngrok http $(NGROK_CORE_PORT) --domain=$(NGROK_STATIC_DOMAIN)

# --- shop slice verification (007). SC-004 and SC-005a are enforced structurally (gateway JWT
# authorizers) and relationally (a SQL join) — they cannot be unit-tested, so they are scripted
# here and run against the real gateway. See specs/007-shop-web/research.md R9.
shop-verify-isolation: ## OPERATOR: SC-004 cross-pool isolation, both directions (SHOP_TOKEN=.. BO_TOKEN=..)
	@test -n "$(SHOP_TOKEN)" && test -n "$(BO_TOKEN)" || { echo 'usage: make shop-verify-isolation SHOP_TOKEN=eyJ... BO_TOKEN=eyJ... ENV=dev'; exit 1; }
	@API="$$($(AUTH_PARAM_CMD) /effy/$(ENV)/edge/api_endpoint)" || exit 1; \
	API_ENDPOINT="$$API" SHOP_TOKEN="$(SHOP_TOKEN)" BO_TOKEN="$(BO_TOKEN)" bash scripts/verify-cross-pool.sh

shop-verify-gate: ## OPERATOR: SC-005 manager gate is backend-authoritative (MANAGER_TOKEN=.. STAFF_TOKEN=.. NOBODY_TOKEN=..)
	@test -n "$(MANAGER_TOKEN)" && test -n "$(STAFF_TOKEN)" && test -n "$(NOBODY_TOKEN)" \
		|| { echo 'usage: make shop-verify-gate MANAGER_TOKEN=eyJ... STAFF_TOKEN=eyJ... NOBODY_TOKEN=eyJ... ENV=dev'; exit 1; }
	@API="$$($(AUTH_PARAM_CMD) /effy/$(ENV)/edge/api_endpoint)" || exit 1; \
	API_ENDPOINT="$$API" MANAGER_TOKEN="$(MANAGER_TOKEN)" STAFF_TOKEN="$(STAFF_TOKEN)" NOBODY_TOKEN="$(NOBODY_TOKEN)" \
		bash scripts/verify-manager-gate.sh

shop-token-claims: ## Decode a Cognito ACCESS token's claims (TOKEN=eyJ..) — settles research R6
	@test -n "$(TOKEN)" || { echo 'usage: make shop-token-claims TOKEN=eyJ...'; exit 1; }
	@TOKEN="$(TOKEN)" bash scripts/token-claims.sh

# --- domain slice verification (010). A DNS delegation, a TLS chain, and a DKIM signature cannot
# honestly be unit-tested — they are properties of the live internet. Scripted here instead.
dns-verify: ## SC-001/002/004: delegation live, branded API trusted, raw URL still works
	@ROOT_DOMAIN="$${ROOT_DOMAIN:-effyshopping.com}" ENV="$(ENV)" \
	API_URL="$$($(AUTH_PARAM_CMD) /effy/$(ENV)/edge/api_endpoint)" \
	RAW_URL="$$($(AUTH_PARAM_CMD) /effy/$(ENV)/edge/api_default_endpoint)" \
		bash scripts/dns-verify.sh

edge-health: ## Probe every cold-path service: healthz (liveness) + readyz (readiness). Public, no token.
	@API_URL="$$($(AUTH_PARAM_CMD) /effy/$(ENV)/edge/api_endpoint)" \
	SERVICES="admin shop" bash scripts/edge-health.sh

mail-verify: ## SC-010: DKIM/SPF/DMARC published; the SES identity reports verified
	@ROOT_DOMAIN="$${ROOT_DOMAIN:-effyshopping.com}" ENV="$(ENV)" AWS_PROFILE="$(AWS_PROFILE)" \
	AWS_REGION="$(AWS_REGION)" bash scripts/mail-verify.sh

## --- Dev cost control: stop the DB while you're not developing ---
# The DB instance is the one big always-on dev cost (the bulk of the ≈US$22/mo; its
# ~US$2.5/mo storage still bills while stopped). Everything else is pay-per-use ≈ $0
# idle, except edge-api's Secrets Manager interface endpoint (~US$9/mo) — deliberately
# left always-on for now. CAVEAT: AWS auto-restarts a stopped RDS instance after
# 7 days — check dev-status and re-run dev-stop if you stay away longer.

DB_INSTANCE_ID = effy-$(ENV)-db
RDS_CMD        = AWS_PROFILE=$(AWS_PROFILE) aws rds --region $(AWS_REGION)
DB_STATUS_CMD  = $(RDS_CMD) describe-db-instances --db-instance-identifier $(DB_INSTANCE_ID) --query 'DBInstances[0].DBInstanceStatus' --output text

check-dev-park:
	@if [ "$(ENV)" != "dev" ]; then \
		echo "dev-stop/dev-start REFUSED for ENV=$(ENV): the stop lever is a dev-only cost convenience."; \
		exit 1; \
	fi

dev-status: check-dev-park ## Is the dev DB billing right now? (instance state)
	@printf 'db (%s): ' "$(DB_INSTANCE_ID)"; \
	$(DB_STATUS_CMD) 2>/dev/null || echo "not found"
	@echo "(a stopped DB auto-restarts after 7 days — AWS behaviour, not ours)"

dev-stop: check-dev-park ## OPERATOR: stop the dev DB instance (compute stops billing)
	@printf 'STOP RDS %s\nContinue? [y/N] ' "$(DB_INSTANCE_ID)"; \
	read ans; [ "$$ans" = "y" ] || { echo "aborted — nothing changed"; exit 1; }
	@status=$$($(DB_STATUS_CMD)) || exit 1; \
	if [ "$$status" = "available" ]; then \
		$(RDS_CMD) stop-db-instance --db-instance-identifier $(DB_INSTANCE_ID) --query 'DBInstance.DBInstanceStatus' --output text; \
		echo "db: stopping (takes a few minutes; AWS auto-restarts it after 7 days)"; \
	else \
		echo "db: status '$$status' — not running, nothing to stop"; \
	fi

dev-start: check-dev-park ## OPERATOR: start the dev DB instance and wait until it's usable
	@status=$$($(DB_STATUS_CMD)) || exit 1; \
	if [ "$$status" = "stopped" ]; then \
		$(RDS_CMD) start-db-instance --db-instance-identifier $(DB_INSTANCE_ID) --query 'DBInstance.DBInstanceStatus' --output text; \
	else \
		echo "db: status '$$status' — not stopped, nothing to start"; \
	fi; \
	echo "waiting for the DB to become available (usually 3-8 min)…"; \
	$(RDS_CMD) wait db-instance-available --db-instance-identifier $(DB_INSTANCE_ID); \
	echo "db: available"
