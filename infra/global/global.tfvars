# global — the platform-wide root (010-domain-dns-foundation).
# Committed on purpose: nothing here is secret.

aws_region     = "ap-southeast-2"
aws_account_id = "724289623101"

root_domain = "effyshopping.com"

# ── 037-platform-email-delivery ───────────────────────────────────────────────────────────────
# The operator mail service's DKIM public key, issued 2026-08-05 (selector `google`, 2048-bit).
# ⚠ Public by design — it is published in DNS. See specs/037-platform-email-delivery/operator-inputs.md.
workspace_dkim_public_key = "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkyRkUetpWtK7H8qnKdNnYWr9SclhBrpQUKYJJvnTYBcyIheFiSUg5iuO/70BcgDB/4MlZOQDSwkbSh5jy+Zgo/FlMLo1HVbWIwq6zLnFzKNKvTFaMUB+v9vyX4/QX5k7XVNvgm8VxB+Mb6m3XwM3djRATn+eJz2ppb/TyfhyfbbhAdFncGDlri3DpJN001YscPvvVJdkCoWDj3SXeeF6fFAO4ByCv4IHcpLOJCSAbjE5dqHaGm4n5s6JcqPiHIFMHQgFVr45E8FiJG+xpZxS0fR6SzPdDL9ta8eZEBhRE3yDSlrcu4KFTIGkXDxj9jjcetk33RheGAoxxMqaxzbg9QIDAQAB"

dmarc_rua    = "mailto:dmarc@effyshopping.com"
dmarc_policy = "none"
