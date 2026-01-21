# Cinema Booking System

Sistema de venda de ingressos para rede de cinemas com controle de concorrência e sistemas distribuídos.

## Visão Geral

Este sistema foi desenvolvido para resolver o problema de venda de ingressos de cinema com alta concorrência, garantindo que:

- ✅ **Nenhum assento seja vendido duas vezes** - mesmo com múltiplas requisições simultâneas
- ✅ **Reservas temporárias** - expiram automaticamente após 30 segundos
- ✅ **Multi-instância** - múltiplas instâncias podem rodar simultaneamente
- ✅ **Mensageria confiável** - eventos publicados com confirmação e DLQ

---

## Tecnologias Escolhidas

| Tecnologia        | Função            | Por que escolhi?                                                                                   |
| ----------------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| **NestJS 11**     | Framework Backend | Arquitetura modular, TypeScript nativo, injeção de dependências, decorators para validação         |
| **PostgreSQL 16** | Banco Relacional  | ACID compliance, `SELECT FOR UPDATE SKIP LOCKED` para locks pessimistas, transações robustas       |
| **Redis 7**       | Cache/Locks       | Locks distribuídos com `SET NX PX`, TTL nativo, operações atômicas, alta performance (~100k ops/s) |
| **RabbitMQ 3.13** | Mensageria        | Publisher confirms, Dead Letter Queue nativo, fácil configuração, ótimo para workloads de eventos  |
| **Docker**        | Containerização   | Ambiente consistente, `docker-compose up` sobe tudo com um comando                                 |

### Por que PostgreSQL + Redis (e não apenas um)?

- **Redis**: Lock rápido e distribuído (5s TTL) - primeira linha de defesa contra race conditions
- **PostgreSQL**: Lock pessimista na transação (`FOR UPDATE`) - garante consistência ACID mesmo se o lock do Redis falhar

### Por que RabbitMQ e não Kafka?

- RabbitMQ é mais simples para eventos de domínio (reserva criada, pagamento confirmado)
- DLQ nativo sem configuração adicional
- Kafka seria melhor para streaming de alta escala (milhões de eventos/segundo)

---

## Como Executar

### Pré-requisitos

- Docker e Docker Compose instalados
- Portas disponíveis: 3000, 5432, 6379, 5672, 15672
- Make (opcional, para comandos simplificados)
  - **macOS**: `xcode-select --install`
  - **Linux**: `sudo apt install make` (Ubuntu/Debian)
  - **Windows**: Use os comandos docker-compose diretamente

### Variáveis de Ambiente

Copie o arquivo de exemplo e ajuste conforme necessário:

```bash
cp .env.example .env
```

| Variável                  | Descrição                      | Padrão                              |
| ------------------------- | ------------------------------ | ----------------------------------- |
| `NODE_ENV`                | Ambiente (development/prod)    | `development`                       |
| `PORT`                    | Porta da aplicação             | `3000`                              |
| `DATABASE_HOST`           | Host do PostgreSQL             | `localhost`                         |
| `DATABASE_PORT`           | Porta do PostgreSQL            | `5432`                              |
| `DATABASE_USER`           | Usuário do PostgreSQL          | `postgres`                          |
| `DATABASE_PASSWORD`       | Senha do PostgreSQL            | `postgres`                          |
| `DATABASE_NAME`           | Nome do banco                  | `cinema`                            |
| `REDIS_HOST`              | Host do Redis                  | `localhost`                         |
| `REDIS_PORT`              | Porta do Redis                 | `6379`                              |
| `RABBITMQ_URL`            | URL de conexão do RabbitMQ     | `amqp://guest:guest@localhost:5672` |
| `RESERVATION_TTL_SECONDS` | Tempo de expiração da reserva  | `30`                                |

> **Nota**: Ao usar Docker Compose, as variáveis já estão configuradas no `docker-compose.yml`.

### Subir o Ambiente

```bash
# Usando Make
make up

# Ou diretamente com docker-compose
docker-compose up --build -d
```

Para ver os logs:

