# syntax=docker/dockerfile:1.7

# ============================================================
#  Stage 1 — install ALL deps from lockfile
# ============================================================
FROM node:20-alpine AS deps
WORKDIR /app

COPY app/package.json app/package-lock.json ./
# npm ci (not install): installs EXACTLY the lockfile, never rewrites it, so
# every build gets the same dependency tree. The cache mount keeps npm's
# download cache between builds — only changed packages get downloaded.
RUN --mount=type=cache,target=/root/.npm npm ci

# The entrypoint lives in this stage, after npm ci so editing it does not
# invalidate the install layer. `make dev` stops the build here, and dev needs
# the same secret loading as production — only CMD differs.
COPY tools/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]


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

# Already copied and made executable in the deps stage; reuse it so the two
# stacks can never drift apart.
COPY --from=deps /usr/local/bin/entrypoint.sh /usr/local/bin/entrypoint.sh

USER next

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
