# qa — AUTHORED, NOT APPLIED (spec FR-011). Plans must stay clean with zero live
# resources until this env is deliberately promoted.

env        = "qa"
aws_region = "ap-southeast-1"

# Fill in before the first plan/apply — the placeholder fails validation loudly on purpose.
aws_account_id = "724289623101"

user_pool_tier = "ESSENTIALS"

# PROMOTION PREREQUISITE (research.md D6): before applying qa with real users, switch to
# SES — { email_sending_account = "DEVELOPER", source_arn = ..., from_email_address = ... }.
email_configuration = {
  email_sending_account = "COGNITO_DEFAULT"
}

auth_urls = {
  customer = {
    callback_urls = ["https://qa.effyshopping.com/auth/callback", "effy-customer://auth/callback"]
    logout_urls   = ["https://qa.effyshopping.com/", "effy-customer://signed-out"]
  }
  driver = {
    callback_urls = ["effy-driver://auth/callback"]
    logout_urls   = ["effy-driver://signed-out"]
  }
  shop = {
    callback_urls = ["https://shop.qa.effyshopping.com/auth/callback", "effy-shop://auth/callback"]
    logout_urls   = ["https://shop.qa.effyshopping.com/", "effy-shop://signed-out"]
  }
  back_office = {
    callback_urls = ["https://admin.qa.effyshopping.com/auth/callback"]
    logout_urls   = ["https://admin.qa.effyshopping.com/"]
  }
}
