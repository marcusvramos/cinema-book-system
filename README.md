# Cinema Booking System

Sistema de venda de ingressos para rede de cinemas com controle de concorrência e sistemas distribuídos.

## Visão Geral

Este sistema foi desenvolvido para resolver o problema de venda de ingressos de cinema com alta concorrência, garantindo que:

- **Nenhum assento seja vendido duas vezes** - mesmo com múltiplas requisições simultâneas
- **Reservas temporárias** - expiram automaticamente após 30 segundos
- **Multi-instância** - múltiplas instâncias podem rodar simultaneamente
- **Mensageria confiável** - eventos publicados com confirmação e DLQ

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
# Testes unitários (180 testes, 17 suites)
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

**Solução**: Implementei uma estratégia de **dupla camada de proteção** combinando Redis e PostgreSQL:

1. **Camada 1 - Redis Distributed Lock**: Quando uma requisição chega, o sistema tenta adquirir um lock distribuído no Redis usando `SET NX PX` (set if not exists, with expiration). O lock é criado com uma chave única baseada na sessão e nos assentos solicitados. Se outra requisição tentar reservar os mesmos assentos enquanto o lock existe, ela recebe imediatamente um erro `409 Conflict`. O TTL de 5 segundos garante que o lock seja liberado mesmo se a aplicação falhar.

2. **Camada 2 - PostgreSQL Pessimistic Lock**: Mesmo com o Redis protegendo, uso `SELECT FOR UPDATE` dentro de uma transação `SERIALIZABLE` no PostgreSQL. Isso cria um lock pessimista diretamente nas linhas dos assentos no banco de dados, garantindo consistência ACID mesmo em cenários onde o Redis possa falhar.

3. **Verificação Final**: Após adquirir ambos os locks, o sistema verifica se os assentos ainda estão com status `AVAILABLE`. Se algum assento já foi reservado por outra transação, a operação é revertida com rollback.

Esta abordagem garante que mesmo com milhares de requisições simultâneas, apenas UMA conseguirá reservar cada assento.

