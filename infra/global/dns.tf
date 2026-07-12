# The platform's parent hosted zone — effyshopping.com.
#
# WHY THIS LIVES IN ITS OWN ROOT (010 research R1 — the load-bearing decision of the slice):
# env roots are DESIGNED to be destroyable. `make destroy ENV=dev` is a supported operation and was
# actually used during the 2026-07-12 region relocation. If this zone lived in infra/envs/dev, that
# routine command would destroy the platform's apex — every record under it, production's future
# delegation, and the name-servers GoDaddy points at. A re-created zone gets NEW name-servers, so
# recovery would require a manual registrar repoint plus a fresh propagation wait.
#
# ⚠ DO NOT DESTROY THIS ROOT CASUALLY. It is not an environment and is not in the ENV= workflow.
#
# Environments do NOT get their delegation record from here. Each env root creates its own child
# zone AND writes its own NS record into this zone (see modules/dns-env-zone). That keeps the
# delegation in the ENV's state, so destroying an env removes the delegation and the zone it points
# at together — no dangling delegation, no subdomain takeover (spec FR-005).

resource "aws_route53_zone" "parent" {
  name    = var.root_domain
  comment = "Effy platform apex — production namespace. Children are delegated per environment (010)."
}
