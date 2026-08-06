# One environment's email OUTCOME pipeline — the configuration set that makes every send
# attributable, and the topic its per-message outcomes are published to
# (037-platform-email-delivery; contracts/ses-event.contract.md).
#
# WHY THIS EXISTS, IN ONE SENTENCE: without a configuration set, SES publishes no per-message
# events, so the platform's only signal is an account-wide RATE — and a single person being locked
# out never moves a rate.
#
# ⚠ THE FAILURE THIS CLOSES IS NOT "WE LACK METRICS". When an address hard-fails once, SES records
# it and thereafter ACCEPTS every send and delivers nothing — the caller gets a success response and
# a message id, the sign-in screen says "we've sent you a code", and no code will ever arrive again.
# For driver, shop and back-office that is a permanent account lockout with no other credential to
# fall back on, and nobody is notified. This module is the only thing that can see it happen.

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

  # ── ⚠ THE SUPPRESSION OVERRIDE — READ BEFORE CHANGING (037 FR-041, research R3) ─────────────
  #
  # The account-level block list is ACCOUNT-WIDE AND REGION-WIDE. A developer testing with a
  # mistyped address in dev produces a hard bounce, the address is blocked, and a later PRODUCTION
  # send to that same person is accepted-and-dropped. A real customer becomes unreachable because
  # of a typo in a test. Passing an empty list here cancels both halves for this configuration
  # set — its sends neither ADD to the shared list nor are BLOCKED by it.
  #
  # ⚠ TRAP 1: `suppression_options {}` (an empty BLOCK) is NOT the same as `suppressed_reasons = []`
  # (an empty LIST). The provider's create path reads the raw config and tests IsNull(), not
  # emptiness, so an empty block sends nothing to the API and the set silently INHERITS account
  # settings — the exact opposite of the intent, with no error. The explicit list is load-bearing.
  #
  # ⚠ TRAP 2: the UPDATE path differs from the create path, and AWS does not document whether an
  # omitted SuppressedReasons means "override with nothing" or "clear the override". So this is
  # VERIFIED AGAINST THE LIVE API after apply, not inferred from the plan:
  #     aws sesv2 get-configuration-set --configuration-set-name <name> --query 'SuppressionOptions'
  #     {"SuppressedReasons": []} → override active.   null/absent → INHERITING, FR-041 unmet.
  #
  # ⚠ TRAP 3: AWS's own GLOBAL suppression list still applies regardless. This buys no immunity
  # from it, and it is not customer-controlled.
  suppression_options {
    suppressed_reasons = var.suppressed_reasons
  }
}

# ── Where outcomes go ─────────────────────────────────────────────────────────────────────────
# One topic per environment. The consumer subscribes from serverless.yml (the Lambda is deployed by
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

    # Only THIS account's SES may publish here.
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
    # ⚠ DEFAULTS TO FALSE IN THE PROVIDER. An event destination created without this is INERT and
    # looks perfectly healthy in the console — the exact shape of silent failure this whole slice
    # exists to end. Set explicitly, and never remove.
    enabled = true

    # BOUNCE + COMPLAINT are the ones that lock people out. DELIVERY is what lets an address be
    # marked reachable again, so the state can recover rather than only decay. REJECT and
    # DELIVERY_DELAY are cheap and diagnostic.
    #
    # SEND is omitted: it doubles the volume and tells us nothing the call site does not already
    # know. OPEN and CLICK are REFUSED, not merely unsubscribed — they require a tracking pixel and
    # link rewriting, which on a one-time sign-in code is useless to the product and a privacy cost
    # paid by the recipient for nothing.
    matching_event_types = ["BOUNCE", "COMPLAINT", "DELIVERY", "REJECT", "DELIVERY_DELAY"]

    sns_destination {
      topic_arn = aws_sns_topic.events.arn
    }
  }
}

# ── ⚠ NO SUBSCRIPTION MANAGEMENT, DELIBERATELY (037 FR-018 / SC-017) ─────────────────────────
#
# This configuration set carries NO list-management / subscription-management configuration, and
# must never gain one. Every message that flows through it is a one-time sign-in or verification
# code, and an unsubscribe affordance on one of those lets a person opt out of their own ability to
# sign in — permanently, with no way back that does not involve an operator.
#
# This matters NOW rather than in the abstract: 037 routes Cognito's own messages through this set
# for the first time, so anything configured here reaches sign-up confirmation and password
# recovery too. Google and Yahoo require one-click unsubscribe only for MARKETING mail and
# explicitly exclude transactional messages, naming password resets as an example — so there is no
# compliance pressure to add one either.
