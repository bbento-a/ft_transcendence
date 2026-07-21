# Database

PostgreSQL 15, accessed exclusively by the backend through Prisma.

There is no `database/` folder and no Dockerfile — the official
`postgres:15-alpine` image is used unmodified. Everything is configured in
`docker-compose.yml`; the schema lives in `backend/app/prisma/`.

Related: [docker-compose](docker-compose.md) · [backend](backend.md)

---

## Why no Dockerfile

Nothing needs to be added to the official image. Writing a Dockerfile that only
says `FROM postgres:15-alpine` would add a layer of indirection with no
benefit, and the image would drift from upstream security updates.

A Dockerfile would only be justified for custom extensions (PostGIS, pgvector),
custom `postgresql.conf` tuning, or seed scripts in
`/docker-entrypoint-initdb.d/`. None apply — Prisma owns the schema.

---

## Service definition

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

**Pinned to 15.** Postgres major versions change defaults and are not
transparently compatible on-disk; `:latest` could break the stack between two
`make up` runs without any code change.

---

## Isolation

`db` is on **`backend_net` only**, and that network is `internal: true`.

| Property | Effect |
|---|---|
| Not on `frontend_net` | nginx and frontend cannot resolve or reach `db` at all |
| No `ports:` in production | Nothing on the host or LAN can connect |
| `internal: true` | No gateway — the db cannot make outbound connections |

The only container that can reach it is the backend. If the frontend is ever
compromised, `psql db` fails with **"could not resolve host"** — there is no
route to attack.

> The previous compose file published `5432:5432` with the password
> `admin_password` committed in the Makefile. Removing that line is the single
> largest security improvement in this setup.

---

## Port 5432

Nothing chose it — it is PostgreSQL's IANA-registered default, and the image
listens on it out of the box. Three places must agree: the server, the
`DATABASE_URL`, and `pg_isready`.

Since it is not published, 5432 is meaningful **only inside `backend_net`**.
Useful consequence: it cannot collide with a Homebrew Postgres or another 42
project's container. Each stack has its own private 5432. The same is true of
`frontend` and `backend` both using 3000.

---

## Healthcheck

```yaml
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 5
```

Docker only knows whether a process is **running**, which is weaker than
**ready**. Postgres spends its first seconds running `initdb`, creating the
database, and only then opening its socket.

`pg_isready` attempts a real connection and exits 0 only when the server
accepts queries as that user against that database.

States: `starting` → `healthy` or `unhealthy`. Failures during `starting` do
not count. Budget here is 5s × 5 = ~25s.

The consumer is:

```yaml
  backend:
    depends_on:
      db:
        condition: service_healthy
```

Without it the backend connects too early, crashes, and restart-loops — a bug
that appears **only on a fresh clone with an empty volume**, i.e. during
evaluation.

> If `initdb` ever exceeds the budget, add `start_period: 10s` — a grace window
> where failures are ignored entirely, without loosening the steady-state check.

---

## The volume

```yaml
    volumes:
      - pg_data:/var/lib/postgresql/data

volumes:
  pg_data:
```

Both halves are required: the top-level entry **declares** a Docker-managed
named volume, the service entry **mounts** it. Writing only the mount makes
Compose treat `pg_data:` as a *relative host path* bind mount — silently wrong.

**Why a named volume, not a bind mount:**

1. Container filesystems are ephemeral — `docker compose down` removes
   containers, so without a volume every `down`/`up` would wipe all users.
2. On macOS, bind-mounting a Postgres data directory goes through a
   filesystem-sharing layer that is slow for many-small-file workloads, and
   UID mapping produces `data directory has invalid permissions`. Named volumes
   live on a native Linux filesystem inside Docker's VM.
3. It cleanly separates `clean` from `fclean`.

| Command | Containers | **Volume** |
|---|:---:|:---:|
| `make clean` | removed | **kept** |
| `make fclean` | removed | **destroyed** |

Inspect:

```sh
docker volume ls
docker volume inspect local_transcendence_pg_data
```

---

## Credentials are baked in on first boot

**The most common confusion with this setup.**

`POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` are read **only when
the data directory is empty**. Postgres runs `initdb` once, creates the role
and database, and never consults those variables again.

So:

```
change POSTGRES_PASSWORD in .env
  → db container starts fine, still using the OLD password
  → backend fails authentication
```

**Fix:** `make fclean && make up` — wipe the volume so `initdb` re-runs.

Same applies across a team: whoever ran `make up` first "wins", and everyone
else must `fclean` before their own `.env` values take effect.

---

## Connection string

Assembled in `docker-compose.yml`, not stored in `.env`:

```yaml
DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=public
```

Credentials are defined once, in `.env`, and reused by both the db service and
the backend's URL — no drift.

