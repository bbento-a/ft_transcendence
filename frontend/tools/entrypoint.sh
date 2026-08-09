#!/bin/sh
set -e

# ============================================================
#  Reads the Docker secrets, then starts whatever CMD asks for.
#
#  The frontend needs exactly one: jwt_secret, to verify the
#  session cookie (app/lib/session.ts). It has no database
#  access and never sees the OAuth secrets.
#
#  Duplicated from backend/tools/entrypoint.sh on purpose — a
#  Dockerfile can only COPY from inside its own build context,
#  and the two contexts are ./frontend and ./backend.
# ============================================================

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

JWT_SECRET=$(read_secret jwt_secret)

exec env JWT_SECRET="$JWT_SECRET" "$@"
