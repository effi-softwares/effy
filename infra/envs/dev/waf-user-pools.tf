# ---------------------------------------------------------------------------------------------
# 035-six-digit-otp — per-source rate limiting on sign-in (FR-013).
#
# ⚠ THIS FILE EXISTS BECAUSE THE REQUIREMENT IS NOT BUILDABLE IN A LAMBDA.
#
# FR-013 asks for rate limiting per request source. The obvious place would be the
# CreateAuthChallenge trigger — but a Cognito trigger event's `callerContext` contains exactly two
# fields, `awsSdkVersion` and `clientId`, and NEITHER IS AN IP ADDRESS. There is no source IP
# anywhere in the event, and `clientMetadata` is no substitute twice over: AWS documents that
# InitiateAuth does not pass it to the challenge triggers at all, and it is client-controlled and
# unvalidated, so a self-reported IP is one an attacker rotates freely.
#
# The official mechanism is a WAF web ACL associated with the user pool, and it fits precisely:
# it inspects the public API operations (InitiateAuth, RespondToAuthChallenge), it sees the real
# source IP, and "the AWS WAF handler is called before the API-level throttling handlers".
#
# ⚠ WAF CANNOT DO THE PER-ADDRESS LIMIT. Cognito withholds PII from it — "you can't configure web
# ACL rules to match on ... usernames, passwords, phone numbers, or email addresses". So FR-012
# (per address, in DynamoDB) and FR-013 (per source, here) are TWO mechanisms, not one. Neither
# substitutes for the other, and removing either leaves a real hole.
#
# See specs/035-six-digit-otp/research.md § R2.
# ---------------------------------------------------------------------------------------------

resource "aws_wafv2_web_acl" "user_pools" {
  name        = "${module.shared.name_prefix}-user-pool-signin"
  description = "035 — rate-based protection on Cognito sign-in. Per-SOURCE only; the per-address limit lives in DynamoDB."
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # ⚠ SCOPED TO SIGN-IN, not to all pool traffic. Cognito forwards `x-amzn-cognito-operation-name`,
  # which is what lets a rate rule target the operations that send a code without also throttling
  # token refresh, sign-out, or profile reads — throttling those would turn an attack on one person
  # into an outage for everyone.
  rule {
    name     = "SignInRatePerSource"
    priority = 0

    action {
      block {}
    }

    statement {
      rate_based_statement {
        # WAF's floor for a 5-minute window. Well above any human sign-in rate and well below what
        # a distributed guessing campaign needs to be useful.
        limit              = 100
        aggregate_key_type = "IP"

        scope_down_statement {
          or_statement {
            statement {
              byte_match_statement {
                search_string         = "InitiateAuth"
                positional_constraint = "EXACTLY"
                field_to_match {
                  single_header {
                    name = "x-amzn-cognito-operation-name"
                  }
                }
                text_transformation {
                  priority = 0
                  type     = "LOWERCASE"
                }
              }
            }
            statement {
              byte_match_statement {
                search_string         = "RespondToAuthChallenge"
                positional_constraint = "EXACTLY"
                field_to_match {
                  single_header {
                    name = "x-amzn-cognito-operation-name"
                  }
                }
                text_transformation {
                  priority = 0
                  type     = "LOWERCASE"
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${module.shared.name_prefix}-signin-rate"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${module.shared.name_prefix}-user-pool-signin"
    sampled_requests_enabled   = true
  }

}

# ⚠ Cognito has no association API of its own — "to programmatically associate a web ACL with your
# user pool ... use AssociateWebACL from the AWS WAF API". Hence the association lives here rather
# than on the pool resource.
#
# One association per pool. All four are protected: a driver-app credential-stuffing campaign and a
# storefront one are the same attack, and Cognito's own request quotas are account-and-region-wide,
# so an incident on one pool eats the others' budget.
resource "aws_wafv2_web_acl_association" "customer" {
  resource_arn = module.customer_pool.user_pool_arn
  web_acl_arn  = aws_wafv2_web_acl.user_pools.arn
}

resource "aws_wafv2_web_acl_association" "driver" {
  resource_arn = module.driver_pool.user_pool_arn
  web_acl_arn  = aws_wafv2_web_acl.user_pools.arn
}

resource "aws_wafv2_web_acl_association" "shop" {
  resource_arn = module.shop_pool.user_pool_arn
  web_acl_arn  = aws_wafv2_web_acl.user_pools.arn
}

resource "aws_wafv2_web_acl_association" "back_office" {
  resource_arn = module.back_office_pool.user_pool_arn
  web_acl_arn  = aws_wafv2_web_acl.user_pools.arn
}
