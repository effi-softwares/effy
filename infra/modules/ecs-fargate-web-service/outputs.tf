output "alb_dns_name" {
  description = "The ALB's own DNS name (the alias records point here)."
  value       = aws_lb.this.dns_name
}

output "hostname_url" {
  description = "The branded HTTPS base URL, e.g. https://core-api.dev.effyshopping.com."
  value       = "https://${var.hostname}"
}

output "ecr_repository_url" {
  description = "The ECR repo to push images to."
  value       = aws_ecr_repository.this.repository_url
}

output "cluster_name" {
  description = "ECS cluster name (for update-service / ecs wait)."
  value       = aws_ecs_cluster.this.name
}

output "service_name" {
  description = "ECS service name (for update-service / ecs wait)."
  value       = aws_ecs_service.this.name
}

output "execution_role_arn" {
  description = "Task execution role ARN."
  value       = aws_iam_role.execution.arn
}

output "task_role_arn" {
  description = "Task role ARN."
  value       = aws_iam_role.task.arn
}
