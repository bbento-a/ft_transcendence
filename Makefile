# ==========================================================
#  ft_transcendence
# ==========================================================

ENV_FILE      = .env
ENV_EXAMPLE   = .env.example

SECRETS_DIR    = secrets
AUTO_SECRETS   = postgres_password jwt_secret
MANUAL_SECRETS = google_client_secret ft_client_secret
PLACEHOLDER    = CHANGE_ME

# Base file only -> production stack.
# Without -f, compose also picks up docker-compose.override.yml -> dev stack.
COMPOSE       = docker compose
COMPOSE_PROD  = docker compose -f docker-compose.yml

# ==========================================================
#  Main targets
# ==========================================================

all: up

# Production stack: built images, no source mounts, nothing but :2222 exposed
up: $(ENV_FILE) secrets
	$(COMPOSE_PROD) up -d --build
	@echo ""
	@echo "  Running at https://localhost:2222"
	@echo "  (self-signed cert -> Advanced -> Proceed to localhost)"
	@echo ""

# Development stack: hot reload, source mounted (db stays internal; use make psql)
dev: $(ENV_FILE) secrets host-modules
	$(COMPOSE) up -d --build
	@echo ""
	@echo "  Dev stack running at https://localhost:2222"
	@echo "  Hot reload is on. After changing package.json, run: make re-dev"
	@echo ""

# Populate the HOST node_modules so your editor (VS Code) can resolve imports and
# types. Docker does NOT use these -- node_modules is dockerignored, and the dev
# container uses its own copy via an anonymous volume. These exist only for the
# editor, to get rid of the red underlines on every import/JSX tag.
#
# Runs in a container (no host Node needed) AS YOUR HOST USER, so the files are
# owned by you -- this also avoids the root-owned node_modules problem on Linux
# that otherwise needs a `sudo chown`. Skips a folder already populated, so it is
# a fast no-op on repeat runs / after the first `make dev`.
host-modules:
	@for d in frontend/app backend/app; do \
		if [ -z "$$(ls -A $$d/node_modules 2>/dev/null)" ]; then \
			echo ">> Populating $$d/node_modules for the editor (one-time)..."; \
			docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp \
				-v "$$(pwd)/$$d":/app -w /app node:20-alpine npm ci; \
		fi; \
	done

down:
	$(COMPOSE) down

stop:
	$(COMPOSE) stop

start:
	$(COMPOSE) start

# ==========================================================
#  Environment
# ==========================================================

# .env holds CONFIGURATION only -- user names, host names, OAuth client ids and
# callback URLs. Nothing in it is a credential, so it is a plain copy of the
# committed example. Real credentials live in $(SECRETS_DIR)/, see below.
$(ENV_FILE): $(ENV_EXAMPLE)
	@if [ -f $(ENV_FILE) ]; then \
		echo ">> $(ENV_FILE) already exists, leaving it alone"; \
		missing=""; \
		for key in $$(sed -n 's/^\([A-Z0-9_]*\)=.*/\1/p' $(ENV_EXAMPLE)); do \
			grep -q "^$$key=" $(ENV_FILE) || missing="$$missing $$key"; \
		done; \
		if [ -n "$$missing" ]; then \
			echo ">> WARNING: $(ENV_FILE) is missing keys from $(ENV_EXAMPLE):$$missing"; \
			echo ">>          Add them by hand, or delete $(ENV_FILE) and rerun make."; \
		fi; \
		touch $(ENV_FILE); \
	else \
		echo ">> Creating $(ENV_FILE) from $(ENV_EXAMPLE)..."; \
		cp $(ENV_EXAMPLE) $(ENV_FILE); \
		echo ">> Edit it to add the OAuth client ids (only needed for OAuth login)."; \
	fi

