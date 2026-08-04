#!/bin/sh
set -e

# uploads/ ownership is baked into the image (see Dockerfile), so this script
# runs entirely as the unprivileged nest user.

echo ">> Running database migrations..."
npx prisma migrate deploy

echo ">> Starting application..."
exec "$@"
