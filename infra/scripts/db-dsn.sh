#!/usr/bin/env bash
# Composes the libpq keyword-format DSN for one env from SSM /effy/<env>/db/{endpoint,port,name,
# master_username} and the master secret (ARN at /effy/<env>/db/master_secret_arn), printed to stdout for
# GOOSE_DBSTRING. Callers never echo it, write it to a file or pass it as an argument.
#
# Keyword format, not a URL: RDS passwords may contain characters an un-encoded URL corrupts.
# sslmode=require matches the forced-TLS posture; connect_timeout makes "not allowed" fail fast.
set -euo pipefail

ENV_NAME="${1:?usage: db-dsn.sh <dev|qa|staging|prod>}"
# The contract lives beside the resources (ap-southeast-2 today). Override only if an
# env's contract ever moves regions.
REGION="${EFFY_CONTRACT_REGION:-ap-southeast-2}"
PREFIX="/effy/${ENV_NAME}/db"

get_param() {
  aws ssm get-parameter --name "$1" --region "$REGION" --query Parameter.Value --output text 2> /dev/null ||
    {
      echo "db-dsn: missing/unreadable parameter $1 — is env '${ENV_NAME}' provisioned (002 contract), and is the 'ef' profile active?" >&2
      exit 1
    }
}

host="$(get_param "${PREFIX}/endpoint")"
port="$(get_param "${PREFIX}/port")"
dbname="$(get_param "${PREFIX}/name")"
user="$(get_param "${PREFIX}/master_username")"
secret_arn="$(get_param "${PREFIX}/master_secret_arn")"

password="$(
  aws secretsmanager get-secret-value --secret-id "$secret_arn" --region "$REGION" \
    --query SecretString --output text | python3 -c 'import sys, json; print(json.load(sys.stdin)["password"])'
)" || {
  echo "db-dsn: could not fetch the master secret from Secrets Manager (${secret_arn})" >&2
  exit 1
}

printf 'host=%s port=%s dbname=%s user=%s password=%s sslmode=require connect_timeout=10\n' \
  "$host" "$port" "$dbname" "$user" "$password"
