#!/bin/sh
set -e

# ------------------------------------------------------------
#  Secrets -> environment
#
#  The frontend needs exactly one secret: JWT_SECRET. proxy.ts
#  (the Next middleware) and the landing page both call
#  app/lib/session.ts to verify the access_token cookie, and that
#  verification has to use the same key the backend signs with.
#
#  It is read here at boot rather than passed through
#  `environment:`, so the value stays out of the compose file and
#  out of `docker inspect`. It is server-side only — it is never
#  NEXT_PUBLIC_*, so it never reaches the browser bundle.
# ------------------------------------------------------------

file="/run/secrets/jwt_secret"
if [ ! -r "$file" ]; then
	echo ">> ERROR: secret 'jwt_secret' is missing or unreadable at $file" >&2
	echo ">>        run 'make secrets' on the host, then rebuild." >&2
	exit 1
fi

JWT_SECRET=$(tr -d '\r\n' < "$file")
if [ -z "$JWT_SECRET" ]; then
	echo ">> ERROR: secret 'jwt_secret' is empty. Fill in secrets/jwt_secret.txt." >&2
	exit 1
fi
export JWT_SECRET

exec "$@"