**`@db:5432`, never `@localhost:5432`.** Inside a container `localhost` is that
container itself; the backend would find nothing.

> Generate passwords with `openssl rand -hex 32`. Hex output is `[0-9a-f]`
> only, so it can never contain `@`, `:`, `/` or `?` — characters that would
> break URL parsing. `make up` does this automatically.

---

## Schema and migrations

Prisma owns the schema. Three paths matter:

```
backend/app/
├── prisma.config.ts      ← connection URL lives HERE (Prisma 7)
└── prisma/
    ├── schema.prisma     models and relations
    └── migrations/       generated SQL, committed to git
```

### Where the connection URL lives

**Prisma 7 removed `url` from the schema.** Writing it there is now a hard
error:

```
error: The datasource property `url` is no longer supported in schema files.
       Move connection URLs for Migrate to `prisma.config.ts`
```

So `schema.prisma` declares only the provider, and the URL comes from
`prisma.config.ts`, which reads `process.env["DATABASE_URL"]` — the value
Compose injects into the backend service.

Consequence for the image: **`prisma.config.ts` must be copied into the runtime
stage.** Copying only the `prisma/` folder is not enough. If it is missing,
`migrate deploy` fails with:

```
Error: The datasource.url property is required in your Prisma config file
```

which is misleading — `DATABASE_URL` is set correctly; the *config file* simply
is not there to read it.

A second, subtler consequence: because `prisma.config.ts` sits at the project
root, `nest build` will compile it too and nest the output at `dist/src/main.js`
instead of `dist/main.js`. It is excluded in `tsconfig.build.json` to prevent
that.

### Two commands, two phases

| Command | When | What |
|---|---|---|
| `prisma generate` | **build time** | Generates the client into `node_modules`. No database contact. |
| `prisma migrate deploy` | **container start** | Applies pending migrations to the live database. |

`migrate deploy` runs in `backend/tools/entrypoint.sh`, not the Dockerfile — there is
no database at build time. This is what makes `make up` work on a fresh clone
with an empty volume.

`migrate deploy` only applies existing migrations; it never generates them and
never prompts. **Never use `migrate dev` in an entrypoint** — it is interactive
and can reset the database.

Creating a new migration is a developer action, run against the dev stack:

```sh
docker compose exec backend npx prisma migrate dev --name add_match_table
```

The generated folder under `migrations/` must be committed.

---

## Access

Production publishes nothing, so go in through Docker:

```sh
make psql                                   # interactive psql
docker compose exec db psql -U <user> -d <db>
docker compose logs -f db
```

`make psql` reads credentials from the container's own environment, so no
secrets are hardcoded in the Makefile.

### The port cannot be published, in any mode

An earlier version of the dev override tried to expose Postgres to the host for
GUI clients such as TablePlus or DBeaver:

```yaml
  db:
    ports:
      - "127.0.0.1:5432:5432"   # does nothing
```

**This silently does nothing.** `db` is attached only to `backend_net`, which is
`internal: true`. An internal network has no gateway, so Docker has no route to
carry host traffic into it. Compose accepts the `ports:` entry, the container
starts without complaint, and the mapping is simply never created:

```sh
docker inspect db --format '{{json .NetworkSettings.Ports}}'
# {"5432/tcp":[]}          <- requested, never bound
```

`docker compose ps` also shows `5432/tcp` with no host mapping, and connecting
from the host gives `Connection refused`.

Publishing it would require giving `backend_net` a gateway — i.e. removing the
isolation the whole topology is built on. Not worth it for GUI convenience.

**Use `make psql` instead**, or `make shell-backend` to reach the database from
inside the network.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Backend crash-loops on first run | Started before Postgres was ready | Handled by the healthcheck; confirm `depends_on` uses `condition: service_healthy` |
| `The datasource.url property is required in your Prisma config file` | `prisma.config.ts` was not copied into the runtime image | Confirm `COPY app/prisma.config.ts` is in `backend/Dockerfile` |
| `The datasource property 'url' is no longer supported in schema files` | `url = env(...)` added to `schema.prisma` | Remove it — Prisma 7 keeps the URL in `prisma.config.ts` |
| `Cannot find module '/app/dist/main'` | `prisma.config.ts` was compiled by Nest, nesting output at `dist/src/main.js` | Add `"prisma.config.ts"` to `exclude` in `tsconfig.build.json` |
| `password authentication failed` | `.env` changed after the volume was initialised | `make fclean && make up` |
| `could not resolve host db` from frontend | Working as designed — frontend is not on `backend_net` | — |
| `psql: command not found` on host | Postgres is not published in production | `make psql` |
| Data lost after `make fclean` | `fclean` runs `down -v` | Use `make clean` to keep data |
| `role "..." does not exist` | Volume initialised with a different `POSTGRES_USER` | `make fclean && make up` |
