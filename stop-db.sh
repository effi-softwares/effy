#!/usr/bin/env bash
set -euo pipefail

# Stop the dev RDS instance — the one always-on cost left in dev. (The backend is serverless and
# costs nothing while idle; with the database stopped every route answers a retryable 503.)

# ⚠ FIRST, pause the backend's scheduled functions. Left running they fail against the stopped
# database every minute and burn the month's free compute doing it (see infra/scripts/db-schedules.sh).
bash "$(dirname "$0")/infra/scripts/db-schedules.sh" pause dev

echo "Stopping RDS instance effy-dev-db..."
AWS_PROFILE=ef aws rds stop-db-instance \
  --db-instance-identifier effy-dev-db --region ap-southeast-2 \
  --no-cli-pager --query 'DBInstance.DBInstanceStatus' --output text
