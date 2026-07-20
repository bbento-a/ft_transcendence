# syntax=docker/dockerfile:1.7

# ============================================================
#  Stage 1 — install ALL deps from lockfile
# ============================================================
FROM node:20-alpine AS deps
WORKDIR /app

COPY app/package.json app/package-lock.json ./
RUN npm ci


# ============================================================
#  Stage 2 — build: produce Next.js standalone output
# ============================================================
FROM node:20-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY app/ ./

RUN npm run build


# ============================================================
#  Stage 3 — runtime: standalone server + static + public
# ============================================================
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S next && adduser -S next -G next

COPY --from=builder --chown=next:next /app/public ./public
COPY --from=builder --chown=next:next /app/.next/standalone ./
COPY --from=builder --chown=next:next /app/.next/static ./.next/static

USER next

EXPOSE 3000

CMD ["node", "server.js"]
