# backend/

NestJS + Prisma, built as a three-stage Docker image.

```
backend/
├── Dockerfile
├── .dockerignore
├── tools/
│   └── entrypoint.sh   runs migrations, then starts Nest
└── app/                ← the NestJS project (package.json lives here)
```

Related: [docker-compose](docker-compose.md) · [database](database.md)

---

## Why `app/` is nested

The Dockerfile sits at `backend/`, the code at `backend/app/`. The build
context is `backend/`, so every `COPY` is prefixed `app/`, and the Dockerfile
plus entrypoint stay out of the Node project.

Teammates drop the NestJS project into `app/` — `package.json` must end up at
`backend/app/package.json`.

---

## The three stages

```
┌──────────────┐   ┌──────────────┐   ┌─────────────────┐
│ deps         │   │ builder      │   │ runtime         │
│ npm ci (all) │──►│ prisma gen   │──►│ npm ci --omit=dev│
│              │   │ nest build   │   │ + dist/          │
└──────────────┘   └──────────────┘   └─────────────────┘
    discarded          discarded         ★ the image
```

Each `FROM` starts from a **clean base image**. Nothing carries over
automatically — `COPY --from=<stage>` is the only bridge. Only the final stage
becomes the image; `deps` and `builder` are scaffolding.

Result: **~750MB**, and the shipped image contains no TypeScript compiler, no
ESLint, no Jest — less to exploit. Most of what remains is Prisma 7 itself
(see [About the size](#verifying)); the compiled application is ~500kB.

### Stage 1 — deps

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci
```

**Manifests first, source later.** Docker caches layers by their inputs, so the
`npm ci` layer only reinvalidates when `package.json` or the lockfile change.
Editing a `.ts` file then rebuilds in seconds instead of reinstalling ~1,100
packages. Reversing this order is the single most common Node Dockerfile
mistake.

**`npm ci`, not `npm install`** — installs exactly the lockfile, fails on
drift, never mutates it.

### Stage 2 — builder

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY app/ ./
RUN npx prisma generate
RUN npm run build
```

Note it must pull `node_modules` back in — the `npm ci` from stage 1 means
nothing in a fresh stage.

`prisma generate` writes the Prisma client **into `node_modules`**; it does not
touch the database. `npm run build` compiles TypeScript into `dist/`.

### Stage 3 — runtime

```dockerfile
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY app/prisma ./prisma
COPY app/prisma.config.ts ./prisma.config.ts

COPY tools/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

RUN addgroup -S nest && adduser -S nest -G nest
USER nest

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/main"]
```

**Why reinstall instead of copying `node_modules`?** The builder's copy is
bloated with devDependencies. A fresh `--omit=dev` install gives a clean
production tree.

**Then why copy `.prisma` back?** Because `prisma generate` wrote *generated*
code into `node_modules`, which a fresh `npm ci` would not have. The pattern:
**reinstall what is reproducible, copy what is generated.**

The `@prisma/*` packages themselves are **not** copied — `npm ci` already
installs them, because `prisma` is a production dependency. Copying them again
would duplicate ~170MB in a second layer.

**`COPY app/prisma ./prisma`** brings the migrations folder, read at startup by
`prisma migrate deploy`.

**`COPY app/prisma.config.ts`** is required by Prisma 7: the connection URL now
lives in the config file, not the schema. Without it, `migrate deploy` fails
with *"The datasource.url property is required in your Prisma config file"* —
even though `DATABASE_URL` is set in the environment.

**`npm cache clean --force`** in the same `RUN` as the install. npm leaves
roughly 190MB of cache behind; cleaning it in a *separate* `RUN` would not help,
because the previous layer would still contain it.

**Non-root user.** `addgroup -S` / `adduser -S` create a system user with no
login shell. After `USER nest`, nothing runs as root — no `chown`, no writes to
`/etc`, no package installs if the app is compromised.

> **No `chown -R nest:nest /app`.** It looks harmless but costs ~400MB:
> `chown -R` rewrites the metadata of every file, and Docker records that as a
> **complete second copy** of `node_modules` in a new layer. The app only needs
> to *read* those files, and the default permissions already allow it.

**`ENTRYPOINT` + `CMD`.** The entrypoint always runs; `CMD` is the default
command it execs. This keeps migration logic in the entrypoint while leaving
`docker compose run backend node some-script.js` working.

---

## tools/entrypoint.sh

```sh
#!/bin/sh
set -e

echo ">> Running database migrations..."
npx prisma migrate deploy

echo ">> Starting application..."
exec "$@"
```

Three details in five lines:

**`set -e`** — abort on any failure. Without it a failed migration is logged and
the app starts against a half-migrated schema.

**`prisma migrate deploy` runs here, not in the Dockerfile** — there is no
database at build time. This is also what makes `make up` work on a fresh clone
with an empty volume.

**`exec "$@"`** — replaces the shell with the `CMD` process, so Node runs as
PID 1 and receives signals directly. Without `exec`, the shell stays PID 1 and
swallows `SIGTERM`: `docker stop` waits 10s then hard-kills Node, with no
graceful shutdown.

### `migrate deploy` vs `migrate dev`

`deploy` applies existing migrations and never generates new ones or prompts.
It is the correct command for containers. `migrate dev` is interactive and can
reset the database — never use it in an entrypoint.

---

## .dockerignore

```
app/node_modules
app/dist
app/.git
app/.env
app/.env.*
app/Makefile
app/docker-compose.yml
app/README.md
app/coverage
app/test
**/*.log
.DS_Store
```

| Entry | Reason |
|---|---|
| `node_modules` | Host copy is macOS-compiled; would overwrite the Linux build. Also 400MB+ of build context transferred on every build. |
| `dist` | Stale build output; the image rebuilds it. |
| `.env`, `.env.*` | **Never bake secrets into an image.** Environment arrives at runtime from Compose. |
| `Makefile`, `docker-compose.yml` | Superseded by the root versions. |
| `test`, `coverage` | No reason to ship tests to production. |

---

## Prisma and native binaries

Prisma ships a query engine binary chosen per platform:

| Platform | Engine |
|---|---|
| macOS ARM64 | `libquery_engine-darwin-arm64.dylib.node` |
| Debian/Ubuntu | `...debian-openssl-3.0.x.so.node` |
| **Alpine (musl)** | `...linux-musl-openssl-3.0.x.so.node` |

Because `npm ci` and `prisma generate` both run **inside** the Alpine image,
Prisma detects musl and fetches the matching engine. This is why
`app/node_modules` is the first line of `.dockerignore` — a host-installed copy
would carry the wrong binary and crash on `dlopen`.

---

## Contract for the app code

The image assumes all of the following:

1. **`prisma` must be in `dependencies`**, not `devDependencies`. The runtime
   stage runs `npm ci --omit=dev` but still needs the CLI for
   `prisma migrate deploy`. *This breaks the container if missed.*
2. **`tsconfig.build.json` must list `prisma.config.ts` in `exclude`:**

   ```json
   "exclude": ["node_modules", "test", "dist", "**/*spec.ts", "prisma.config.ts"]
   ```

   Prisma 7 keeps the database URL in that root-level file. If Nest compiles it
   as well, `tsc` treats the project root (not `src/`) as the common root and
   emits `dist/src/main.js`, so the container dies with
   `Cannot find module '/app/dist/main'`. *This also breaks the container.*
3. `npm run build` produces `dist/main.js`.
4. The app listens on `3000` — `process.env.PORT ?? 3000`.
5. Routes carry **no `/api` prefix**; nginx strips it before proxying.
   `@Controller('auth')` → served as `/auth/login`.
6. **CORS can be removed entirely.** Everything is same-origin behind nginx.
   A hardcoded `origin: 'https://localhost:3001'` is now wrong.
7. Optional: enable trust proxy so Nest honours `X-Forwarded-Proto`. Not
   currently set — login works without it — but it is the fix if `Secure`
   cookies ever stop being set behind the proxy.

---

## Dev mode

The override builds `target: deps` and mounts source, so the compiled stages
are skipped entirely:

```yaml
    build:
      context: ./backend
      target: deps
    volumes:
      - ./backend/app:/app
      - /app/node_modules
    entrypoint: ["/bin/sh", "-c"]
    command:
      - "npx prisma generate && npx prisma migrate deploy && npm run start:dev"
```

The entrypoint must be overridden because `tools/entrypoint.sh` is only copied into the
`runtime` stage. `prisma generate` is re-run because dev never reaches the
builder stage and the anonymous volume needs the client generated into it —
skipping it gives `@prisma/client did not initialize yet`.

> **The command must stay a single string.** `sh -c` runs only its *first*
> argument as the script, and Compose splits an unquoted `command:` on
> whitespace. Written as `command: >` or bare, the container executes just
> `npx` and exits — the logs show a usage/help dump rather than an error, which
> makes it easy to misread. Keeping it as one quoted list item avoids the split.

---

## Verifying

```sh
docker compose -f docker-compose.yml build backend   # production build
docker compose build --progress=plain backend        # see every layer
docker build --target builder -t bk ./backend        # stop at a stage
docker images transcendence-backend                  # expect ~750MB
docker history transcendence-backend                 # find fat layers
docker compose logs -f backend                       # migrations + Nest boot
docker compose exec backend sh                       # shell inside
```

> Note the `-f docker-compose.yml`. Without it, Compose merges the dev override,
> which sets `target: deps` — you would silently build the dependencies-only
> stage, and the container would exit immediately with no logs.

**About the size.** ~750MB is large for a Node image, and it is almost entirely
Prisma 7: `@prisma` alone is ~170MB and pulls in `effect`, `@electric-sql` and
`typescript`. That is the cost of keeping the Prisma CLI in production
dependencies so migrations can run at startup. The application code is ~500kB.

If it climbs past ~1.2GB again, check in this order:

| Symptom | Cause |
|---|---|
| One layer ≈ the size of `node_modules` | a `chown -R` is duplicating the tree |
| `npm ci` layer much larger than `node_modules` | `npm cache clean --force` missing |
| A large `COPY @prisma` layer | duplicating what `npm ci` already installed |
| Everything huge | `--omit=dev` missing, or the wrong stage is final |

If a source-only change reinvalidates `npm ci`, the `COPY` order is wrong.
