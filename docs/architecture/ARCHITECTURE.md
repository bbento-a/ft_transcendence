# Architecture

How the containers are organised, why, and what each file does.
For how to *run* it, see the README.

---

## 1. Overview

Four containers behind a single reverse proxy. Only nginx is reachable from
outside; everything else talks over private Docker networks.

```
   ┌──────────────────────── HOST ─────────────────────────┐
   │                                                        │
   │   Browser ──── https://localhost ────► :443            │
   │                                          │             │
   │  ═══════════════════════════════════════ │ ══════════  │
   │                                          ▼             │
   │  ╔═════════════════ frontend_net ═══════════════════╗  │
   │  ║                                                   ║  │
   │  ║   ┌───────┐      ┌──────────┐     ┌─────────┐   ║  │
   │  ║   │ nginx │─────►│ frontend │     │ backend │   ║  │
   │  ║   │ :443  │      │  :3000   │     │  :3000  │   ║  │
   │  ║   │ TLS   │──────────────────────►│         │   ║  │
   │  ║   └───────┘      │ Next.js  │     │ NestJS  │   ║  │
   │  ║                  └──────────┘     └────┬────┘   ║  │
   │  ╚════════════════════════════════════════│════════╝  │
   │                                            │            │
   │                    only container on both networks      │
   │                                            │            │
   │  ╔═════════════════ backend_net ══════════ │ ════════╗  │
   │  ║  internal: true — no route to internet   ▼        ║  │
   │  ║                                    ┌──────────┐   ║  │
   │  ║                                    │    db    │   ║  │
   │  ║                                    │  :5432   │   ║  │
   │  ║                                    │ Postgres │   ║  │
   │  ║                                    └──────────┘   ║  │
   │  ╚═══════════════════════════════════════════════════╝  │
   └────────────────────────────────────────────────────────┘
```

**Stack:** Next.js (frontend) · NestJS + Prisma (backend) · PostgreSQL 15 (db)
· nginx (reverse proxy + TLS)

---

## 2. Directory layout

```
local_transcendence/
├── Makefile                    single entry point (make up / make dev)
├── docker-compose.yml          production stack
├── docker-compose.override.yml dev stack (auto-loaded by compose)
├── .env                        real secrets — gitignored
├── .env.example                same keys, placeholder values — committed
├── .gitignore
├── ARCHITECTURE.md             this file
├── README.md
│
├── nginx/
│   ├── Dockerfile
│   ├── nginx.conf              TLS + routing
│   └── tools/
│       └── gen-cert.sh         self-signed cert, run at image build
│
├── frontend/
│   ├── Dockerfile              3-stage build
│   ├── .dockerignore
│   └── app/                    ← Next.js project goes here
│
└── backend/
    ├── Dockerfile              3-stage build
    ├── .dockerignore
    ├── tools/
    │   └── entrypoint.sh       runs migrations, then starts Nest
    └── app/                    ← NestJS project goes here
```

Orchestration lives at the root; each service owns its Dockerfile next to the
code it builds, so a build context can never reach into a sibling service.

---

## 3. The containers

| Service | Image base | Port | Networks | Published? |
|---|---|---|---|---|
| `nginx` | `nginx:1.27-alpine` | 443 | `frontend_net` | **yes — 443** |
| `frontend` | `node:20-alpine` | 3000 | `frontend_net` | no |
| `backend` | `node:20-alpine` | 3000 | `frontend_net`, `backend_net` | no |
| `db` | `postgres:15-alpine` | 5432 | `backend_net` | no |

### nginx
The only entry point. Terminates TLS, then proxies plain HTTP to the two app
containers. Because everything is served from one origin (`https://localhost`),
there is no CORS to configure and cookies work without special handling.

### frontend
Next.js. In production runs the `standalone` output — a self-contained
`server.js` plus a minimal traced `node_modules`. Receives no secrets: its only
environment variable is `NODE_ENV`.

### backend
NestJS + Prisma. The only container on both networks, so it is the sole bridge
between the app tier and the data tier. Runs `prisma migrate deploy` on startup
via `tools/entrypoint.sh` before the app boots.

### db
PostgreSQL. Data lives in the named volume `pg_data`, which survives
`make clean` / `docker compose down` and is destroyed only by `make fclean`.

---

## 4. Networks

Two networks, drawn at the boundary where data at rest begins.

| | `frontend_net` | `backend_net` |
|---|---|---|
| Members | nginx, frontend, backend | backend, db |
| Internet access | yes | **no** (`internal: true`) |
| Purpose | serve requests | hold data |

**Why the split.** Containers that do not share a network cannot reach each
other at all — there is no port to block, there is simply no route. If the
frontend is compromised (SSRF, a malicious npm dependency), `db` does not
resolve. The attacker would have to compromise the backend as well.

**Why `internal: true`.** `backend_net` has no gateway, so nothing on it can
make an outbound connection. Even with code execution inside the db container,
there is nowhere to exfiltrate to.

### Access matrix

