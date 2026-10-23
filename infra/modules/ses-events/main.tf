# One environment's email outcome pipeline: the configuration set that makes every send attributable, and
# the topic its per-message outcomes go to. Without it SES publishes only an account-wide rate, and one
# address that hard-failed (accepted and silently dropped ever after; for the internal audiences a
# permanent lockout) never moves a rate.

resource "aws_sesv2_configuration_set" "this" {
  configuration_set_name = "${var.name_prefix}-mail"
  tags                   = var.tags

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  delivery_options {
    tls_policy = "REQUIRE"
  }

  # The suppression override. The account's block list is account- and region-wide, so a dev typo's bounce
  # would make a real person unreachable later. An empty list here means this set's sends neither add to it
  # nor are blocked by it.
  #
  # `suppression_options {}` (an empty block) is not `suppressed_reasons = []`: the create path tests IsNull,
  # so an empty block sends nothing and silently inherits the account setting. The update path is
  # undocumented, so verify against the live API after apply:
  # aws sesv2 get-configuration-set --configuration-set-name <name> --query 'SuppressionOptions'
  # {"SuppressedReasons": []} → override active; null/absent → inheriting.
  # AWS's own global suppression list still applies regardless.
  suppression_options {
    suppressed_reasons = var.suppressed_reasons
  }
}

# ── Where outcomes go ─────────────────────────────────────────────────────────────────────────
# one topic per environment. The consumer subscribes from serverless.yml (the Lambda is deployed by
# the Serverless Framework, not by Terraform), reading this ARN from the SSM contract — so Terraform
# owns the topic and its policy, and the deploy owns the subscription.
resource "aws_sns_topic" "events" {
  name = "${var.name_prefix}-ses-events"
  tags = var.tags
}

data "aws_iam_policy_document" "events_publish" {
  statement {
    sid       = "AllowSESToPublishOutcomes"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.events.arn]

    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }

    # Only this account's SES may publish here.
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [var.aws_account_id]
    }
  }
}

resource "aws_sns_topic_policy" "events" {
  arn    = aws_sns_topic.events.arn
  policy = data.aws_iam_policy_document.events_publish.json
}

resource "aws_sesv2_configuration_set_event_destination" "sns" {
  configuration_set_name = aws_sesv2_configuration_set.this.configuration_set_name
  event_destination_name = "${var.name_prefix}-outcomes"

  event_destination {
    # defaults to false in the provider. An event destination created without this is inert and
    # looks perfectly healthy in the console — the exact shape of silent failure this whole slice
    # exists to end. Set explicitly, and never remove.
    enabled = true

    # bounce + complaint are the ones that lock people out. Delivery is what lets an address be
    # marked reachable again, so the state can recover rather than only decay. Reject and
    # DELIVERY_DELAY are cheap and diagnostic.
    #
    # send is omitted: it doubles the volume and tells us nothing the call site does not already
    # know. Open and click are refused, not merely unsubscribed — they require a tracking pixel and
    # link rewriting, which on a one-time sign-in code is useless to the product and a privacy cost
    # paid by the recipient for nothing.
    matching_event_types = ["BOUNCE", "COMPLAINT", "DELIVERY", "REJECT", "DELIVERY_DELAY"]

    sns_destination {
      topic_arn = aws_sns_topic.events.arn
    }
  }
}

# No subscription management, and never any: every message through this set (Cognito's included) is a
# sign-in or verification code, and an unsubscribe would let a person opt out of signing in. One-click
# unsubscribe is required only for marketing mail.
