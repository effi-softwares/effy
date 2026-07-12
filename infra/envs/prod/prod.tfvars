# prod — AUTHORED, NOT APPLIED (spec FR-011). Plans must stay clean with zero live
# resources until this env is deliberately promoted.

env        = "prod"
aws_region = "ap-southeast-2"

# Fill in before the first plan/apply — the placeholder fails validation loudly on purpose.
aws_account_id = "724289623101"

# ESSENTIALS is the passwordless minimum; prod may opt UP to "PLUS" here (threat
# protection etc.) without touching any module — tier is just tfvars (research.md D4).
user_pool_tier = "ESSENTIALS"

# PROMOTION PREREQUISITE (research.md D6): prod MUST switch to SES before real users —
# { email_sending_account = "DEVELOPER", source_arn = ..., from_email_address = ... };
# the Cognito default sender's ~50 emails/day cap is a dev-only allowance.
email_configuration = {
  email_sending_account = "COGNITO_DEFAULT"
}

auth_urls = {
  customer = {
    callback_urls = ["https://www.effyshopping.com/auth/callback", "effy-customer://auth/callback"]
    logout_urls   = ["https://www.effyshopping.com/", "effy-customer://signed-out"]
  }
  driver = {
    callback_urls = ["effy-driver://auth/callback"]
    logout_urls   = ["effy-driver://signed-out"]
  }
  shop = {
    callback_urls = ["https://shop.effyshopping.com/auth/callback", "effy-shop://auth/callback"]
    logout_urls   = ["https://shop.effyshopping.com/", "effy-shop://signed-out"]
  }
  back_office = {
    callback_urls = ["https://admin.effyshopping.com/auth/callback"]
    logout_urls   = ["https://admin.effyshopping.com/"]
  }
}
