#!/usr/bin/env bash
set -euo pipefail

# Start the dev RDS instance. (The backend is serverless — there is nothing else to start.)
echo "Starting RDS instance effy-dev-db..."
AWS_PROFILE=ef aws rds start-db-instance \
  --db-instance-identifier effy-dev-db --region ap-southeast-2 \
  --no-cli-pager --query 'DBInstance.DBInstanceStatus' --output text
