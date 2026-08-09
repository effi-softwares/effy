#!/usr/bin/env bash
set -euo pipefail

# Start the dev RDS instance.
echo "Starting RDS instance effy-dev-db..."
AWS_PROFILE=ef aws rds start-db-instance \
  --db-instance-identifier effy-dev-db --region ap-southeast-2 \
  --no-cli-pager --query 'DBInstance.DBInstanceStatus' --output text

# Scale the core-api Fargate service back up to 1 task (the Terraform-managed count).
echo "Scaling core-api ECS service to 1 task..."
AWS_PROFILE=ef aws ecs update-service \
  --cluster effy-dev-core-api \
  --service effy-dev-core-api \
  --desired-count 1 \
  --region ap-southeast-2 \
  --no-cli-pager --query 'service.desiredCount' --output text
