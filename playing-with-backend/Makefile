# ==========================================
# Variáveis
# ==========================================
COMPOSE_FILE = docker-compose.yml
ENV_FILE = .env
PROJECT_NAME = connectfour

# ==========================================
# Regras 
# ==========================================
all: up

#makefile gera env se nao exisitr TROCAR futuramente mas por agora esta top
setup:
	@if [ ! -f $(ENV_FILE) ]; then \
		echo "A criar o ficheiro $(ENV_FILE)..."; \
		echo "POSTGRES_USER=nest_admin" > $(ENV_FILE); \
		echo "POSTGRES_PASSWORD=admin_password" >> $(ENV_FILE); \
		echo "POSTGRES_DB=nest_game_db" >> $(ENV_FILE); \
		echo "DATABASE_URL="postgresql://nest_admin:admin_password@localhost:5432/nest_game_db?schema=public"" >> $(ENV_FILE); \
		echo "JWT_SECRET="a_minha_chave_super_secreta_para_o_melhor_4_em_linha"" >> $(ENV_FILE);\
	fi

# Levanta a base de dados em background
up: setup
	docker compose -f $(COMPOSE_FILE) -p $(PROJECT_NAME) up -d 

down:
	docker compose -f $(COMPOSE_FILE) -p $(PROJECT_NAME) down

stop:
	docker compose -f $(COMPOSE_FILE) -p $(PROJECT_NAME) stop

start:
	docker compose -f $(COMPOSE_FILE) -p $(PROJECT_NAME) start

# ==========================================
# Ferramentas 
# ==========================================

# Atalho para arrancar o backend NestJS em modo de desenvolvimento
dev:
	npm run start:dev

# Vê os logs da base de dados em tempo real (para sair: Ctrl+C)
logs:
	docker compose -f $(COMPOSE_FILE) -p $(PROJECT_NAME) logs -f

# Entra diretamente no terminal PostgreSQL dentro do contentor #debugMaxing
psql:
	docker exec -it nest_auth_postgres psql -U nest_admin -d nest_game_db

# ==========================================
# Limpeza
# ==========================================

# Limpeza normal: remove os contentores, mas MANTÉM os dados na base de dados
clean: down
	docker system prune -f

# Limpeza total (fclean): Remove TUDO! Apaga o volume da base de dados (perdes os users todos) e o .env
fclean: clean
	docker compose -f $(COMPOSE_FILE) -p $(PROJECT_NAME) down -v
	@rm -f $(ENV_FILE)

re: fclean all

.PHONY: all setup up down stop start dev logs psql clean fclean re