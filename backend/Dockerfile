# syntax=docker/dockerfile:1.7

# ============================================================
#  Stage 1 — install ALL deps (including dev) from lockfile
# ============================================================
FROM node:20-alpine AS deps
WORKDIR /app

COPY app/package.json app/package-lock.json ./
RUN npm ci


# ============================================================
#  Stage 2 — build: prisma client + compiled dist/
# ============================================================
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY app/ ./

RUN npx prisma generate
RUN npm run build


# ============================================================
#  Stage 3 — runtime: prod deps + dist + prisma + non-root
# ============================================================
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY app/prisma ./prisma
COPY app/prisma.config.ts ./prisma.config.ts

COPY tools/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

RUN addgroup -S nest && adduser -S nest -G nest && chown -R nest:nest /app
USER nest

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/main"]