# Creates every file under $(SECRETS_DIR)/, one credential per file, and leaves
# any file that already has content untouched -- so it is safe to re-run and is
# a cheap no-op prerequisite of `up` and `dev`.
#
# Random values come from openssl (with a /dev/urandom fallback for the rare
# box without it), never from this Makefile: the Makefile is committed, so a
# value written here would be a value published to everyone.
#
# Permissions: 700 on the directory keeps other users on the host out, while
# 644 on the files is required -- Compose bind-mounts them as they are, and the
# backend and frontend containers deliberately run as non-root users that must
# still be able to read them. Compose's `uid`/`gid`/`mode` secret options are
# swarm-only and silently ignored here, so the host mode is the real one.
secrets:
	@mkdir -p $(SECRETS_DIR)
	@chmod 700 $(SECRETS_DIR) 2>/dev/null || true
	@for name in $(AUTO_SECRETS); do \
		f=$(SECRETS_DIR)/$$name.txt; \
		if [ ! -s $$f ]; then \
			printf '%s\n' "$$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" > $$f; \
			echo ">> generated $$f"; \
		fi; \
		chmod 644 $$f 2>/dev/null || true; \
	done
	@for name in $(MANUAL_SECRETS); do \
		f=$(SECRETS_DIR)/$$name.txt; \
		if [ ! -s $$f ]; then \
			printf '%s\n' "$(PLACEHOLDER)" > $$f; \
			echo ">> created $$f  <-- paste the real value in"; \
		fi; \
		chmod 644 $$f 2>/dev/null || true; \
	done
	@todo=""; \
	for name in $(MANUAL_SECRETS); do \
		if grep -q '^$(PLACEHOLDER)$$' $(SECRETS_DIR)/$$name.txt 2>/dev/null; then \
			todo="$$todo $(SECRETS_DIR)/$$name.txt"; \
		fi; \
	done; \
	if [ -n "$$todo" ]; then \
		echo ">> WARNING: still holding a placeholder:$$todo"; \
		echo ">>          The stack boots, but OAuth login will not work."; \
	fi

setup: $(ENV_FILE) secrets

# ==========================================================
#  Inspection commands
# ==========================================================

# State of all four containers
ps:
	$(COMPOSE) ps

# Follow the interleaved logs of every service (Ctrl+C to quit).
logs:
	$(COMPOSE) logs -f

#   backend  -> Nest boot errors, prisma migrations, API exceptions
logs-backend:
	$(COMPOSE) logs -f backend

#   frontend -> Next.js build/compile output, render errors
logs-frontend:
	$(COMPOSE) logs -f frontend

#   nginx    -> TLS handshakes, 502s, "could not be resolved" upstream errors
logs-nginx:
	$(COMPOSE) logs -f nginx

# Interactive Postgres shell.
psql:
	$(COMPOSE) exec db sh -c 'psql -U $$POSTGRES_USER -d $$POSTGRES_DB'

# Shell inside a running container.
# `docker exec` starts from the image's environment, not from the running
# process's, so the secrets the entrypoint loaded are NOT there. Sourcing the
# same script gives this shell a working DATABASE_URL for prisma commands.
shell-backend:
	$(COMPOSE) exec backend sh -c '. /usr/local/bin/load-secrets.sh && exec sh'

# Shell inside a running container
shell-frontend:
	$(COMPOSE) exec frontend sh

# Parse-check nginx.conf inside the running container without restarting it.
nginx-test:
	$(COMPOSE) exec nginx nginx -t

# ==========================================================
#  Cleaning
# ==========================================================

# Build artifacts the dev containers write into the source tree through the
# bind mounts. They live on the host, not in Docker, so `docker compose down`
# never touches them.
ARTIFACTS = frontend/app/.next \
            frontend/app/next-env.d.ts \
            backend/app/dist \
            backend/app/tsconfig.build.tsbuildinfo

# Containers and networks go, database volume stays
clean:
	$(COMPOSE) down --remove-orphans

# Host-side build artifacts only.
clean-artifacts:
	@$(COMPOSE) down --remove-orphans >/dev/null 2>&1 || true
	@rm -rf $(ARTIFACTS)
	@echo ">> Removed host build artifacts (.next, dist, next-env.d.ts)"

# Everything goes: containers, networks, database volume, images, and the
# build artifacts left on the host by dev mode.
fclean:
	$(COMPOSE) down -v --rmi all --remove-orphans
	@rm -rf $(ARTIFACTS)
	@echo ">> Removed host build artifacts (.next, dist, next-env.d.ts)"

# re rebuilds PRODUCTION (what evaluators expect); re-dev is its dev twin.
re: fclean up

re-dev: fclean dev

.PHONY: all up dev down stop start setup secrets host-modules ps logs logs-backend \
        logs-frontend logs-nginx psql shell-backend shell-frontend nginx-test \
        clean clean-artifacts fclean re re-dev
