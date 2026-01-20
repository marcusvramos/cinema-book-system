#!/bin/bash

# ============================================================================
# TESTE DE EXPIRAÇÃO AUTOMÁTICA - Cinema Booking System
# ============================================================================
# Este script cria uma reserva e aguarda ela expirar automaticamente
# para verificar se o cron job está funcionando corretamente.
#
# Uso:
#   ./scripts/test-expiration.sh
# ============================================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║           TESTE DE EXPIRAÇÃO - Cinema Booking System              ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Criar usuário
echo -e "${BLUE}[1/6] Criando usuário de teste...${NC}"
USER_RESPONSE=$(curl -s -X POST "$BASE_URL/users" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"Expiration Test User\", \"email\": \"expiration.$(date +%s)@test.com\"}")

USER_ID=$(echo $USER_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$USER_ID" ]; then
    echo -e "${RED}✗ Erro ao criar usuário${NC}"
    exit 1
fi
echo -e "   ✓ Usuário: ${CYAN}$USER_ID${NC}"

# Criar sessão
echo ""
echo -e "${BLUE}[2/6] Criando sessão de cinema...${NC}"
UNIQUE_ROOM="Sala-Expiration-$(date +%s)"
SESSION_RESPONSE=$(curl -s -X POST "$BASE_URL/sessions" \
    -H "Content-Type: application/json" \
    -d "{
        \"movieTitle\": \"Expiration Test Movie\",
        \"room\": \"$UNIQUE_ROOM\",
        \"startTime\": \"2026-01-30T22:00:00Z\",
        \"ticketPrice\": 30.00,
        \"totalSeats\": 16
    }")

SESSION_ID=$(echo $SESSION_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$SESSION_ID" ]; then
    echo -e "${RED}✗ Erro ao criar sessão${NC}"
    exit 1
fi
echo -e "   ✓ Sessão: ${CYAN}$SESSION_ID${NC}"

# Buscar assento
echo ""
echo -e "${BLUE}[3/6] Buscando assento disponível...${NC}"
SEATS_RESPONSE=$(curl -s "$BASE_URL/sessions/$SESSION_ID/seats")
SEAT_ID=$(echo "$SEATS_RESPONSE" | grep -oE '"id":"[a-f0-9-]+"' | head -1 | cut -d'"' -f4)

if [ -z "$SEAT_ID" ]; then
    echo -e "${RED}✗ Nenhum assento disponível${NC}"
    exit 1
fi
echo -e "   ✓ Assento: ${CYAN}$SEAT_ID${NC}"

# Criar reserva
echo ""
echo -e "${BLUE}[4/6] Criando reserva...${NC}"
IDEMPOTENCY_KEY="expiration-test-$(date +%s)"
RESERVATION_RESPONSE=$(curl -s -X POST "$BASE_URL/reservations" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
    -d "{
        \"userId\": \"$USER_ID\",
        \"sessionId\": \"$SESSION_ID\",
        \"seatIds\": [\"$SEAT_ID\"]
    }")

RESERVATION_ID=$(echo $RESERVATION_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
EXPIRES_AT=$(echo $RESERVATION_RESPONSE | grep -o '"expiresAt":"[^"]*"' | cut -d'"' -f4)
STATUS=$(echo $RESERVATION_RESPONSE | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$RESERVATION_ID" ]; then
    echo -e "${RED}✗ Erro ao criar reserva${NC}"
    echo "Response: $RESERVATION_RESPONSE"
    exit 1
fi

echo -e "   ✓ Reserva: ${CYAN}$RESERVATION_ID${NC}"
echo -e "   ✓ Status:  ${YELLOW}$STATUS${NC}"
echo -e "   ✓ Expira:  ${CYAN}$EXPIRES_AT${NC}"

# Verificar status do assento
SEAT_STATUS=$(curl -s "$BASE_URL/sessions/$SESSION_ID/seats" | grep -o "\"id\":\"$SEAT_ID\"[^}]*" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
echo -e "   ✓ Assento: ${YELLOW}$SEAT_STATUS${NC}"

# Aguardar expiração
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}[5/6] Aguardando expiração da reserva...${NC}"
echo -e "      A reserva expira em 30 segundos + até 10 segundos do cron job."
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Barra de progresso
TOTAL_WAIT=45
for i in $(seq 1 $TOTAL_WAIT); do
    # Calcular porcentagem
    PERCENT=$((i * 100 / TOTAL_WAIT))
    FILLED=$((i * 50 / TOTAL_WAIT))
    EMPTY=$((50 - FILLED))
    
    # Construir barra
    BAR=$(printf '%0.s█' $(seq 1 $FILLED 2>/dev/null) 2>/dev/null || echo "")
    SPACE=$(printf '%0.s░' $(seq 1 $EMPTY 2>/dev/null) 2>/dev/null || echo "")
    
    printf "\r   [${CYAN}%s%s${NC}] %3d%% (%2ds restantes)" "$BAR" "$SPACE" "$PERCENT" "$((TOTAL_WAIT - i))"
    sleep 1
done
echo ""
echo ""

# Verificar status final
echo -e "${BLUE}[6/6] Verificando status após expiração...${NC}"

FINAL_RESPONSE=$(curl -s "$BASE_URL/reservations/$RESERVATION_ID")
FINAL_STATUS=$(echo $FINAL_RESPONSE | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

echo -e "   Reserva:  ${CYAN}$RESERVATION_ID${NC}"
echo -e "   Status:   ${YELLOW}$FINAL_STATUS${NC}"

# Verificar assento
FINAL_SEAT_STATUS=$(curl -s "$BASE_URL/sessions/$SESSION_ID/seats" | grep -o "\"id\":\"$SEAT_ID\"[^}]*" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
echo -e "   Assento:  ${YELLOW}$FINAL_SEAT_STATUS${NC}"

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Verificar resultado
if [ "$FINAL_STATUS" = "EXPIRED" ] && [ "$FINAL_SEAT_STATUS" = "AVAILABLE" ]; then
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✓ TESTE PASSOU! Expiração automática funcionando!                ║${NC}"
    echo -e "${GREEN}║    • Reserva foi marcada como EXPIRED                             ║${NC}"
    echo -e "${GREEN}║    • Assento foi liberado (AVAILABLE)                             ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    exit 0
elif [ "$FINAL_STATUS" = "EXPIRED" ]; then
    echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  ⚠ PARCIALMENTE OK                                                ║${NC}"
    echo -e "${YELLOW}║    • Reserva expirou corretamente                                 ║${NC}"
    echo -e "${YELLOW}║    • Assento ainda não foi liberado ($FINAL_SEAT_STATUS)                     ║${NC}"
    echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ✗ TESTE FALHOU!                                                  ║${NC}"
    echo -e "${RED}║    • Status esperado: EXPIRED                                     ║${NC}"
    echo -e "${RED}║    • Status atual: $FINAL_STATUS                                          ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi
