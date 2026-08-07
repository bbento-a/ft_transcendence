# ==========================================================
#  ft_transcendence
# ==========================================================

ENV_FILE      = .env
ENV_EXAMPLE   = .env.example
SECRETS_DIR   = secrets

GEN_SECRETS   = postgres_password jwt_secret
OAUTH_SECRETS = google_client_id google_client_secret ft_client_id ft_client_secret
ALL_SECRETS   = $(GEN_SECRETS) $(OAUTH_SECRETS)

# Base file only -> production stack.
# Without -f, compose also picks up docker-compose.override.yml -> dev stack.
COMPOSE       = docker compose
COMPOSE_PROD  = docker compose -f docker-compose.yml

# ==========================================================
#  Main targets
# ==========================================================

all: up

# Production stack: built images, no source mounts, nothing but :2222 exposed
up: $(ENV_FILE) check-secrets
	$(COMPOSE_PROD) up -d --build
	@echo ""
	@echo "  Running at https://localhost:2222"
	@echo "  (self-signed cert -> Advanced -> Proceed to localhost)"
	@echo ""

# Development stack: hot reload, source mounted (db stays internal; use make psql)
dev: $(ENV_FILE) check-secrets host-modules
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

# Generated on first run; never committed. Holds only NON-secret config
# (db role/name, OAuth callback URLs). Every credential lives in secrets/.
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
		echo ">> Generating $(ENV_FILE) from $(ENV_EXAMPLE)..."; \
		cp $(ENV_EXAMPLE) $(ENV_FILE); \
		echo ">> Done."; \
	fi

# ----------------------------------------------------------
#  Secrets
# ----------------------------------------------------------

# Creates secrets/ and one file per credential. The two we can generate are
# generated with openssl; the four OAuth ones are created empty for you to
# paste into. Files that already have content are never touched, so running
# this again is safe and never rotates your database password.
secrets:
	@mkdir -p $(SECRETS_DIR)
	@for name in $(GEN_SECRETS); do \
		f="$(SECRETS_DIR)/$$name.txt"; \
		if [ ! -s "$$f" ]; then \
			openssl rand -hex 32 | tr -d '\n' > "$$f"; \
			echo ">> generated $$f"; \
		fi; \
	done
	@for name in $(OAUTH_SECRETS); do \
		f="$(SECRETS_DIR)/$$name.txt"; \
		if [ ! -e "$$f" ]; then \
			: > "$$f"; \
			echo ">> created   $$f (paste the value from the provider)"; \
		fi; \
	done
	@# The containers run as non-root users, so they must be able to read these.
	@chmod 644 $(SECRETS_DIR)/*.txt

# up and dev depend on this: the stack must not start with a missing value.
# Without it, compose would build everything and the backend would only then
# fail, in a restart loop.
check-secrets: secrets
	@missing=""; \
	for name in $(ALL_SECRETS); do \
		[ -s "$(SECRETS_DIR)/$$name.txt" ] || missing="$$missing $$name"; \
	done; \
	if [ -n "$$missing" ]; then \
		echo ""; \
		echo ">> Cannot start: these secrets are empty:$$missing"; \
		echo ">>   Google -> https://console.cloud.google.com"; \
		echo ">>   42     -> https://profile.intra.42.fr/oauth/applications"; \
		echo ">>   Put the raw value in $(SECRETS_DIR)/<name>.txt, then run make again."; \
		echo ""; \
		exit 1; \
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

# Shell inside a running container
shell-backend:
	$(COMPOSE) exec backend sh

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
	$(COMPOSE_PROD) down -v --rmi all --remove-orphans
	@rm -rf $(ARTIFACTS)
	@echo ">> Removed host build artifacts (.next, dist, next-env.d.ts)"

# re rebuilds PRODUCTION (what evaluators expect); re-dev is its dev twin.
re: fclean up

re-dev: fclean dev

.PHONY: all up dev down stop start setup secrets check-secrets \
        host-modules ps logs logs-backend \
        logs-frontend logs-nginx psql shell-backend shell-frontend nginx-test \
        clean clean-artifacts fclean re re-dev