```bash
# Usando Make
make logs        # Todos os serviços
make logs-app    # Apenas a aplicação

# Ou diretamente com docker-compose
docker-compose logs -f        # Todos os serviços
docker-compose logs -f app    # Apenas a aplicação
```

A aplicação estará disponível em:

| Serviço      | URL                                  |
| ------------ | ------------------------------------ |
| **API**      | http://localhost:3000                |
| **Swagger**  | http://localhost:3000/api-docs       |
| **RabbitMQ** | http://localhost:15672 (guest/guest) |

### Collection do Postman

Uma collection completa do Postman está disponível em `postman/cinema-booking-system.postman_collection.json` com todos os endpoints documentados e exemplos de requisição.

### Verificar se está funcionando

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"..."}
```

### Como popular dados iniciais

Não é necessário! Os scripts de teste criam seus próprios dados automaticamente via API.

### Como executar testes

```bash
# Testes unitários (179 testes, 17 suites)
pnpm test

# Testes com cobertura (~86% coverage)
pnpm test:cov

# Testes em modo watch
pnpm test:watch

# Dar permissão aos scripts de integração
chmod +x scripts/*.sh

# Teste de fluxo completo (usuário → sessão → reserva → pagamento)
./scripts/test-complete-flow.sh

# Teste de concorrência (10 usuários disputando o mesmo assento)
./scripts/test-concurrency.sh

# Teste de expiração automática (aguarda 45s)
./scripts/test-expiration.sh

# Teste de rate limiting (120 requisições)
./scripts/test-rate-limit.sh
```

### Comandos Make disponíveis

```bash
make help  # Lista todos os comandos
```

| Comando            | Descrição                                  |
| ------------------ | ------------------------------------------ |
| `make up`          | Sobe containers em background              |
| `make down`        | Para todos os containers                   |
| `make down-v`      | Para containers e remove volumes           |
| `make restart`     | Reinicia todos os containers               |
| `make ps`          | Lista status dos containers                |
| `make logs`        | Mostra logs de todos os serviços           |
| `make logs-app`    | Mostra logs apenas da aplicação            |
| `make logs-db`     | Mostra logs apenas do PostgreSQL           |
| `make logs-redis`  | Mostra logs apenas do Redis                |
| `make logs-rabbit` | Mostra logs apenas do RabbitMQ             |
| `make build`       | Compila o projeto                          |
| `make test`        | Roda testes unitários                      |
| `make test-watch`  | Roda testes em modo watch                  |
| `make lint`        | Roda o linter                              |
| `make install`     | Instala dependências                       |
| `make dev`         | Roda em modo desenvolvimento               |
| `make clean`       | Remove containers, volumes e node_modules  |

### Scripts pnpm disponíveis

| Script                  | Descrição                                   |
| ----------------------- | ------------------------------------------- |
| `pnpm start`            | Inicia a aplicação                          |
| `pnpm start:dev`        | Inicia em modo desenvolvimento (watch)      |
| `pnpm start:debug`      | Inicia em modo debug                        |
| `pnpm start:prod`       | Inicia em modo produção                     |
| `pnpm build`            | Compila o projeto                           |
| `pnpm test`             | Roda testes unitários                       |
| `pnpm test:watch`       | Roda testes em modo watch                   |
| `pnpm test:cov`         | Roda testes com cobertura                   |
| `pnpm lint`             | Roda ESLint com auto-fix                    |
| `pnpm format`           | Formata código com Prettier                 |
| `pnpm migration:run`    | Executa migrations pendentes                |
| `pnpm migration:revert` | Reverte última migration                    |
| `pnpm migration:show`   | Lista status das migrations                 |

---

## Estratégias Implementadas

### 1. Como resolvi Race Conditions

**Problema**: 10 usuários clicam no último assento no mesmo milissegundo.

**Solução**: Dupla camada de proteção:

```
┌─────────────────────────────────────────────────────────────┐
│                      Requisição chega                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Redis Distributed Lock (SET NX PX 5000)                 │
│     - Apenas UMA requisição passa por vez                   │
│     - Outras recebem 409 Conflict imediatamente             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. PostgreSQL Transaction + SELECT FOR UPDATE              │
│     - Lock pessimista nos assentos                          │
│     - Garante ACID mesmo se Redis falhar                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Verificação de status (AVAILABLE?)                      │
│     - Se não disponível → rollback + 409 Conflict           │
└─────────────────────────────────────────────────────────────┘
```

**Código do lock Redis**:

```typescript
const lockKey = `reservation:session:${sessionId}:seats:${sortedIds.join(',')}`;
const acquired = await this.redisLockService.acquireLock(lockKey, 5000);
if (!acquired) {
  throw new ConflictException('Seats are being reserved by another user');
}
```

### 2. Como garanti coordenação entre múltiplas instâncias

- **Redis como coordenador central**: Todas as instâncias compartilham o mesmo Redis
- **Locks com TTL**: Se uma instância morrer, o lock expira em 5 segundos
- **Idempotency Key**: Header `Idempotency-Key` previne duplicação por retry

```typescript
// Se a mesma Idempotency-Key for enviada, retorna a reserva existente
const existing = await this.reservationRepository.findOne({
  where: { idempotencyKey },
});
if (existing) return existing;
```

### 3. Como preveni Deadlocks

**Problema**: Usuário A reserva assentos [1, 3], Usuário B reserva [3, 1] → deadlock!

**Solução**: Sempre ordenar os IDs antes de adquirir locks:

```typescript
// Ambos os usuários vão tentar lockar na ordem [1, 3]
const sortedSeatIds = [...seatIds].sort();
const lockKey = `seats:${sortedSeatIds.join(',')}`;
```

### 4. Expiração Automática de Reservas

- **Cron Job**: Executa a cada 10 segundos
- **SKIP LOCKED**: Não bloqueia se outra instância já estiver processando
- **Fluxo**: PENDING → EXPIRED → Assentos liberados → Evento publicado

```typescript
@Cron('*/10 * * * * *')
async handleExpiredReservations() {
  // Busca reservas expiradas com lock (SKIP LOCKED para multi-instância)
  const expired = await queryRunner.manager
    .createQueryBuilder(Reservation, 'r')
    .setLock('pessimistic_write', undefined, ['r'])
    .where('r.status = :status', { status: 'PENDING' })
    .andWhere('r.expiresAt < :now', { now: new Date() })
    .getMany();

  // Marca como EXPIRED e libera assentos
}
```

---

## Endpoints da API

### Users (Usuários)

| Método | Endpoint     | Descrição           |
| ------ | ------------ | ------------------- |
| `POST` | `/users`     | Criar usuário       |
| `GET`  | `/users/:id` | Detalhes do usuário |

### Sessions (Sessões de Cinema)

| Método | Endpoint              | Descrição                                |
| ------ | --------------------- | ---------------------------------------- |
| `POST` | `/sessions`           | Criar sessão (mínimo 16 assentos)        |
| `GET`  | `/sessions`           | Listar todas as sessões                  |
| `GET`  | `/sessions/:id`       | Detalhes de uma sessão                   |
| `GET`  | `/sessions/:id/seats` | Disponibilidade de assentos (tempo real) |

### Reservations (Reservas)

| Método   | Endpoint            | Descrição                      |
| -------- | ------------------- | ------------------------------ |
| `POST`   | `/reservations`     | Criar reserva (válida por 30s) |
| `GET`    | `/reservations/:id` | Detalhes da reserva            |
| `DELETE` | `/reservations/:id` | Cancelar reserva               |

**Header**: `Idempotency-Key: unique-id` (opcional, recomendado)

### Payments (Pagamentos)

| Método | Endpoint                   | Descrição            |
| ------ | -------------------------- | -------------------- |
| `POST` | `/payments/confirm`        | Confirmar pagamento  |
| `GET`  | `/users/:userId/purchases` | Histórico de compras |

---

## Exemplo de Fluxo para Testar

### Fluxo Manual (curl)

```bash
# 1. Criar usuário
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name": "João Silva", "email": "joao@test.com"}'
# Resposta: {"id": "uuid-do-usuario", ...}

# 2. Criar sessão "Filme X - 19:00" com 16 assentos a R$ 25,00
curl -X POST http://localhost:3000/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "movieTitle": "Filme X",
    "room": "Sala 1",
    "startTime": "2026-01-30T19:00:00Z",
    "ticketPrice": 25.00,
    "totalSeats": 16
  }'
# Resposta: {"id": "uuid-da-sessao", "seats": [...]}

# 3. Verificar assentos disponíveis
curl http://localhost:3000/sessions/{sessionId}/seats
# Resposta: {"availableSeats": 16, "seats": [{"id": "uuid", "seatLabel": "A1", "status": "AVAILABLE"}, ...]}

# 4. Criar reserva
curl -X POST http://localhost:3000/reservations \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: minha-reserva-001" \
  -d '{
    "userId": "{userId}",
    "sessionId": "{sessionId}",
    "seatIds": ["{seatId1}"]
  }'
# Resposta: {"id": "uuid-reserva", "status": "PENDING", "expiresAt": "..."}

# 5. Confirmar pagamento (antes de 30s!)
curl -X POST http://localhost:3000/payments/confirm \
  -H "Content-Type: application/json" \
  -d '{"reservationId": "{reservationId}"}'
# Resposta: {"id": "uuid-venda", "status": "CONFIRMED"}
```

### Simular 2+ usuários disputando o mesmo assento

```bash
./scripts/test-concurrency.sh
```

**Resultado esperado**:

```
10 requisições simultâneas para o mesmo assento
✓ 1 SUCESSO (HTTP 201) - conseguiu a reserva
✗ 9 CONFLITOS (HTTP 409) - bloqueados pelo lock
```

### Verificar expiração automática

```bash
./scripts/test-expiration.sh
```

**Resultado esperado** (após ~45 segundos):

```
Reserva criada: PENDING
Aguardando 45 segundos...
Reserva agora: EXPIRED
Assento liberado: AVAILABLE
```

---

## Decisões Técnicas

1. **PostgreSQL `FOR UPDATE SKIP LOCKED`**: Permite que o cron de expiração processe reservas em paralelo sem bloquear outras instâncias.

2. **Redis Lock de 5s + PostgreSQL Lock**: Dupla camada porque Redis pode ter falhas de rede; PostgreSQL garante ACID.

3. **Ordenação de Seats antes do Lock**: Previne deadlock garantindo ordem consistente de aquisição.

4. **Cron a cada 10s (não TTL Redis)**: Fonte da verdade é o PostgreSQL; Redis é apenas cache/lock.

5. **RabbitMQ com Publisher Confirms**: Garante que a mensagem foi persistida antes de retornar sucesso.

6. **Batch Processing no Consumer**: Processa até 10 mensagens por vez para maior throughput.

7. **Retry com Backoff Exponencial**: 100ms → 200ms → 400ms → 800ms (max 1s) para evitar thundering herd.

---

## Eventos de Mensageria

| Exchange        | Routing Key           | Quando é publicado         |
| --------------- | --------------------- | -------------------------- |
| `cinema.events` | `reservation.created` | Reserva criada com sucesso |
| `cinema.events` | `reservation.expired` | Reserva expirou (cron job) |
| `cinema.events` | `payment.confirmed`   | Pagamento confirmado       |
| `cinema.events` | `seat.released`       | Assento liberado           |

**Dead Letter Queue**: Mensagens que falham após 3 retries vão para `cinema.dlq`.

---

## Rate Limiting

| Endpoint                 | Limite  | Janela |
| ------------------------ | ------- | ------ |
| Global                   | 100 req | 1 min  |
| `POST /reservations`     | 30 req  | 1 min  |
| `POST /payments/confirm` | 10 req  | 1 min  |

**Headers de resposta**:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705776060000
Retry-After: 60 (quando bloqueado)
```

---

## Limitações Conhecidas

1. **Sem autenticação**: O sistema não implementa JWT/OAuth. Em produção, seria necessário proteger os endpoints.

2. **Pagamento mock**: O endpoint apenas confirma a reserva. Não há integração com gateway real (Stripe, PagSeguro).

3. **Single region**: O Redis lock funciona em single region. Para multi-region, seria necessário Redlock com 5+ instâncias.

---

## Melhorias Futuras

- [ ] **Autenticação JWT** com refresh tokens
- [ ] **Circuit Breaker** para chamadas externas
- [ ] **Métricas** com Prometheus/Grafana
- [ ] **WebSockets** para atualização em tempo real dos assentos
- [ ] **Cache de sessions** no Redis para leituras frequentes
- [ ] **Integração com gateway de pagamento** real

---

## Estrutura do Projeto

```
src/
├── main.ts                     # Bootstrap da aplicação
├── app.module.ts               # Módulo principal
├── config/                     # Configurações centralizadas
├── common/                     # Filters, Guards, Interceptors, Decorators
├── infrastructure/
│   ├── database/migrations/    # Migrations TypeORM
│   ├── logger/                 # Winston config
│   └── redis/                  # Lock service
└── modules/
    ├── users/                  # CRUD de usuários
    ├── sessions/               # Sessões + Assentos
    ├── reservations/           # Reservas + Job de expiração
    ├── payments/               # Confirmação de pagamento
    └── messaging/              # Publishers + Consumers

tests/
├── jest-setup.ts                    # Setup global dos testes
└── unit/
    ├── common/
    │   ├── filters/                 # HttpExceptionFilter (8 testes)
    │   ├── guards/                  # RateLimitGuard (14 testes)
    │   ├── interceptors/            # LoggingInterceptor (9 testes)
    │   └── utils/                   # RetryUtil (11 testes)
    ├── health/                      # HealthController (3 testes)
    ├── infrastructure/
    │   └── redis/                   # RedisLockService (9 testes)
    └── modules/
        ├── users/                   # Controller + Service (12 testes)
        ├── sessions/                # Controller + Service (19 testes)
        ├── reservations/            # Controller + Service + Job (33 testes)
        ├── payments/                # Controller + Service (22 testes)
        └── messaging/               # Publisher + Consumer (39 testes)
```