| From ↓ | nginx | frontend | backend | db | internet |
|---|:---:|:---:|:---:|:---:|:---:|
| host / LAN | ✅ :443 | ❌ | ❌ | ❌ | ✅ |
| nginx | — | ✅ | ✅ | ❌ | ✅ |
| frontend | ✅ | — | ✅ | ❌ | ✅ |
| backend | ✅ | ✅ | — | ✅ | ✅ |
| db | ❌ | ❌ | ✅ | — | ❌ |

---

## 5. Ports

Three distinct concepts that are easy to confuse:

| Directive | Effect | Reachable by |
|---|---|---|
| `ports: "443:443"` | **publishes** — opens a real host port | anything reaching the host |
| `expose: "3000"` | **documents only** — changes nothing | (no effect) |
| *(neither)* | default | any container on a shared network |

On a user-defined bridge network, containers can already reach every port on
every other container in that network. `expose` is documentation for humans;
`ports` is the only real access control — and the stack has exactly one.

Consequences once running:

```
curl https://localhost        →  works
curl http://localhost:3000    →  connection refused
psql -h localhost -p 5432     →  connection refused   (production)
```

Service discovery uses Docker's embedded DNS at `127.0.0.11`: `db`, `backend`
and `frontend` resolve by service name, scoped per network. This is why
`DATABASE_URL` points at `@db:5432` and not `localhost` — inside a container,
`localhost` is that container itself.

---

## 6. TLS

The subject requires HTTPS from the browser and permits plain HTTP between
containers. So nginx terminates TLS and is the only container that holds a
certificate.

```
Browser ──[ HTTPS / WSS ]──► nginx ──[ HTTP / WS ]──► frontend, backend
                                                          │
                                                          └─[ TCP ]─► db
```

`nginx/tools/gen-cert.sh` generates a self-signed cert at **image build time**.
The critical part:

```
-addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1"
```

Chrome has ignored the `CN` field since v58. Without a Subject Alternative Name
the cert is rejected outright with `ERR_CERT_COMMON_NAME_INVALID`.

The browser will still show a warning, because the certificate is self-signed
and no browser trusts it. Click **Advanced → Proceed to localhost**. This is
expected and unavoidable without a real domain.

---

## 7. Request routing

`nginx.conf` has three `location` blocks. nginx selects the **longest matching
prefix**, not the first one written.

| Request | Matches | Proxied to | Path rewritten? |
|---|---|---|---|
| `/api/auth/login` | `/api/` | `backend:3000/auth/login` | yes — `/api` stripped |
| `/socket.io/...` | `/socket.io/` | `backend:3000/socket.io/...` | no |
| `/gamerooms` | `/` | `frontend:3000/gamerooms` | no |
| `/_next/static/...` | `/` | `frontend:3000/...` | no |

**Why `/api` is stripped.** Nest controllers are declared as
`@Controller('auth')`, so the backend serves `/auth/login` and knows nothing
about `/api`. The prefix exists only so nginx can distinguish API traffic from
page traffic. Keeping the strip in nginx means the backend behaves identically
whether proxied or hit directly.

**Why socket.io is not stripped.** The Socket.IO client and the Nest gateway
both use `/socket.io/` already.

### Upstream resolution

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;
set $backend_upstream http://backend:3000;
proxy_pass $backend_upstream;
```

`proxy_pass` with a *literal* hostname resolves once at config load and caches
the IP forever — a restarted container with a new IP would produce permanent
502s. Using a variable forces resolution per request, via Docker's DNS.

Trade-off: variable-form `proxy_pass` disables automatic URI rewriting, which
is why `/api/` needs an explicit `rewrite` directive.

### WebSockets

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

This lets every location share one set of `proxy_set_header` directives:
`Connection: upgrade` on real WebSocket handshakes, `Connection: close`
otherwise. It also avoids an nginx trap — `proxy_set_header` is an array
directive, so a `location` that declares even one discards **all** inherited
ones. With the map, no location declares any, and inheritance works.

`proxy_read_timeout 3600s` on `/socket.io/` prevents the default 60s idle
timeout from killing spectator connections.

> If WebSocket upgrade headers are missing, Socket.IO **silently falls back to
> HTTP long-polling**. The game still appears to work, just slowly — which
> makes this a hard failure to diagnose.

---

## 8. Secrets

One `.env` at the root, gitignored, with a committed `.env.example` declaring
the same keys.

| Variable | Used by |
|---|---|
| `POSTGRES_USER` | db, and composed into `DATABASE_URL` |
| `POSTGRES_PASSWORD` | db, and composed into `DATABASE_URL` |
| `POSTGRES_DB` | db, and composed into `DATABASE_URL` |
| `JWT_SECRET` | backend only |

Each service receives **only what it needs** — `docker exec frontend env`
exposes no secrets. `DATABASE_URL` is assembled inside `docker-compose.yml`
from the `POSTGRES_*` parts, so credentials are defined in exactly one place.

`make up` generates `.env` on first run, with both secrets from
`openssl rand -hex 32`. Nothing sensitive is ever written into a committed file.

---

## 9. Dev vs production

Compose loads `docker-compose.override.yml` automatically. Naming the base file
explicitly is what suppresses it.

```
make dev  →  docker compose up -d --build                        (base + override)
make up   →  docker compose -f docker-compose.yml up -d --build   (base only)
```

| | production | dev |
|---|---|---|
| Build target | `runtime` (final stage) | `deps` (dependencies only) |
| Source | copied into image | bind-mounted from host |
| Command | `node dist/main` / `node server.js` | `nest start:dev` / `next dev` |
| `NODE_ENV` | `production` | `development` |
| Hot reload | no | yes |
| Postgres on host | not published | `127.0.0.1:5432` |
| nginx.conf | baked into image | live-mounted, `:ro` |

### The `node_modules` problem

Dev mounts host source over `/app`, which would also bury the container's
`node_modules` — a problem because some packages ship **native binaries built
for a specific OS and C library**. Prisma's query engine, for instance, differs
between macOS, Debian (glibc) and Alpine (musl). Host-installed modules cannot
run inside the container.

The fix is a second, anonymous volume:

```yaml
volumes:
  - ./backend/app:/app    # host source
  - /app/node_modules     # anonymous — initialised from the image
```

`/app/node_modules` is deeper than `/app`, so it mounts on top and shields the
image's correct Linux build. The host does not even need `node_modules`.

> **Consequence:** anonymous volumes persist across `up`/`down`. After anyone
> changes `package.json`, run `make re` or the container keeps the old modules.

---

## 10. Startup order

```
db starts
  └─ initdb, then pg_isready passes ──► HEALTHY
       └─ backend starts
            └─ prisma migrate deploy
                 └─ Nest listens on :3000
       └─ frontend starts (parallel, no dependency)
            └─ nginx starts, both upstreams resolvable ──► serving :443
```

`depends_on: db: condition: service_healthy` is what prevents the classic
crash loop: without it the backend starts while Postgres is still initialising,
fails to connect, and restarts until the database happens to be ready. That
failure appears specifically on a **fresh clone with an empty volume** — i.e.
during evaluation.

nginx uses the plain `depends_on` list form instead. It resolves upstreams
lazily per request, so it does not need them *ready* — only present in DNS, so
that config load does not abort with `host not found in upstream`.

`depends_on` governs startup only. If the db dies later, nothing restarts the
backend; that is handled by `restart: unless-stopped`.

---

## 11. Contract for the app code

The infrastructure assumes the following. Both are one-line changes and both
break the build if missing.

### backend/app/ (NestJS)

1. **`prisma` must be in `dependencies`**, not `devDependencies` — the runtime
   image runs `npm ci --omit=dev` and still needs the CLI for
   `prisma migrate deploy` at startup.
2. **`tsconfig.build.json` must exclude `prisma.config.ts`.** Prisma 7 keeps the
   database URL in that root-level file, and if Nest compiles it too, `tsc`
   recomputes the common root and emits `dist/src/main.js` instead of
   `dist/main.js` — the container then dies with
   `Cannot find module '/app/dist/main'`.
3. `npm run build` must produce `dist/main.js`.
4. Listen on port `3000` (`process.env.PORT ?? 3000`).
5. Routes are served **without** an `/api` prefix — nginx strips it.
6. CORS can be dropped entirely: everything is same-origin behind nginx.
7. For `Secure` cookies to be set correctly behind the proxy, enable trust
   proxy so Nest honours `X-Forwarded-Proto`. *(Not currently enabled — login
   works because nginx and the browser agree on HTTPS, but add it if cookie
   issues appear.)*

### frontend/app/ (Next.js)

1. **`next.config.ts` must set `output: 'standalone'`** — without it the build
   succeeds but `.next/standalone/` is never produced, and the Docker runtime
   stage fails on `COPY`.
2. Call the API with **relative URLs** (`fetch('/api/auth/login')`). Same-origin
   means no host, no CORS, and cookies are sent automatically with
   `credentials: 'include'`.
3. Never put a secret in a `NEXT_PUBLIC_*` variable — those are inlined into the
   browser bundle.

---

## 12. Known gotchas

| Symptom | Cause | Fix |
|---|---|---|
| Backend crash-loops on first run | Postgres still initialising | already handled by the healthcheck |
| `password authentication failed` after changing `.env` | Postgres bakes credentials into the volume on **first** boot only | `make fclean && make up` |
| Module not found after adding a dependency | anonymous `node_modules` volume is stale | `make re` |
| `COPY .next/standalone` fails | `output: 'standalone'` missing | add it to `next.config.ts` |
| Game feels laggy, no errors | WebSocket upgrade failing, Socket.IO fell back to polling | check the `/socket.io/` block |
| `ERR_CERT_COMMON_NAME_INVALID` | cert missing SANs | already handled in `gen-cert.sh` |
| Other localhost projects forced to HTTPS | HSTS header applies per host, ignoring port | clear at `chrome://net-internals/#hsts` |
| Cannot bind port 443 | rootless Docker/Podman restricts ports < 1024 | publish `8443:443` instead |
