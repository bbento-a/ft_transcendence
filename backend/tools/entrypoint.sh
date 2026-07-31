#!/bin/sh
set -e

mkdir -p /app/uploads/avatars
chown -R nest:nest /app/uploads

echo ">> Running database migrations..."
npx prisma migrate deploy

echo ">> Starting application..."
exec "$@"
