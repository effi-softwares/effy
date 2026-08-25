package config

import (
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
)

// ⚠ THE CONFIG CONTRACT (051 T032, applying 035's fourth defect to the hot path).
//
// In 035, the audience map read four env vars that `serverless.yml` never declared. Every pool resolved
// "unknown", no email was ever sent, and ONE HUNDRED PASSING TESTS MISSED IT — because the tests set
// those vars themselves. The defect was one of DEPLOYMENT WIRING, which no unit test can see unless it
// reads the real deployment file.
//
// This does that for core-api: it walks the `Config` struct for every REQUIRED variable and asserts the
// deployed task definition declares it, either as plaintext `environment` or as an injected `secrets`
// entry. 051 adds no new variable — it reuses the existing Stripe secret — so this passes today. It is
// written now because the next feature that adds one will otherwise repeat 035 exactly, and because a
// guard added after the incident is a guard added too late.
//
// ⚠ It reads the TERRAFORM SOURCE, not a fixture. A fixture would agree with the code instead of with
// the world, which is this repo's most-repeated failure mode (027 R13, 029, 033, 035).

const coreAPITerraform = "../../../../../infra/envs/dev/core-api.tf"

// requiredEnvNames walks the config struct and returns the full env name of every `required` field,
// applying nested `envPrefix` tags the way the env parser does.
func requiredEnvNames(t reflect.Type, prefix string) []string {
	var out []string
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		if f.Type.Kind() == reflect.Struct {
			out = append(out, requiredEnvNames(f.Type, prefix+f.Tag.Get("envPrefix"))...)
			continue
		}
		tag := f.Tag.Get("env")
		if tag == "" || !strings.Contains(tag, "required") {
			continue
		}
		out = append(out, prefix+strings.Split(tag, ",")[0])
	}
	return out
}

func TestEveryRequiredEnvVarIsDeclaredInTheTaskDefinition(t *testing.T) {
	raw, err := os.ReadFile(filepath.Clean(coreAPITerraform))
	if err != nil {
		t.Fatalf("cannot read the deployment file at %s: %v\n"+
			"⚠ This test is worthless if it silently skips — that is exactly how 035 shipped.", coreAPITerraform, err)
	}
	tf := string(raw)

	required := requiredEnvNames(reflect.TypeOf(Config{}), "")
	if len(required) == 0 {
		t.Fatal("found no required env vars — the struct walk is broken, and a guard that finds nothing always passes")
	}

	// A declaration is `NAME = ...` at the start of a line in either the environment or secrets map.
	declared := func(name string) bool {
		return regexp.MustCompile(`(?m)^\s*` + regexp.QuoteMeta(name) + `\s*=`).MatchString(tf)
	}

	for _, name := range required {
		if !declared(name) {
			t.Errorf("config requires %s but %s never declares it — the service boots fail-closed in dev "+
				"and dies on deploy, or worse, resolves an empty value (035's defect)", name, coreAPITerraform)
		}
	}
}

// ⚠ The Stripe SECRET must be injected, never written into the task definition in plaintext, where it
// would sit readable in Terraform state and in the ECS console (SC-012).
func TestStripeSecretsAreInjectedNotPlaintext(t *testing.T) {
	raw, err := os.ReadFile(filepath.Clean(coreAPITerraform))
	if err != nil {
		t.Fatalf("cannot read %s: %v", coreAPITerraform, err)
	}
	tf := string(raw)

	secretsBlock := regexp.MustCompile(`(?s)secrets\s*=\s*\{(.*?)\n\s*\}`).FindStringSubmatch(tf)
	if secretsBlock == nil {
		t.Fatal("no `secrets = {}` block in the task definition — the Stripe key would have to be plaintext")
	}
	for _, name := range []string{"STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"} {
		if !strings.Contains(secretsBlock[1], name) {
			t.Errorf("%s is not in the injected `secrets` block; a payment secret must never be plaintext task-definition config", name)
		}
	}
}
