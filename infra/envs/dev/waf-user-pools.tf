# Per-source rate limiting on sign-in, as a WAF web ACL on each user pool. A Cognito trigger cannot do it:
# its `callerContext` has no IP, and `clientMetadata` is not passed to the challenge triggers and is
# client-controlled anyway. WAF sees the real source IP on InitiateAuth / RespondToAuthChallenge and runs
# before Cognito's own throttling.
#
# WAF cannot see the email address (Cognito withholds it), so the per-address limit is the DynamoDB counter
# (otp-store.tf). Two mechanisms; removing either leaves a hole.

resource "aws_wafv2_web_acl" "user_pools" {
  name = "${module.shared.name_prefix}-user-pool-signin"
  # WAFv2 validates this against ^[\w+=:#@/\-,\.][\w+=:#@/\-,\.\s]+[\w+=:#@/\-,\.]$ — no em
  # dashes, semicolons, parentheses or apostrophes, unlike every other description field in this
  # repo. Keep it to letters, digits, spaces, hyphens, commas and periods.
  description = "035 rate-based protection on Cognito sign-in. Per-source only, the per-address limit lives in DynamoDB."
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # scoped to sign-in, not to all pool traffic. Cognito forwards `x-amzn-cognito-operation-name`,
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
        # waf's floor for a 5-minute window. Well above any human sign-in rate and well below what
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

# Cognito has no association API of its own — "to programmatically associate a web ACL with your
# user pool... use AssociateWebACL from the AWS WAF API". Hence the association lives here rather
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
