# Two roles, least privilege (research R6):
#   • execution role — what the ECS agent needs to START the task (pull image, write logs,
#     resolve the injected secrets). NOT the app's identity.
#   • task role — what the RUNNING container may do (presign product media).

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# ── Execution role ──────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "execution" {
  name               = "${var.name_prefix}-core-api-exec"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

# ECR pull + CloudWatch Logs.
resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Resolve the injected secrets at task start — scoped to EXACTLY the passed ARNs, no wildcard.
# kms:Decrypt is bounded to calls made VIA Secrets Manager, which covers both the AWS-managed
# key (RDS master secret) and any CMK, without hard-coding a key ARN.
data "aws_iam_policy_document" "execution_secrets" {
  count = length(var.secret_arns) > 0 ? 1 : 0

  statement {
    sid       = "ReadInjectedSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = var.secret_arns
  }

  statement {
    sid       = "DecryptViaSecretsManager"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  count  = length(var.secret_arns) > 0 ? 1 : 0
  name   = "read-injected-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets[0].json
}

# ── Task role ───────────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "task" {
  name               = "${var.name_prefix}-core-api-task"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

# Presign / read product media (016). Only granted when a bucket ARN is supplied.
data "aws_iam_policy_document" "task_s3" {
  count = var.task_role_s3_bucket_arn == "" ? 0 : 1

  statement {
    sid       = "ReadProductMedia"
    actions   = ["s3:GetObject"]
    resources = ["${var.task_role_s3_bucket_arn}/*"]
  }
}

resource "aws_iam_role_policy" "task_s3" {
  count  = var.task_role_s3_bucket_arn == "" ? 0 : 1
  name   = "read-product-media"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_s3[0].json
}
