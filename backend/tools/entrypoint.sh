#!/bin/sh
set -e

# uploads/ ownership is baked into the image (see Dockerfile), so this script
# runs entirely as the unprivileged nest user.

# Exports JWT_SECRET, GOOGLE_CLIENT_SECRET and DATABASE_URL, and leaves
# FT_CLIENT_SECRET as a shell variable. Aborts if a secret is missing.
. /usr/local/bin/load-secrets.sh

echo ">> Running database migrations..."
npx prisma migrate deploy

echo ">> Starting application..."
# `env NAME=value` rather than `export`: the backend reads the 42 credentials
# as 42_CLIENT_SECRET, and a name starting with a digit is not a valid shell
# variable name — but env passes it through untouched.
exec env 42_CLIENT_SECRET="$FT_CLIENT_SECRET" "$@"
