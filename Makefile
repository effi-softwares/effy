# Effy — root Makefile
# Wraps the real commands for this slice. AWS-touching targets are run BY THE USER
# (per CLAUDE.md working mode: Claude writes code; the user runs deploy/migrate/apply).
#
# Region: effy deploys to ap-southeast-1 to isolate from the existing `ef` platform in
# ap-southeast-2. The `ef` profile DEFAULTS to ap-southeast-2, so AWS_REGION is set explicitly.

export AWS_PROFILE := ef
export AWS_REGION  := ap-southeast-1

BOOTSTRAP_DIR := infra/bootstrap
DEV_DIR       := infra/envs/dev
MIGRATIONS    := services/api/migrations
DB_URL_PARAM  := /effy/dev/db/url

.PHONY: help tf-bootstrap tf-dev-plan tf-dev-apply tf-dev-destroy migrate api-run android ios

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# --- Infrastructure (Terraform) — RUN BY USER (provisions live AWS in ap-southeast-1) ---
tf-bootstrap: ## One-time: create S3 state bucket + DynamoDB lock table
	cd $(BOOTSTRAP_DIR) && terraform init && terraform apply

tf-dev-plan: ## Plan the dev environment (cognito + rds + ssm)
	cd $(DEV_DIR) && terraform init && terraform plan

tf-dev-apply: ## Apply the dev environment
	cd $(DEV_DIR) && terraform init && terraform apply

tf-dev-destroy: ## Tear down the dev environment
	cd $(DEV_DIR) && terraform destroy

# --- Database (Goose, forward-only) — RUN BY USER (mutates the dev DB) ---
migrate: ## Run Goose migrations against the dev DB (URL read from SSM)
	@DB_URL="$$(aws ssm get-parameter --name $(DB_URL_PARAM) --with-decryption --query 'Parameter.Value' --output text)"; \
	if [ -z "$$DB_URL" ]; then echo "ERROR: could not read $(DB_URL_PARAM) from SSM (is dev applied?)"; exit 1; fi; \
	goose -dir $(MIGRATIONS) postgres "$$DB_URL" up

# --- Local dev ---
api-run: ## Run the Go hot-path service locally (config from SSM)
	cd services/api && go run ./cmd/api

android: ## Build & install the customer app on a connected Android device/emulator
	cd apps/customer-mobile && ./gradlew :composeApp:installDebug

ios: ## Open the iOS app in Xcode (run from there on a simulator)
	open apps/customer-mobile/iosApp/iosApp.xcodeproj