---

## Logs

O sistema utiliza logging estruturado com Winston:

| Nível   | Uso                                                         |
| ------- | ----------------------------------------------------------- |
| `DEBUG` | Detalhes de locks, queries SQL                              |
| `INFO`  | Operações de negócio (reserva criada, pagamento confirmado) |
| `WARN`  | Lock falhou, conexão perdida                                |
| `ERROR` | Erro de transação, falha na mensageria                      |

Logs são salvos em `logs/` e também exibidos no console.

---

## Git Hooks (Husky)

O projeto usa **Husky** para validar código antes de commits:

| Hook         | Validação                          |
| ------------ | ---------------------------------- |
| `pre-commit` | ESLint + Prettier (apenas staged)  |
| `commit-msg` | Formato da mensagem (Conventional) |

### Padrão de Commit (Conventional Commits)

```
<tipo>: <descrição>

Exemplos:
feat: add user authentication
fix: resolve race condition in seat reservation
docs: update api documentation
refactor: simplify payment service logic
test: add unit tests for reservations
```

**Tipos permitidos:**

| Tipo       | Uso                                    |
| ---------- | -------------------------------------- |
| `feat`     | Nova funcionalidade                    |
| `fix`      | Correção de bug                        |
| `docs`     | Documentação                           |
| `style`    | Formatação (sem mudança de código)     |
| `refactor` | Refatoração                            |
| `perf`     | Melhoria de performance                |
| `test`     | Testes                                 |
| `build`    | Build ou dependências                  |
| `ci`       | Configuração de CI                     |
| `chore`    | Tarefas auxiliares                     |
| `revert`   | Reverter commit anterior               |

---

Desenvolvido para o processo seletivo da **StarSoft** - Vaga Desenvolvedor Back-End
