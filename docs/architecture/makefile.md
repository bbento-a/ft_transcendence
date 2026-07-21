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
| `dev` | Dev stack: hot reload, source mounted from the host. |
| `down` | Stop and remove containers and networks. Volume kept. |
| `stop` / `start` | Pause and resume without removing anything. |

> **Use `dev` while writing code.** Under `up`, the source is compiled *into*
> the image, so editing a file changes nothing until you rebuild — the usual
> symptom is "I changed the page and the browser still shows the old one".
> Switch with `make down && make dev`.

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

| Target | Containers | Networks | **DB volume** | Images | Host artifacts |
|---|:---:|:---:|:---:|:---:|:---:|
| `clean` | removed | removed | **kept** | kept | kept |
| `clean-artifacts` | — | — | — | — | **removed** |
| `fclean` | removed | removed | **destroyed** | removed | **removed** |
| `re` | `fclean` then `up` | | | | |

### Host artifacts

Dev mode bind-mounts the source into the containers, so `next dev` and
`nest start:dev` write their output **into your project folder**, not into
Docker:

```
frontend/app/.next                      dev build cache (grows to ~100MB)
frontend/app/next-env.d.ts              types Next generates
backend/app/dist                        compiled output
backend/app/tsconfig.build.tsbuildinfo  incremental build state
```

`docker compose down` cannot remove these — they are host files, not Docker
resources. `clean-artifacts` deletes them, and `fclean` does the same after its
Docker teardown.

Use `clean-artifacts` on its own when the frontend renders something that no
longer matches the source: a stale `.next` is the usual cause. Note it **stops
the stack** before deleting, then leaves it down — run `make dev` afterwards.

**Why it exists separately from `fclean`.** `fclean` would also fix a stale
cache, but it destroys the database volume and all built images as collateral:

| | Database | Images | Back up in |
|---|---|---|---|
| `clean-artifacts` + `dev` | **kept** | **kept** | ~20s |
| `fclean` + `dev` | wiped | rebuilt | ~2min |

So when you have test users or games you do not want to lose, this is the
non-destructive option.

> **Both targets must stop the containers first.** In dev mode `next dev` and
> `nest start:dev` watch the bind-mounted source, so deleting `.next` or `dist`
> while they are running makes them regenerate it within seconds and the clean
> appears to do nothing. This is also why `fclean` does *not* declare
> `clean-artifacts` as a prerequisite: Make runs prerequisites **before** the
> recipe, which would delete the files while the dev servers were still alive.
> The removal has to happen after `docker compose down`.

**`node_modules` is deliberately left alone.** In this setup it is either an
empty mountpoint created by the anonymous volume (0 bytes, harmless) or a real
install someone made on the host so their editor can resolve imports. Deleting
it gains no space and costs a reinstall.

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
	$(COMPOSE) down -v --rmi all --remove-orphans
```

`clean` is the everyday reset: recycle containers, keep users and games.

`fclean` is destructive and is also **the fix for the two recurring gotchas**:

- a stale `node_modules` anonymous volume after a dependency change
- a `POSTGRES_PASSWORD` that no longer matches an already-initialised volume

**`--rmi all`, not `--rmi local`.** This is a trap worth knowing: `local` only
removes images that have *no* custom name, and every service here sets
`image: transcendence-*`. With `local`, all three images were silently left
behind and `fclean` did not do what it claimed. `all` still touches only images
referenced by *this* compose file — `postgres:15-alpine` is removed too and
re-pulled on the next `make up`, but nothing else on the machine is affected.

`--remove-orphans` clears containers from services deleted out of the compose
file.

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
