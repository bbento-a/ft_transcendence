# Sourced, never executed:  . /usr/local/bin/load-secrets.sh
#
# ============================================================
#  Turns the Docker secrets into environment variables.
#
#  Compose mounts every secret this service is listed for as a
#  read-only file under /run/secrets (see docker-compose.yml).
#  Exporting them here is what lets the Nest code keep reading
#  process.env / ConfigService without a single change.
#
#  Why not put the values straight into `environment:`? Then
#  they would show up in `docker compose config`, in
#  `docker inspect backend`, and in every `docker compose exec`
#  shell. As files they only reach the process that reads them.
#
#  Two callers: entrypoint.sh at boot, and `make shell-backend`,
#  so an interactive shell still has a usable DATABASE_URL for
#  prisma commands.
# ============================================================

set -e

# Echoes the secret's value. `set -e` aborts on a non-zero return, which is
# what we want: booting with an empty JWT_SECRET is worse than not booting.
read_secret() {
	file="/run/secrets/$1"

	if [ ! -r "$file" ]; then
		echo "!! missing secret: $file — run 'make secrets' on the host" >&2
		return 1
	fi

	# tr -d '\r' tolerates a file saved by a Windows editor; the command
	# substitution at the call site drops the trailing newline.
	value=$(tr -d '\r' < "$file")

	if [ -z "$value" ]; then
		echo "!! empty secret: $file" >&2
		return 1
	fi

	printf '%s' "$value"
}

# Assigned first, exported after. `export VAR=$(cmd)` would swallow a failing
# command substitution — the exit status reported is export's own, always 0.
JWT_SECRET=$(read_secret jwt_secret)
export JWT_SECRET

GOOGLE_CLIENT_SECRET=$(read_secret google_client_secret)
export GOOGLE_CLIENT_SECRET

# Deliberately left unexported: no POSIX shell accepts a variable name
# starting with a digit, so entrypoint.sh hands it over as 42_CLIENT_SECRET
# through `env` instead.
FT_CLIENT_SECRET=$(read_secret ft_client_secret)

# Assembled here rather than in docker-compose.yml, because the password now
# arrives as a file. The other halves are plain config and come from .env.
POSTGRES_PASSWORD=$(read_secret postgres_password)
DATABASE_URL="postgresql://${POSTGRES_USER:?POSTGRES_USER is not set}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-db}:${POSTGRES_PORT:-5432}/${POSTGRES_DB:?POSTGRES_DB is not set}?schema=public"
export DATABASE_URL
unset POSTGRES_PASSWORD
