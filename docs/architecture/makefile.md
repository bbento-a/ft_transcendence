# Makefile

The single entry point. The subject requires deployment to run with **one
command** — that command is `make`.

Related: [docker-compose](docker-compose.md) · [database](database.md)

---

## The two stacks

```makefile
COMPOSE       = docker compose
COMPOSE_PROD  = docker compose -f docker-compose.yml
```

Compose loads `docker-compose.override.yml` automatically. Naming the base file
explicitly with `-f` is what **suppresses** it — which is why the production
variable is the one carrying the extra flag.

```
make up   →  docker compose -f docker-compose.yml up -d --build   (base only)
make dev  →  docker compose up -d --build                          (base + override)
```

`--build` on both, so a fresh clone builds and runs in one step. Docker's layer
cache makes repeat runs cheap.

---

## Targets

### Main

| Target | Does |
|---|---|
| `all` → `up` | Default. |
| `up` | Production stack: built images, no source mounts, only `:443` published. |
| `dev` | Dev stack: hot reload, source mounted, Postgres on `127.0.0.1:5432`. |
| `down` | Stop and remove containers and networks. Volume kept. |
| `stop` / `start` | Pause and resume without removing anything. |

### Environment

| Target | Does |
|---|---|
| `setup` | Creates `.env` if absent. Implied by `up` and `dev`. |

### Inspection

| Target | Use when |
|---|---|
| `ps` | First check — up/exited, health, uptime. |
| `logs` | All services interleaved; good for watching boot order. |
| `logs-backend` | Nest boot errors, migrations, API exceptions. |
| `logs-frontend` | Next build/compile output, render errors. |
| `logs-nginx` | TLS handshakes, 502s, upstream resolution failures. |
| `psql` | Interactive Postgres shell through Docker. |
| `shell-backend` / `shell-frontend` | Inspect the real filesystem, check env vars, curl one service from another. |
| `nginx-test` | Parse-check `nginx.conf` before restarting nginx. |

### Cleaning

| Target | Containers | Networks | **DB volume** | Images |
|---|:---:|:---:|:---:|:---:|
| `clean` | removed | removed | **kept** | kept |
| `fclean` | removed | removed | **destroyed** | removed |
| `re` | `fclean` then `up` | | | |

---

## `.env` generation

```makefile
$(ENV_FILE): $(ENV_EXAMPLE)
	@if [ -f $(ENV_FILE) ]; then \
		echo ">> $(ENV_FILE) already exists, leaving it alone"; \
		touch $(ENV_FILE); \
	else \
		PG_PASS=$$(openssl rand -hex 32); \
		JWT=$$(openssl rand -hex 32); \
		sed -e "s|^POSTGRES_USER=.*|POSTGRES_USER=transcendence|" \
		    -e "s|^POSTGRES_DB=.*|POSTGRES_DB=transcendence|" \
		    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$$PG_PASS|" \
		    -e "s|^JWT_SECRET=.*|JWT_SECRET=$$JWT|" \
		    $(ENV_EXAMPLE) > $(ENV_FILE); \
	fi
```

### It is a file target, not a phony one

`.env` is declared as a **file depending on `.env.example`**, which gives three
properties for free:

- `up` and `dev` list it as a prerequisite, so it always exists before Compose
  runs.
- If `.env` exists and is newer, Make skips the rule entirely — no cost on
  every build.
- If someone **adds a key to `.env.example`**, that file becomes newer and the
  rule re-fires, flagging that `.env` may be missing a variable.

The `touch` in the "already exists" branch stops the rule re-running forever
once `.env.example` is newer.

### Secrets come from openssl, never from this file

The Makefile is committed. It contains the *instruction* to generate secrets,
never the values — those exist only in the gitignored `.env`, differ per
machine, and were never typed by a human.

> An earlier version of this Makefile hardcoded `admin_password` and a literal
> JWT secret. Because the Makefile is tracked, those went into git history,
> which defeats the purpose of `.env` entirely.

### Two portability details

**`sed` reads `.env.example` and writes `.env`** — no in-place edit. `sed -i`
is incompatible between macOS (BSD, needs `sed -i ''`) and Linux (GNU,
`sed -i`). This form works on both, which matters when moving to a Linux VM.

**`|` as the delimiter** instead of `/`, so a value containing a slash cannot
break the expression.

### `$$` in recipes

Make consumes a single `$`. `$$(openssl ...)` reaches the shell as
`$(openssl ...)`; `$$POSTGRES_USER` reaches it as `$POSTGRES_USER`. Check any
recipe with:

```sh
make -n <target>       # print commands without running them
```

---

## `make psql` and the topology

```makefile
psql:
	$(COMPOSE) exec db sh -c 'psql -U $$POSTGRES_USER -d $$POSTGRES_DB'
```

Postgres is not published in production, so this goes **through** Docker rather
than connecting from the host. Credentials are read from the container's own
environment — `$$` escapes so the container's shell expands them, not Make. No
secrets in the Makefile, and it works even though nothing is published.

---

## `clean` vs `fclean`

```makefile
clean:
	$(COMPOSE) down --remove-orphans

fclean:
	$(COMPOSE) down -v --rmi local --remove-orphans
```

`clean` is the everyday reset: recycle containers, keep users and games.

`fclean` is destructive and is also **the fix for the two recurring gotchas**:

- a stale `node_modules` anonymous volume after a dependency change
- a `POSTGRES_PASSWORD` that no longer matches an already-initialised volume

`--rmi local` removes only images this project built. `--remove-orphans` clears
containers from services deleted out of the compose file.

**`.env` is deliberately kept** by `fclean`. Deleting it would rotate every
secret on a command whose purpose is resetting containers.

**`docker system prune` is deliberately absent.** It reaches outside this
project and removes unrelated images across the whole machine — hostile if you
have other work in Docker.

---

## `.PHONY`

```makefile
.PHONY: all up dev down stop start setup ps logs ... clean fclean re
```

Every target that is not a real file must be listed. Without it, a file named
`clean` in the directory would make Make consider the target up to date and
skip it. `$(ENV_FILE)` is correctly **absent** — it is a genuine file target.

---

## Common flows

```sh
make                 # first run: generates .env, builds, starts production
make dev             # daily development with hot reload
make logs-backend    # follow one service
make psql            # inspect the database

make re              # after changing package.json (rebuilds, wipes volumes)
make fclean && make up   # after changing POSTGRES_PASSWORD in .env

make nginx-test      # after editing nginx.conf in dev
docker compose restart nginx
```

---

## Note for the school VM

`make up` binds port 443. Under rootless Docker or Podman, binding a port below
1024 fails. If that happens, publish `8443:443` in `docker-compose.yml` and
browse to `https://localhost:8443`.

Worth testing before evaluation day rather than during it.
