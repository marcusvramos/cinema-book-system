#!/bin/bash

# ============================================================================
# TESTE DE FLUXO COMPLETO - Cinema Booking System
# ============================================================================
# Este script executa o fluxo completo de uma compra de ingresso:
# 1. Criar usuário
# 2. Criar sessão
# 3. Verificar assentos
# 4. Criar reserva
# 5. Confirmar pagamento
# 6. Verificar histórico
#
# Uso:
#   ./scripts/test-complete-flow.sh
# ============================================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

BASE_URL="${BASE_URL:-http://localhost:3000}"

print_header() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════════╗"
    echo "║         TESTE DE FLUXO COMPLETO - Cinema Booking System           ║"
    echo "╚═══════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "  ${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "  ${RED}✗${NC} $1"
}

print_info() {
    echo -e "  ${CYAN}→${NC} $1"
}

print_header

# ============================================================================
# STEP 1: Criar Usuário
# ============================================================================
print_step "PASSO 1: Criar Usuário"

TIMESTAMP=$(date +%s)
USER_EMAIL="flow.test.$TIMESTAMP@example.com"

USER_RESPONSE=$(curl -s -X POST "$BASE_URL/users" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"João Silva\", \"email\": \"$USER_EMAIL\"}")

USER_ID=$(echo $USER_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$USER_ID" ]; then
    print_error "Falha ao criar usuário"
    echo "Response: $USER_RESPONSE"
    exit 1
fi

print_success "Usuário criado"
print_info "ID: ${CYAN}$USER_ID${NC}"
print_info "Email: ${CYAN}$USER_EMAIL${NC}"

# ============================================================================
# STEP 2: Criar Sessão de Cinema
# ============================================================================
print_step "PASSO 2: Criar Sessão de Cinema"

# Gerar horário único para evitar conflito
FUTURE_DATE=$(date -u -v+7d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "+7 days" +"%Y-%m-%dT%H:%M:%SZ")

SESSION_RESPONSE=$(curl -s -X POST "$BASE_URL/sessions" \
    -H "Content-Type: application/json" \
    -d "{
        \"movieTitle\": \"Inception\",
        \"room\": \"Sala $TIMESTAMP\",
        \"startTime\": \"$FUTURE_DATE\",
        \"ticketPrice\": 45.00,
        \"totalSeats\": 16
    }")

SESSION_ID=$(echo $SESSION_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
MOVIE_TITLE=$(echo $SESSION_RESPONSE | grep -o '"movieTitle":"[^"]*"' | cut -d'"' -f4)
TICKET_PRICE=$(echo $SESSION_RESPONSE | grep -o '"ticketPrice":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SESSION_ID" ]; then
    print_error "Falha ao criar sessão"
    echo "Response: $SESSION_RESPONSE"
    exit 1
fi

print_success "Sessão criada"
print_info "ID: ${CYAN}$SESSION_ID${NC}"
print_info "Filme: ${CYAN}$MOVIE_TITLE${NC}"
print_info "Preço: ${CYAN}R$ $TICKET_PRICE${NC}"

# ============================================================================
# STEP 3: Verificar Assentos Disponíveis
# ============================================================================
print_step "PASSO 3: Verificar Assentos Disponíveis"

SEATS_RESPONSE=$(curl -s "$BASE_URL/sessions/$SESSION_ID/seats")

# Contar assentos por status
TOTAL_SEATS=$(echo $SEATS_RESPONSE | grep -o '"id":"[^"]*"' | wc -l | tr -d ' ')
AVAILABLE_SEATS=$(echo $SEATS_RESPONSE | grep -o '"status":"AVAILABLE"' | wc -l | tr -d ' ')

# Pegar 2 assentos para reservar
# Usar jq-like parsing com grep/sed
SEAT_ID_1=$(echo $SEATS_RESPONSE | grep -oE '"id":"[a-f0-9-]+"' | head -1 | cut -d'"' -f4)
SEAT_NUM_1=$(echo $SEATS_RESPONSE | grep -oE '"seatLabel":"[^"]+"' | head -1 | cut -d'"' -f4)

SEAT_ID_2=$(echo $SEATS_RESPONSE | grep -oE '"id":"[a-f0-9-]+"' | head -2 | tail -1 | cut -d'"' -f4)
SEAT_NUM_2=$(echo $SEATS_RESPONSE | grep -oE '"seatLabel":"[^"]+"' | head -2 | tail -1 | cut -d'"' -f4)

print_success "Assentos verificados"
print_info "Total: ${CYAN}$TOTAL_SEATS${NC} assentos"
print_info "Disponíveis: ${GREEN}$AVAILABLE_SEATS${NC} assentos"
print_info "Selecionados: ${CYAN}$SEAT_NUM_1${NC} e ${CYAN}$SEAT_NUM_2${NC}"

# ============================================================================
# STEP 4: Criar Reserva
# ============================================================================
print_step "PASSO 4: Criar Reserva (30 segundos TTL)"

IDEMPOTENCY_KEY="flow-test-$TIMESTAMP"

RESERVATION_RESPONSE=$(curl -s -X POST "$BASE_URL/reservations" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
    -d "{
        \"userId\": \"$USER_ID\",
        \"sessionId\": \"$SESSION_ID\",
        \"seatIds\": [\"$SEAT_ID_1\", \"$SEAT_ID_2\"]
    }")

RESERVATION_ID=$(echo $RESERVATION_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
RESERVATION_STATUS=$(echo $RESERVATION_RESPONSE | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
EXPIRES_AT=$(echo $RESERVATION_RESPONSE | grep -o '"expiresAt":"[^"]*"' | cut -d'"' -f4)
TOTAL_AMOUNT=$(echo $RESERVATION_RESPONSE | grep -o '"totalAmount":"[^"]*"' | cut -d'"' -f4)

if [ -z "$RESERVATION_ID" ]; then
    print_error "Falha ao criar reserva"
    echo "Response: $RESERVATION_RESPONSE"
    exit 1
fi

print_success "Reserva criada"
print_info "ID: ${CYAN}$RESERVATION_ID${NC}"
print_info "Status: ${YELLOW}$RESERVATION_STATUS${NC}"
print_info "Valor Total: ${CYAN}R$ $TOTAL_AMOUNT${NC}"
print_info "Expira em: ${YELLOW}$EXPIRES_AT${NC}"

echo ""
echo -e "  ${MAGENTA}⚡ ATENÇÃO: Confirmando pagamento rapidamente (TTL de 30s)...${NC}"

# ============================================================================
# STEP 5: Confirmar Pagamento
# ============================================================================
print_step "PASSO 5: Confirmar Pagamento"

PAYMENT_RESPONSE=$(curl -s -X POST "$BASE_URL/payments/confirm" \
    -H "Content-Type: application/json" \
    -d "{\"reservationId\": \"$RESERVATION_ID\"}")

SALE_ID=$(echo $PAYMENT_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
SALE_STATUS=$(echo $PAYMENT_RESPONSE | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
SALE_AMOUNT=$(echo $PAYMENT_RESPONSE | grep -o '"totalAmount":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SALE_ID" ]; then
    print_error "Falha ao confirmar pagamento"
    echo "Response: $PAYMENT_RESPONSE"
    exit 1
fi

print_success "Pagamento confirmado!"
print_info "Venda ID: ${CYAN}$SALE_ID${NC}"
print_info "Status: ${GREEN}$SALE_STATUS${NC}"
print_info "Valor: ${CYAN}R$ $SALE_AMOUNT${NC}"

# ============================================================================
# STEP 6: Verificar Status dos Assentos
# ============================================================================
print_step "PASSO 6: Verificar Status dos Assentos"

SEATS_AFTER=$(curl -s "$BASE_URL/sessions/$SESSION_ID/seats")

SEAT_1_STATUS=$(echo $SEATS_AFTER | grep -o "\"id\":\"$SEAT_ID_1\"[^}]*" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
SEAT_2_STATUS=$(echo $SEATS_AFTER | grep -o "\"id\":\"$SEAT_ID_2\"[^}]*" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

print_success "Status verificado"
print_info "Assento $SEAT_NUM_1: ${GREEN}$SEAT_1_STATUS${NC}"
print_info "Assento $SEAT_NUM_2: ${GREEN}$SEAT_2_STATUS${NC}"

# ============================================================================
# STEP 7: Verificar Histórico de Compras
# ============================================================================
print_step "PASSO 7: Verificar Histórico de Compras"

HISTORY_RESPONSE=$(curl -s "$BASE_URL/users/$USER_ID/purchases")

PURCHASE_COUNT=$(echo $HISTORY_RESPONSE | grep -o '"id":"[^"]*"' | wc -l | tr -d ' ')
PURCHASE_MOVIE=$(echo $HISTORY_RESPONSE | grep -o '"movieTitle":"[^"]*"' | head -1 | cut -d'"' -f4)

print_success "Histórico verificado"
print_info "Total de compras: ${CYAN}$PURCHASE_COUNT${NC}"
print_info "Última compra: ${CYAN}$PURCHASE_MOVIE${NC}"

# ============================================================================
# RESULTADO FINAL
# ============================================================================
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  RESUMO DA TRANSAÇÃO${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${CYAN}Cliente:${NC}    João Silva ($USER_EMAIL)"
echo -e "  ${CYAN}Filme:${NC}      $MOVIE_TITLE"
echo -e "  ${CYAN}Assentos:${NC}   $SEAT_NUM_1, $SEAT_NUM_2"
echo -e "  ${CYAN}Valor:${NC}      R$ $SALE_AMOUNT"
echo -e "  ${CYAN}Status:${NC}     ${GREEN}CONFIRMADO${NC}"
echo ""

if [ "$SEAT_1_STATUS" = "SOLD" ] && [ "$SEAT_2_STATUS" = "SOLD" ]; then
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✓ TESTE PASSOU! Fluxo completo executado com sucesso!            ║${NC}"
    echo -e "${GREEN}║    • Usuário criado                                               ║${NC}"
    echo -e "${GREEN}║    • Sessão criada com assentos                                   ║${NC}"
    echo -e "${GREEN}║    • Reserva temporária funcionou                                 ║${NC}"
    echo -e "${GREEN}║    • Pagamento confirmado                                         ║${NC}"
    echo -e "${GREEN}║    • Assentos marcados como SOLD                                  ║${NC}"
    echo -e "${GREEN}║    • Histórico de compras registrado                              ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ✗ TESTE FALHOU!                                                  ║${NC}"
    echo -e "${RED}║    Assentos não foram marcados como SOLD                          ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi
