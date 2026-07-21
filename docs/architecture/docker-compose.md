# docker-compose.yml

Describes the whole system: four services, two networks, one volume.
Lives at the project root because it orchestrates everything — no single
service owns it.

Related: [nginx](nginx.md) · [backend](backend.md) · [frontend](frontend.md)
· [database](database.md) · [Makefile](makefile.md)

---

## Why there is no `version:` key

`version: "3.8"` has been obsolete since Compose v2 and now emits a warning.
The Compose Specification is versionless — the file is validated against
whatever Compose you have. Omitting it is correct, not an oversight.

---

## Services

### db

```yaml
  db:
    image: postgres:15-alpine
    container_name: db
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks:
      - backend_net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 5
```

| Directive | Reason |
|---|---|
| `postgres:15-alpine` | Pinned major — 16 changes defaults. Alpine is ~80MB vs ~380MB. |
| `restart: unless-stopped` | Recovers from crashes and host reboots, but respects a deliberate `docker stop`. `always` would fight manual stops. |
| `environment` (map) | Per-service scoping — see below. |
| `volumes: pg_data:` | Named volume, so data survives `down`. See [database](database.md). |
| `networks: backend_net` | Data tier only. nginx and frontend cannot reach it. |
| `healthcheck` | Gate for `depends_on`. See [database](database.md). |
| **no `ports:`** | Not published. Nothing on the host or LAN can connect. |

### backend

```yaml
  backend:
    build: ./backend
    image: transcendence-backend
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=public
      JWT_SECRET: ${JWT_SECRET}
      NODE_ENV: production
      PORT: 3000
    networks:
      - frontend_net
      - backend_net
    depends_on:
      db:
        condition: service_healthy
    expose:
      - "3000"
```

**`@db:5432`, not `@localhost:5432`.** Inside a container `localhost` is that
container itself. `db` is resolved by Docker's embedded DNS on `backend_net`.

**Both networks.** The backend is the only bridge between the app tier and the
data tier. This is deliberate and is the whole point of the split.

**`DATABASE_URL` composed from parts.** Credentials are defined once in `.env`;
the connection string is assembled here. Hardcoding a second copy is how the
two drift apart.

**`image:` on a built service** names the resulting image. Without it you get
`local_transcendence-backend`, which is harder to recognise in `docker images`.

### frontend

```yaml
  frontend:
    build: ./frontend
    image: transcendence-frontend
    environment:
      NODE_ENV: production
    networks:
      - frontend_net
    expose:
      - "3000"
```

Receives **no secrets** — not `JWT_SECRET`, not any `POSTGRES_*`. If the
frontend container is ever compromised, `env` yields nothing useful.

No `depends_on`. It does not need the backend at boot; nginx routes
independently, and a hard dependency would only make startup more fragile.

### nginx

```yaml
  nginx:
    build: ./nginx
    image: transcendence-nginx
    ports:
      - "443:443"
    networks:
      - frontend_net
    depends_on:
      - frontend
      - backend
```

The **only** service with `ports:`. One published port in the entire stack.

`depends_on` uses the plain list form on purpose — see
[startup ordering](#depends_on-two-forms-two-jobs).

---

## `environment:` vs `env_file:`

The file uses `environment:` maps with `${VAR}` interpolation, never
`env_file:`.

- **`env_file: .env`** passes the *entire file* into the container. Every
  service would then hold every secret.
- **`environment:` + `${VAR}`** has Compose read `.env` on the host and inject
  only the named values.

That is what makes per-service scoping possible: the db gets `POSTGRES_*`, the
backend gets `DATABASE_URL` and `JWT_SECRET`, the frontend gets neither.

Verify with:

```sh
docker compose config          # shows the fully interpolated file
```

A blank value (`postgresql://:@db:5432/`) means a variable name does not match
what is in `.env`.

---

## `ports` vs `expose`

| Directive | Effect | Reachable by |
|---|---|---|
| `ports: "443:443"` | publishes a host port (iptables DNAT) | anything reaching the host |
| `expose: "3000"` | metadata only — changes nothing | (no effect) |
| neither | default | any container on a shared network |

**`expose` is not a security control.** On a user-defined bridge network,
containers can already reach every port on every other container in that
network. Deleting the `expose` lines would change nothing functionally; they
are kept as documentation of which port each service speaks on.

`ports` is the real control, and there is exactly one.

---

## `depends_on`: two forms, two jobs

### Condition form — backend waits for db

```yaml
    depends_on:
      db:
        condition: service_healthy
```

Blocks until the db healthcheck passes. Without it:

```
t=0.0s  db starts, Postgres begins initdb
t=0.1s  backend starts (process running → Compose satisfied)
t=0.3s  Prisma connects → ECONNREFUSED
t=0.4s  backend crashes → restart → loop
```

This fails specifically on a **fresh clone with an empty volume** — the
evaluation scenario. On the second run the volume already exists, Postgres
starts in a second, and the bug appears to vanish.

Available conditions: `service_started` (default, weak),
`service_healthy`, `service_completed_successfully`.

### List form — nginx waits only for existence

```yaml
    depends_on:
      - frontend
      - backend
```

nginx connects to upstreams per request, not at boot, so it does not need them
*ready*. But it does need their names to exist in DNS: nginx aborts at config
load with `host not found in upstream` if a name cannot be resolved. The list
form guarantees existence without waiting for health.

### Limitations

`depends_on` controls **startup order only**. If the db dies an hour later,
nothing stops or restarts the backend — that is `restart: unless-stopped` plus
application-level reconnection. It is also Compose-specific: `docker run` and
Kubernetes ignore it entirely.

---

## Networks

```yaml
networks:
  frontend_net:
    driver: bridge
  backend_net:
    driver: bridge
    internal: true
```

Containers that do not share a network **cannot reach each other at all** —
there is no port to block, there is no route. Access is granted by joining a
network, not denied by a rule.

`internal: true` removes the gateway from `backend_net`, so nothing on it can
make an outbound connection. Even with code execution inside the db container
there is nowhere to exfiltrate to. This is also why the backend needs
`frontend_net` — it requires outbound access that `backend_net` cannot provide.

See the access matrix in [ARCHITECTURE.md](ARCHITECTURE.md#access-matrix).

---

## Volumes

```yaml
volumes:
  pg_data:
```

The empty value is not incomplete — every option (`driver: local`,
`driver_opts`, `name`) is either the default or irrelevant for local storage.

**Both halves are required.** The top-level entry *declares* a named, Docker-
managed volume; the entry under `db` *mounts* it. Writing only the mount, with
no top-level declaration, makes Compose interpret `pg_data:/var/...` as a
**bind mount from a relative host path** — silently wrong.

---

## The dev override

`docker-compose.override.yml` is loaded automatically. Naming the base file
explicitly is what suppresses it.

```sh
docker compose up                          # base + override → dev
docker compose -f docker-compose.yml up    # base only       → production
```

These are `make dev` and `make up`. Merge semantics: maps like `environment`
merge key-by-key; scalars like `command` are replaced wholesale.

Full detail in [ARCHITECTURE.md §9](ARCHITECTURE.md#9-dev-vs-production).

---

## Verifying

```sh
docker compose config                       # validate + show interpolated
docker compose config --services            # list service names
docker compose -f docker-compose.yml config # production only, no override
docker compose ps                           # running state + health
```

`config` validates YAML and variable interpolation only. It does **not** read
the Dockerfiles — build errors surface at `docker compose build`.
