package config

import (
	"fmt"
	"strings"
)

// composeDSN builds the libpq keyword-format DSN from the individual DB_* parts, for the
// cloud path (040) where DB_DSN is not supplied and the password arrives as an injected
// ECS secret. The shape is byte-for-byte the one infra/scripts/db-dsn.sh produces for the
// local loop, so both paths connect identically:
//
//	host=<h> port=<p> dbname=<n> user=<u> password=<pw> sslmode=require connect_timeout=10
//
// A missing part fails boot loudly with the variable NAMED — never a silent wrong or partial
// connection. The password value is never included in the error (secret discipline); only the
// variable name DB_PASSWORD is, when it is the thing that is absent.
func composeDSN(d DB) (string, error) {
	missing := make([]string, 0, 5)
	if d.Host == "" {
		missing = append(missing, "DB_HOST")
	}
	if d.Port == "" {
		missing = append(missing, "DB_PORT")
	}
	if d.Name == "" {
		missing = append(missing, "DB_NAME")
	}
	if d.User == "" {
		missing = append(missing, "DB_USER")
	}
	if d.Password == "" {
		missing = append(missing, "DB_PASSWORD")
	}
	if len(missing) > 0 {
		return "", fmt.Errorf(
			"config: DB_DSN is unset and the connection string cannot be composed — missing %s",
			strings.Join(missing, ", "),
		)
	}

	return fmt.Sprintf(
		"host=%s port=%s dbname=%s user=%s password=%s sslmode=require connect_timeout=10",
		d.Host, d.Port, d.Name, d.User, d.Password,
	), nil
}
