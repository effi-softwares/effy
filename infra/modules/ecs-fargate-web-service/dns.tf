# ALIAS records (not CNAME) to the ALB — they resolve straight to the load balancer, cost
# nothing to query, and repoint transparently if the ALB is destroyed and recreated. Same
# pattern edge-domain.tf uses for the cold path.
resource "aws_route53_record" "a" {
  zone_id = var.zone_id
  name    = var.hostname
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "aaaa" {
  zone_id = var.zone_id
  name    = var.hostname
  type    = "AAAA"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}
