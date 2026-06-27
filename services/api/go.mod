module github.com/effy/effy/services/api

go 1.25

// Hot-path service dependencies (Principle III + Tech Standards).
// Versions are a best-effort starting point; run `go mod tidy` to reconcile + add indirects.
require (
	github.com/aws/aws-sdk-go-v2/config v1.27.43
	github.com/aws/aws-sdk-go-v2/service/ssm v1.55.4
	github.com/gin-gonic/gin v1.10.0
	github.com/jackc/pgx/v5 v5.7.1
	github.com/lestrrat-go/jwx/v2 v2.1.3
	github.com/pressly/goose/v3 v3.22.1
)
