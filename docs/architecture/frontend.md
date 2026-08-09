# frontend/

Next.js, built as a three-stage Docker image using `output: 'standalone'`.

```
frontend/
├── Dockerfile
├── .dockerignore
└── app/            ← the Next.js project (package.json lives here)
```

Related: [docker-compose](docker-compose.md) · [nginx](nginx.md)

---

## The three stages

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci
```

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY app/ ./
RUN npm run build
```

```dockerfile
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
```

Manifests are copied before source so the `npm ci` layer stays cached across
code changes — same reasoning as the [backend](backend.md#stage-1--deps).

---

## `output: 'standalone'` — required

`next.config.ts` **must** contain:

```ts
const nextConfig: NextConfig = {
  output: 'standalone',
};
```

Without it the build still succeeds, but `.next/standalone/` is never produced
and the runtime stage fails on `COPY`. This is the most common Next-in-Docker
failure, and the error message does not point at the cause.

### What it does

Next traces which modules the app actually imports at runtime and emits:

- a generated **`server.js`** — a minimal Node HTTP server, no Next CLI needed
- a **pruned `node_modules`** containing only what is genuinely reachable

That is why the runtime stage never runs `npm ci`: the "install production
dependencies" step was done by the build. Final image lands around 150MB
instead of ~1GB.

### Why three separate COPY lines

Standalone output deliberately excludes static assets, so they are copied
alongside it:

| Path | Contents |
|---|---|
| `.next/standalone` | `server.js` + traced `node_modules` |
| `.next/static` | compiled JS/CSS chunks — **not** included in standalone |
| `public` | images, fonts, favicon |

Miss `.next/static` and the page renders unstyled with 404s for every chunk.

---

## Environment variables

| Variable | Why |
|---|---|
| `NODE_ENV=production` | React production build; disables dev warnings. Matters for the subject's "no console warnings" rule. |
| `NEXT_TELEMETRY_DISABLED=1` | Next phones home by default. Off in build and runtime. |
| `PORT=3000` | Read by `server.js`. |
| `HOSTNAME=0.0.0.0` | **Required.** Standalone binds `localhost` by default, which inside a container means *only that container* — nginx could not reach it. |

The frontend receives exactly **one** secret, and never as a compose variable:
`jwt_secret`, mounted as a file at `/run/secrets/jwt_secret`. `tools/entrypoint.sh`
reads it and execs `server.js` with `JWT_SECRET` in the environment, which is
what `app/lib/session.ts` verifies the session cookie against.

No database password, no OAuth credentials — they are not listed for this
service in `docker-compose.yml`, so Compose does not mount them at all.

> Never put a secret in a `NEXT_PUBLIC_*` variable. Anything with that prefix
> is inlined into the browser bundle and readable by any visitor. If the
> frontend needs configuration, fetch it from the backend.

---

## .dockerignore

```
app/node_modules
app/.next
app/out
app/.git
app/.env
app/.env.*
app/README.md
app/coverage
**/*.log
.DS_Store
```

`app/.next` matters as much as `node_modules` here: a stale local build
directory copied into the image can shadow the fresh one and produce confusing
hydration mismatches.

---

## Contract for the app code

1. **`output: 'standalone'` in `next.config.ts`** — build fails without it.
2. **Call the API with relative URLs**: `fetch('/api/auth/login')`. Everything
   is same-origin behind nginx, so no host and no CORS.
3. **Send credentials on auth requests**: `credentials: 'include'`, so the
   `httpOnly` JWT cookie is attached.
4. `package.json` needs `dev`, `build`, and (for non-standalone fallback)
   `start` scripts.
5. No secrets in `NEXT_PUBLIC_*`.

### Example — login

```ts
const res = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ email, password }),
});
```

No hostname, no port, no CORS headers. nginx maps `/api/auth/login` to
`backend:3000/auth/login`.

### Example — WebSocket

```ts
import { io } from 'socket.io-client';
const socket = io({ withCredentials: true });   // same origin, /socket.io/
```

Passing no URL makes Socket.IO use the current origin, which nginx already
proxies. Hardcoding `http://localhost:3000` would bypass the proxy and fail.

---

## Dev mode

```yaml
    build:
      context: ./frontend
      target: deps
    volumes:
      - ./frontend/app:/app
      - /app/node_modules
    command: ["/bin/sh", "-c", "npm run dev -- -H 0.0.0.0 -p 3000"]
```

`-H 0.0.0.0` is required for the same reason as `HOSTNAME` in production:
`next dev` binds localhost by default and would be unreachable from nginx.

**`entrypoint` is not overridden.** `tools/entrypoint.sh` is copied in the
`deps` stage, so the dev image has it too, and it is what puts `JWT_SECRET`
into the environment — overriding it would leave `next dev` unable to validate
any session. Only `command` changes between the two stacks.

> **The script must stay a single argument to `sh -c`.** `sh -c` runs only its
> *first* argument as the script, and Compose splits an unquoted `command:` on
> whitespace — so `command: npm run dev -- -H 0.0.0.0 -p 3000` executes bare
> `npm` and the container restart-loops while printing npm's help text. The
> exec-form list above keeps the three arguments explicit.

Hot reload uses a WebSocket, which is why `location /` in
[nginx.conf](nginx.md) carries the upgrade headers too — without them HMR
breaks and the console fills with reconnection errors.

The anonymous `/app/node_modules` volume shields the image's Linux-built
modules from the host mount. After changing `package.json`, run `make re` or
the stale volume persists.

---

## Verifying

```sh
docker compose build frontend
docker images transcendence-frontend        # expect ~150–250MB
docker compose logs -f frontend
docker compose exec frontend ls .next/static  # assets present?
```

If `COPY .next/standalone` fails → `output: 'standalone'` is missing.
If pages render unstyled → `.next/static` was not copied.
If nginx returns 502 for `/` → the server bound to localhost instead of
`0.0.0.0`.
