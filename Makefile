.PHONY: up down logs build test lint clean restart ps

up:
	docker-compose up --build -d

down:
	docker-compose down

down-v:
	docker-compose down -v

logs:
	docker-compose logs -f

logs-app:
	docker-compose logs -f app

logs-db:
	docker-compose logs -f postgres

logs-redis:
	docker-compose logs -f redis

logs-rabbit:
	docker-compose logs -f rabbitmq

restart:
	docker-compose restart

ps:
	docker-compose ps

build:
	pnpm build

test:
	pnpm test

test-watch:
	pnpm test:watch

lint:
	pnpm lint

clean:
	docker-compose down -v --rmi local
	rm -rf dist node_modules

install:
	pnpm install

dev:
	pnpm start:dev

help:
	@echo "Comandos disponíveis:"
	@echo "  make up          - Sobe todos os containers em background"
	@echo "  make down        - Para todos os containers"
	@echo "  make down-v      - Para containers e remove volumes"
	@echo "  make logs        - Mostra logs de todos os containers"
	@echo "  make logs-app    - Mostra logs apenas da aplicação"
	@echo "  make logs-db     - Mostra logs apenas do PostgreSQL"
	@echo "  make logs-redis  - Mostra logs apenas do Redis"
	@echo "  make logs-rabbit - Mostra logs apenas do RabbitMQ"
	@echo "  make restart     - Reinicia todos os containers"
	@echo "  make ps          - Lista status dos containers"
	@echo "  make build       - Compila o projeto"
	@echo "  make test        - Roda testes unitários"
	@echo "  make test-watch  - Roda testes em modo watch"
	@echo "  make lint        - Roda o linter"
	@echo "  make clean       - Remove containers, volumes e dependências"
	@echo "  make install     - Instala dependências"
	@echo "  make dev         - Roda em modo desenvolvimento"
