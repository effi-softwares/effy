#!/usr/bin/env bash
set -euo pipefail

# Start the dev RDS instance. (The backend is serverless — there is nothing else to start.)
echo "Starting RDS instance effy-dev-db..."
AWS_PROFILE=ef aws rds start-db-instance \
  --db-instance-identifier effy-dev-db --region ap-southeast-2 \
  --no-cli-pager --query 'DBInstance.DBInstanceStatus' --output text

# ⚠ The scheduled functions were paused by stop-db.sh. They are resumed only once the database is
# actually accepting connections — resuming them now would have them fail for the several minutes a
# start takes, which is the waste (and the alarm noise) the pause exists to avoid.
#
# ⚠ If you interrupt this wait, run:  bash infra/scripts/db-schedules.sh resume dev
#   Until you do, notifications and receipts queue up and are not sent.
echo "Waiting for the database to become available (usually 3–8 minutes)..."
AWS_PROFILE=ef aws rds wait db-instance-available \
  --db-instance-identifier effy-dev-db --region ap-southeast-2

bash "$(dirname "$0")/infra/scripts/db-schedules.sh" resume dev
echo "Database available; scheduled functions resumed."