[![](https://mermaid.ink/img/pako:eNrNlctymzAUhl_ljNaOx1xsLjNpBwNOnJBLgWZRYKGCDIwBpRL0Esy7V8aTtqsubbTRbY70zf8f6fQopRlBJtpV9EdaYNZC6MCkWtyceivyybeu5GWKKaQFyXECV1cfYN37JCs5eDTdDxejWx9ZDkcG2OGqoN0B7EhdGGDTZleVaZtcUrt_6HAmRGRlRg_gRM-UtzkjwScPQoYbjtO2pE1yZjpn9NGNAtdz7RA2Tz58fnas0E2mkHfuSLfpgxa3HYdrsF6srWetPffjcHm6zejsIxZ23kQ-raqvON0nU3mzN6N2NkzzRzlpF5T1AW6jU8YBJ7jlELgh8He_fTdw_RfXSc5Ldztqt422j-L6EBjhhH3H53yf_6PbjnR3kf308LANk4k5ezfS3YuKURHMCfytEFPQ7n6k8yJ5IYHNRMKRLEEzlItfGZkt68gM1YTV-DhF_TEqRm1BahIjUwwzzPYxiptBxLzi5gul9XsYo11eIFNUIC5m3WsmznZKnDNc_1llpMkIs2nXtMiUloo8noLMHv1EpiHNJUVdGYph6LKxUvUZ-oVMdTVXJM2QFEPRxJa-HGbobbxWmuuGJGtLXZc1eWGomjL8BmGud_I?type=png)](https://mermaid.live/edit#pako:eNrNlctymzAUhl_ljNaOx1xsLjNpBwNOnJBLgWZRYKGCDIwBpRL0Esy7V8aTtqsubbTRbY70zf8f6fQopRlBJtpV9EdaYNZC6MCkWtyceivyybeu5GWKKaQFyXECV1cfYN37JCs5eDTdDxejWx9ZDkcG2OGqoN0B7EhdGGDTZleVaZtcUrt_6HAmRGRlRg_gRM-UtzkjwScPQoYbjtO2pE1yZjpn9NGNAtdz7RA2Tz58fnas0E2mkHfuSLfpgxa3HYdrsF6srWetPffjcHm6zejsIxZ23kQ-raqvON0nU3mzN6N2NkzzRzlpF5T1AW6jU8YBJ7jlELgh8He_fTdw_RfXSc5Ldztqt422j-L6EBjhhH3H53yf_6PbjnR3kf308LANk4k5ezfS3YuKURHMCfytEFPQ7n6k8yJ5IYHNRMKRLEEzlItfGZkt68gM1YTV-DhF_TEqRm1BahIjUwwzzPYxiptBxLzi5gul9XsYo11eIFNUIC5m3WsmznZKnDNc_1llpMkIs2nXtMiUloo8noLMHv1EpiHNJUVdGYph6LKxUvUZ-oVMdTVXJM2QFEPRxJa-HGbobbxWmuuGJGtLXZc1eWGomjL8BmGud_I)

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

8. **Strategy Pattern nos Event Handlers**: Cada tipo de evento tem seu próprio handler, facilitando extensão sem modificar código existente (Open/Closed Principle).

9. **Contadores de Vendas no Redis**: O handler `payment.confirmed` atualiza contadores em tempo real no Redis (vendas por sessão e globais), demonstrando uso real da mensageria.

---

## Eventos de Mensageria

| Exchange        | Routing Key           | Quando é publicado         | Consumer |
| --------------- | --------------------- | -------------------------- | -------- |
| `cinema.events` | `reservation.created` | Reserva criada com sucesso | Log + comentários de implementação futura |
| `cinema.events` | `reservation.expired` | Reserva expirou (cron job) | Log + comentários de implementação futura |
| `cinema.events` | `payment.confirmed`   | Pagamento confirmado       | **Atualiza contadores no Redis** (vendas por sessão e global) |
| `cinema.events` | `seat.released`       | Assento liberado           | Log + comentários de implementação futura |

**Dead Letter Queue**: Mensagens que falham após 3 retries vão para `cinema.dlq`.

**Arquitetura**: Os consumers usam **Strategy Pattern** - cada tipo de evento tem seu próprio handler, facilitando extensão futura.

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

### Prioritárias
- [ ] **Autenticação JWT** com refresh tokens e proteção dos endpoints
- [ ] **Integração com gateway de pagamento** real (Stripe, PagSeguro, etc.)

### Mensageria - Implementações Reais nos Consumers
Atualmente, os handlers de eventos fazem operações básicas (logs e contadores no Redis). Em produção, poderiam:

| Evento | Implementação Futura |
|--------|---------------------|
| `reservation.created` | Enviar email de confirmação, notificar via WebSocket, atualizar cache de disponibilidade |
| `reservation.expired` | Enviar email de expiração, adicionar a lista de remarketing, analytics de abandono |
| `payment.confirmed` | Gerar PDF do ingresso, enviar por email, integrar com programa de fidelidade |
| `seat.released` | Notificar fila de espera, broadcast WebSocket para atualizar mapa de assentos |

### Infraestrutura
- [ ] **Métricas** com Prometheus/Grafana (latência, throughput, taxa de erros)
- [ ] **WebSockets** para atualização em tempo real dos assentos no frontend
- [ ] **Cache de sessions** no Redis para leituras frequentes (com invalidação via eventos)

---

## Estrutura do Banco de Dados

[![](https://mermaid.ink/img/pako:eNrtmsFu4jAQhl8lmjMgKCSBXFvthcteellFsmaTKVjEduQ4qCzw7utAWWBL1cNWy4ASIcAoDp88mv8fT7KGzOQECZB9kjizqAJuR6r3n3VFtgrWTOl2hLXMA__6PuVIt0SbzdEGGhXxpSOFsgiep7zonFRUOVRlkFlCR7lAx4NuG3A8TteOL11FVSWNZiYqt6coyiwlCSddQQzprDGK39odFcW_WyeaMR-6nDKpsPCU2YKcKK3MiOPatWp8T2qMrq3v_pHuzdKE__ptyonuoMZNlEWBP6ngREe6Vo0Qu7piGFmpXbD0mx8fWIZ0rRrfoxpb8tvtJTpe9fGNqXHTsuAhxTflFbzV-Kh39FpKnyds9O7UZ2VOqjSOdLYSC1pdsaNycV9hHBYClam14xhZbk52TleXeeuz9-ezgs8O6J1XnGJe3XMvOJnfVHApBdqs-IJeABbU9gK-NmefeeVsWxvfdQVV4kqRdiIz-kVadbVqpe1U3LtX7J8L2Gy6XbM-b1skQQpzrFLgw7c3tuuC_e21h7ugB8RdFdog-tx1KPWVOD_i4xLiD9ePSYgvdvLer6E4xruQevH_iM_v-zAC-3T9Nicx9jmyJOs5nUkBOjCzMofE2Zo6oMgqbIawbi6WgpuTohSaeTnaRQqp3vo5JeofxqjDNGvq2RySFywqP9pv9t8ezvrzqyWdk31s3B-SYRTvLgLJGl4hGUzC3qAfj4dRNO6Hg3AYdWAFSXcU9qLxQ_8h6vszRuM43Hbg1-5_-73JaBJHUTQMx5NRHIej7W-pa_0P?type=png)](https://mermaid.live/edit#pako:eNrtmsFu4jAQhl8lmjMgKCSBXFvthcteellFsmaTKVjEduQ4qCzw7utAWWBL1cNWy4ASIcAoDp88mv8fT7KGzOQECZB9kjizqAJuR6r3n3VFtgrWTOl2hLXMA__6PuVIt0SbzdEGGhXxpSOFsgiep7zonFRUOVRlkFlCR7lAx4NuG3A8TteOL11FVSWNZiYqt6coyiwlCSddQQzprDGK39odFcW_WyeaMR-6nDKpsPCU2YKcKK3MiOPatWp8T2qMrq3v_pHuzdKE__ptyonuoMZNlEWBP6ngREe6Vo0Qu7piGFmpXbD0mx8fWIZ0rRrfoxpb8tvtJTpe9fGNqXHTsuAhxTflFbzV-Kh39FpKnyds9O7UZ2VOqjSOdLYSC1pdsaNycV9hHBYClam14xhZbk52TleXeeuz9-ezgs8O6J1XnGJe3XMvOJnfVHApBdqs-IJeABbU9gK-NmefeeVsWxvfdQVV4kqRdiIz-kVadbVqpe1U3LtX7J8L2Gy6XbM-b1skQQpzrFLgw7c3tuuC_e21h7ugB8RdFdog-tx1KPWVOD_i4xLiD9ePSYgvdvLer6E4xruQevH_iM_v-zAC-3T9Nicx9jmyJOs5nUkBOjCzMofE2Zo6oMgqbIawbi6WgpuTohSaeTnaRQqp3vo5JeofxqjDNGvq2RySFywqP9pv9t8ezvrzqyWdk31s3B-SYRTvLgLJGl4hGUzC3qAfj4dRNO6Hg3AYdWAFSXcU9qLxQ_8h6vszRuM43Hbg1-5_-73JaBJHUTQMx5NRHIej7W-pa_0P)

### Enums

| Campo | Valores |
|-------|---------|
| `seats.status` | `AVAILABLE` → `RESERVED` → `SOLD` |
| `reservations.status` | `PENDING` → `CONFIRMED` / `EXPIRED` / `CANCELLED` |

### Constraints

| Tabela | Constraint | Colunas |
|--------|------------|---------|
| sessions | UNIQUE | `(room, start_time)` |
| seats | UNIQUE | `(session_id, seat_label)` |
| reservations | UNIQUE | `idempotency_key` |
| sales | UNIQUE | `reservation_id` |

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
│   └── redis/                  # Lock service + Stats service
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
        └── messaging/               # Publisher + Consumer (40 testes)
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
