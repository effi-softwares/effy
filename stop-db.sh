#!/usr/bin/env bash
set -euo pipefail

# Scale the core-api Fargate service down to 0 tasks so no container cost accrues.
echo "Scaling core-api ECS service to 0 tasks..."
AWS_PROFILE=ef aws ecs update-service \
  --cluster effy-dev-core-api \
  --service effy-dev-core-api \
  --desired-count 0 \
  --region ap-southeast-2 \
  --no-cli-pager --query 'service.desiredCount' --output text

# Stop the dev RDS instance.
echo "Stopping RDS instance effy-dev-db..."
AWS_PROFILE=ef aws rds stop-db-instance \
  --db-instance-identifier effy-dev-db --region ap-southeast-2 \
  --no-cli-pager --query 'DBInstance.DBInstanceStatus' --output text
