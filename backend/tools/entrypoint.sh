#!/bin/sh
set -e

# Shared by both stacks: production runs it as the unprivileged nest user
# (uploads/ ownership is baked into the image, see Dockerfile), dev runs it
# as root from the deps stage. It needs no privileges either way.

# ------------------------------------------------------------
#  Secrets -> environment
#
#  Compose mounts every secret this service declares as a
#  read-only file under /run/secrets/. Nest reads plain env vars
#  (process.env and ConfigService), so the files are loaded here,
#  once, just before the app starts.
#
#  Doing it here instead of in `environment:` is the whole point:
#  the values never appear in the compose file, in `docker inspect`,
#  or in any image layer.
# ------------------------------------------------------------

read_secret() {
	file="/run/secrets/$1"
	if [ ! -r "$file" ]; then
		echo ">> ERROR: secret '$1' is missing or unreadable at $file" >&2
		echo ">>        run 'make secrets' on the host, then rebuild." >&2
		exit 1
	fi
	value=$(tr -d '\r\n' < "$file")
	if [ -z "$value" ]; then
		echo ">> ERROR: secret '$1' is empty. Fill in secrets/$1.txt." >&2
		exit 1
	fi
	printf '%s' "$value"
}

# Prisma wants a single connection URL, not separate fields, so it is
# assembled here. Only the password is a secret — the role and database name
# are plain config and arrive through the environment from .env.
#
# The password is generated with `openssl rand -hex`, so it is URL-safe by
# construction. If you ever set one by hand, keep it alphanumeric or
# percent-encode it yourself, otherwise it will corrupt the URL.
PG_PASSWORD=$(read_secret postgres_password)
export DATABASE_URL="postgresql://${POSTGRES_USER}:${PG_PASSWORD}@${DB_HOST:-db}:${DB_PORT:-5432}/${POSTGRES_DB}?schema=public"

JWT_SECRET=$(read_secret jwt_secret);                     export JWT_SECRET
GOOGLE_CLIENT_ID=$(read_secret google_client_id);         export GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$(read_secret google_client_secret); export GOOGLE_CLIENT_SECRET

echo ">> Running database migrations..."
npx prisma migrate deploy

# Read into ordinary variables FIRST. read_secret's `exit 1` only kills the
# subshell that $( ) spawns, so a failure survives purely as an exit status —
# and `set -e` only sees that status on a plain assignment. Inline the
# substitutions into the `exec env` arguments below and the failure is
# swallowed: the app would boot with an empty 42_CLIENT_ID and only break
# later, at the first 42 login. Same trap as `export V=$(...)`, which is why
# the exports above are split from their assignments.
FT_CLIENT_ID=$(read_secret ft_client_id)
FT_CLIENT_SECRET=$(read_secret ft_client_secret)

echo ">> Starting application..."
# 42_CLIENT_ID / 42_CLIENT_SECRET cannot be exported: a shell variable name
# may not start with a digit. `env NAME=value cmd` has no such restriction,
# so the two 42 keys are handed straight to the child process. This is the
# same reason the host-side names are FT_* instead.
#
# exec, not a plain call: Node replaces this shell as PID 1 and so receives
# SIGTERM from `docker stop` directly, instead of it dying with the wrapper.
exec env \
	"42_CLIENT_ID=$FT_CLIENT_ID" \
	"42_CLIENT_SECRET=$FT_CLIENT_SECRET" \
	"$@"
