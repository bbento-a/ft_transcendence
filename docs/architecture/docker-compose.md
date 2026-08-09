# docker-compose.yml

Describes the whole system: four services, four secrets, two networks, two
volumes.
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
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
    secrets:
      - postgres_password
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
| `POSTGRES_PASSWORD_FILE` | Read by the image itself: every `POSTGRES_*` variable has a `_FILE` twin, so no wrapper script is needed here. |
| `secrets:` | Mounts `secrets/postgres_password.txt` at `/run/secrets/postgres_password`, read-only. |

The user name and database name stay plain `environment:` on purpose. They are
not credentials, and the healthcheck needs them at the Compose level — a
`pg_isready` that had to read a file first would be a shell script, not a
one-liner.
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
      NODE_ENV: production
      PORT: 3000
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_HOST: db
      POSTGRES_PORT: 5432
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CALLBACK_URL: ${GOOGLE_CALLBACK_URL}
      42_CLIENT_ID: ${FT_CLIENT_ID}
      42_CALLBACK_URL: ${FT_CALLBACK_URL}
    secrets:
      - postgres_password
      - jwt_secret
      - google_client_secret
      - ft_client_secret
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

**`DATABASE_URL` is no longer here.** The password arrives as a file, so the
connection string is assembled from `POSTGRES_HOST`/`PORT`/`USER`/`DB` plus the
secret by `backend/tools/load-secrets.sh`. The four parts stay in this file so
the topology is still readable from Compose alone.

**Client ids and callback URLs are not secrets.** They travel in the browser's
address bar during the OAuth redirect, so they stay in `.env` — only the two
client *secrets* are mounted as files.

**`image:` on a built service** names the resulting image. Without it you get
`local_transcendence-backend`, which is harder to recognise in `docker images`.

### frontend

```yaml
  frontend:
    build: ./frontend
    image: transcendence-frontend
    environment:
      NODE_ENV: production
    secrets:
      - jwt_secret
    networks:
      - frontend_net
    expose:
      - "3000"
```

Receives **one** secret: `jwt_secret`, because `app/lib/session.ts` verifies
the session cookie before rendering. It gets no database password and no OAuth
credentials — those are not listed, so Compose does not mount them and
`/run/secrets/` inside the container holds `jwt_secret` and nothing else.

No `depends_on`. It does not need the backend at boot; nginx routes
independently, and a hard dependency would only make startup more fragile.

### nginx

```yaml
  nginx:
    build: ./nginx
    image: transcendence-nginx
    ports:
      - "2222:2222"
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

## Secrets

```yaml
secrets:
  postgres_password:
    file: ./secrets/postgres_password.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt
  google_client_secret:
    file: ./secrets/google_client_secret.txt
  ft_client_secret:
    file: ./secrets/ft_client_secret.txt
```

**Both halves are required**, same as volumes: the top-level block *declares*
where the value comes from, the `secrets:` list inside a service *mounts* it at
`/run/secrets/<name>`, read-only. A service that is not listed gets nothing.

The files are created by `make secrets` and are gitignored. They must exist
before `up` — a missing one fails with
`bind source path does not exist: .../secrets/jwt_secret.txt`, which is why
`up` and `dev` both depend on the `secrets` target.

### Why files instead of `environment:`

```sh
docker compose config        # the whole interpolated file — no secret in it
docker inspect backend       # the container's env — no secret in it either
```

An `environment:` value is stored in the container's configuration, so it shows
up in both of those, in `docker compose exec backend env`, and in the terminal
of anyone who runs them. A secret file is read by the entrypoint and passed to
the app process alone.

### Permissions, and why `uid`/`gid`/`mode` are not used

Compose accepts `uid`, `gid` and `mode` on a secret, but **only honours them in
swarm mode** — a plain `docker compose up` bind-mounts the host file exactly as
it is. The backend and frontend containers run as non-root users, so a `0600`
file on the host would give them `permission denied` on Linux.

`make secrets` therefore creates the files `0644` and the *directory* `0700`.
Other users on the host cannot traverse into the directory, while the Docker
daemon (root) still resolves the path when it sets up the mount.

### `environment:` vs `env_file:`

For everything that is *not* a credential, the file uses `environment:` maps
with `${VAR}` interpolation, never `env_file:`.

- **`env_file: .env`** passes the *entire file* into the container. Every
  service would then hold every value in it.
- **`environment:` + `${VAR}`** has Compose read `.env` on the host and inject
  only the named values.

A blank value in `docker compose config` means a variable name does not match
what is in `.env`.

---

## `ports` vs `expose`

| Directive | Effect | Reachable by |
|---|---|---|
| `ports: "2222:2222"` | publishes a host port (iptables DNAT) | anything reaching the host |
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

The override replaces `command` but deliberately **leaves `entrypoint` alone**.
The entrypoint is what loads the secrets and runs the migrations, and dev needs
both exactly as production does — overriding it would start the dev containers
with no `DATABASE_URL` and no `JWT_SECRET`.

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
