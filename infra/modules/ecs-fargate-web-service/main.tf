# A single public container behind an internet-facing ALB, at the cheapest posture:
# one fixed Fargate task (no autoscaling), default-VPC public subnets, no NAT.
#
# ⚠ COST-SHAPE INVARIANTS (audited in the plan, SC-004) — this module deliberately declares:
#   • exactly ONE aws_ecs_service, desired_count fixed, and NO aws_appautoscaling_* anywhere;
#   • NO aws_nat_gateway / aws_eip(nat) / aws_vpc_endpoint (public-subnet egress instead);
#   • NO aws_acm_certificate (the cert ARN is passed in), NO aws_secretsmanager_secret,
#     NO aws_db_instance.
# Keep it that way — every one of those is a recurring charge the brief excludes.

locals {
  name = "${var.name_prefix}-core-api"

  # Empty subnet_ids → the default VPC's (public) subnets. Prod passes private subnet ids.
  subnet_ids = length(var.subnet_ids) > 0 ? var.subnet_ids : data.aws_subnets.default.ids
  vpc_id     = length(var.subnet_ids) > 0 ? data.aws_subnet.first_given[0].vpc_id : data.aws_vpc.default[0].id
}

# ── Networking (default VPC + its public subnets, unless overridden) ─────────────────────────
data "aws_vpc" "default" {
  count   = length(var.subnet_ids) > 0 ? 0 : 1
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [length(var.subnet_ids) > 0 ? data.aws_subnet.first_given[0].vpc_id : data.aws_vpc.default[0].id]
  }
}

# When subnet ids ARE supplied, derive their VPC from the first one.
data "aws_subnet" "first_given" {
  count = length(var.subnet_ids) > 0 ? 1 : 0
  id    = var.subnet_ids[0]
}

# ── Security groups ─────────────────────────────────────────────────────────────────────────
# The ALB is the ONLY thing the public reaches; the task's port is reachable ONLY from the ALB.
resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Public ingress to the core-api ALB (80/443)."
  vpc_id      = local.vpc_id

  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP from anywhere (redirected to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All egress (to the task)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "task" {
  name        = "${local.name}-task"
  description = "core-api task - app port reachable ONLY from the ALB; egress open for DB/Cognito/Stripe/ECR/Secrets."
  vpc_id      = local.vpc_id

  ingress {
    description     = "App port from the ALB only"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "All egress (DB public endpoint, Cognito JWKS, Stripe, ECR, Secrets Manager)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ── ECS cluster (Container Insights OFF — it is a paid CloudWatch feature) ───────────────────
resource "aws_ecs_cluster" "this" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

# ── Task definition ─────────────────────────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "this" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.cpu)
  memory                   = tostring(var.memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  # Cheapest CPU architecture — Graviton/ARM64. The Dockerfile already builds linux/arm64.
  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name      = "core-api"
      image     = "${aws_ecr_repository.this.repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      # Non-secret config as plain env; secret config injected at start via valueFrom.
      environment = [for k, v in var.environment : { name = k, value = v }]
      secrets     = [for k, v in var.secrets : { name = k, valueFrom = v }]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.this.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "core-api"
        }
      }
    }
  ])
}

# ── Service (single fixed task, cheapest rollout, auto-rollback) ─────────────────────────────
resource "aws_ecs_service" "this" {
  name            = local.name
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  # min 0 / max 100 → ECS never runs two tasks at once (a brief accepted deploy gap). No autoscaling.
  deployment_minimum_healthy_percent = var.min_healthy_percent
  deployment_maximum_percent         = var.max_percent

  # A health-failing deploy is observable and auto-reverted to the last good task def (FR-009).
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  health_check_grace_period_seconds = 60

  # Shell-less debugging without a bastion — costs nothing.
  enable_execute_command = true

  network_configuration {
    subnets          = local.subnet_ids
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = var.assign_public_ip
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this.arn
    container_name   = "core-api"
    container_port   = var.container_port
  }

  # Do NOT block apply on steady state — the first apply runs before any image is pushed
  # (research R7). The runbook pushes the image then forces a deployment.
  wait_for_steady_state = false

  depends_on = [aws_lb_listener.https]
}

# ── Application Load Balancer + target group + listeners ─────────────────────────────────────
resource "aws_lb" "this" {
  name               = local.name
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = local.subnet_ids
  idle_timeout       = var.idle_timeout
}

resource "aws_lb_target_group" "this" {
  name        = local.name
  port        = var.container_port
  protocol    = "HTTP"
  target_type = "ip" # required for awsvpc/Fargate
  vpc_id      = local.vpc_id

  health_check {
    path                = var.health_check_path # /healthz (liveness), NOT /readyz (research R9)
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 3
    unhealthy_threshold = 3
  }

  deregistration_delay = 30
}

# HTTPS :443 — terminates TLS with the reused wildcard cert, forwards to the task.
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }
}

# HTTP :80 — fixed 301 redirect to HTTPS. No API response is ever served in cleartext (FR-004).
resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      protocol    = "HTTPS"
      port        = "443"
      status_code = "HTTP_301"
    }
  }
}
