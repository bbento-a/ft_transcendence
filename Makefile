# ==========================================================
#  ft_transcendence
# ==========================================================

ENV_FILE      = .env
ENV_EXAMPLE   = .env.example

# Base file only -> production stack.
# Without -f, compose also picks up docker-compose.override.yml -> dev stack.
COMPOSE       = docker compose
COMPOSE_PROD  = docker compose -f docker-compose.yml

# ==========================================================
#  Main targets
# ==========================================================

all: up

# Production stack: built images, no source mounts, nothing but :443 exposed
up: $(ENV_FILE)
	$(COMPOSE_PROD) up -d --build
	@echo ""
	@echo "  Running at https://localhost"
	@echo "  (self-signed cert -> Advanced -> Proceed to localhost)"
	@echo ""

# Development stack: hot reload, source mounted, db reachable on 127.0.0.1:5432
dev: $(ENV_FILE)
	$(COMPOSE) up -d --build
	@echo ""
	@echo "  Dev stack running at https://localhost"
	@echo "  Hot reload is on. After changing package.json, run: make re"
	@echo ""

down:
	$(COMPOSE) down

stop:
	$(COMPOSE) stop

start:
	$(COMPOSE) start

# ==========================================================
#  Environment
# ==========================================================

# Generated on first run; never committed. Secrets come from openssl,
# not from this Makefile, so nothing sensitive lives in git.
$(ENV_FILE): $(ENV_EXAMPLE)
	@if [ -f $(ENV_FILE) ]; then \
		echo ">> $(ENV_FILE) already exists, leaving it alone"; \
		touch $(ENV_FILE); \
	else \
		echo ">> Generating $(ENV_FILE) with random secrets..."; \
		PG_PASS=$$(openssl rand -hex 32); \
		JWT=$$(openssl rand -hex 32); \
		sed -e "s|^POSTGRES_USER=.*|POSTGRES_USER=transcendence|" \
		    -e "s|^POSTGRES_DB=.*|POSTGRES_DB=transcendence|" \
		    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$$PG_PASS|" \
		    -e "s|^JWT_SECRET=.*|JWT_SECRET=$$JWT|" \
		    $(ENV_EXAMPLE) > $(ENV_FILE); \
		echo ">> Done."; \
	fi

setup: $(ENV_FILE)

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

# Containers and networks go, database volume stays
clean:
	$(COMPOSE) down --remove-orphans

# Everything goes, including the database volume and built images.
fclean:
	$(COMPOSE) down -v --rmi local --remove-orphans

re: fclean up

.PHONY: all up dev down stop start setup ps logs logs-backend logs-frontend \
        logs-nginx psql shell-backend shell-frontend nginx-test clean fclean re
