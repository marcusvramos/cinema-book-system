#!/bin/bash

# ============================================================================
# TESTE DE CONCORRÊNCIA - Cinema Booking System
# ============================================================================
# Este script simula múltiplos usuários tentando reservar o MESMO assento
# simultaneamente para testar o controle de concorrência do sistema.
#
# Uso:
#   ./scripts/test-concurrency.sh [sessionId] [seatId] [numRequests]
#
# Exemplo:
#   ./scripts/test-concurrency.sh abc-123 seat-456 10
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
SESSION_ID="${1:-}"
SEAT_ID="${2:-}"
NUM_REQUESTS="${3:-10}"

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║           TESTE DE CONCORRÊNCIA - Cinema Booking System           ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Se não passar parâmetros, criar sessão e usuários automaticamente
if [ -z "$SESSION_ID" ] || [ -z "$SEAT_ID" ]; then
    echo -e "${YELLOW}[Setup] Criando dados de teste automaticamente...${NC}"
    echo ""
    
    # Criar usuários para o teste
    echo -e "${BLUE}[1/3] Criando usuários de teste...${NC}"
    USER_IDS=()
    for i in $(seq 1 $NUM_REQUESTS); do
        USER_RESPONSE=$(curl -s -X POST "$BASE_URL/users" \
            -H "Content-Type: application/json" \
            -d "{\"name\": \"User Concurrency $i\", \"email\": \"concurrency.user.$i.$(date +%s)@test.com\"}")
        USER_ID=$(echo $USER_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -n "$USER_ID" ]; then
            USER_IDS+=("$USER_ID")
            echo -e "   ✓ Usuário $i criado: ${CYAN}$USER_ID${NC}"
        fi
    done
    
    if [ ${#USER_IDS[@]} -eq 0 ]; then
        echo -e "${RED}✗ Erro ao criar usuários${NC}"
        exit 1
    fi
    
    # Criar sessão
    echo ""
    echo -e "${BLUE}[2/3] Criando sessão de cinema...${NC}"
    UNIQUE_ROOM="Sala-Concurrency-$(date +%s)"
    SESSION_RESPONSE=$(curl -s -X POST "$BASE_URL/sessions" \
        -H "Content-Type: application/json" \
        -d "{
            \"movieTitle\": \"Concurrency Test Movie\",
            \"room\": \"$UNIQUE_ROOM\",
            \"startTime\": \"2026-01-30T20:00:00Z\",
            \"ticketPrice\": 25.00,
            \"totalSeats\": 16
        }")
    
    SESSION_ID=$(echo $SESSION_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$SESSION_ID" ]; then
        echo -e "${RED}✗ Erro ao criar sessão${NC}"
        echo "Response: $SESSION_RESPONSE"
        exit 1
    fi
    echo -e "   ✓ Sessão criada: ${CYAN}$SESSION_ID${NC}"
    
    # Buscar assentos
    echo ""
    echo -e "${BLUE}[3/3] Buscando assentos disponíveis...${NC}"
    SEATS_RESPONSE=$(curl -s "$BASE_URL/sessions/$SESSION_ID/seats")
    
    # Pegar o primeiro assento disponível
    SEAT_ID=$(echo $SEATS_RESPONSE | grep -oE '"id":"[a-f0-9-]+"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$SEAT_ID" ]; then
        echo -e "${RED}✗ Nenhum assento disponível${NC}"
        exit 1
    fi
    echo -e "   ✓ Assento alvo: ${CYAN}$SEAT_ID${NC}"
    echo ""
fi

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Configuração do Teste:${NC}"
echo -e "  • Base URL:     ${CYAN}$BASE_URL${NC}"
echo -e "  • Session ID:   ${CYAN}$SESSION_ID${NC}"
echo -e "  • Seat ID:      ${CYAN}$SEAT_ID${NC}"
echo -e "  • Requisições:  ${CYAN}$NUM_REQUESTS${NC} simultâneas"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Criar diretório temporário para resultados
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo -e "${BLUE}[Teste] Disparando $NUM_REQUESTS requisições simultâneas...${NC}"
echo ""

# Função para fazer uma requisição
make_request() {
    local idx=$1
    local user_id=${USER_IDS[$((idx-1))]:-${USER_IDS[0]}}
    local idempotency_key="concurrency-test-$idx-$(date +%s%N)"
    
    local response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/reservations" \
        -H "Content-Type: application/json" \
        -H "Idempotency-Key: $idempotency_key" \
        -d "{
            \"userId\": \"$user_id\",
            \"sessionId\": \"$SESSION_ID\",
            \"seatIds\": [\"$SEAT_ID\"]
        }")
    
    local http_code=$(echo "$response" | tail -1)
    local body=$(echo "$response" | sed '$d')
    
    echo "$idx|$http_code|$body" > "$TEMP_DIR/result_$idx.txt"
}

# Disparar todas as requisições em paralelo
for i in $(seq 1 $NUM_REQUESTS); do
    make_request $i &
done

# Aguardar todas terminarem
wait

# Analisar resultados
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Resultados:${NC}"
echo ""

SUCCESS_COUNT=0
CONFLICT_COUNT=0
ERROR_COUNT=0
RESERVATION_ID=""

for i in $(seq 1 $NUM_REQUESTS); do
    result=$(cat "$TEMP_DIR/result_$i.txt")
    idx=$(echo "$result" | cut -d'|' -f1)
    http_code=$(echo "$result" | cut -d'|' -f2)
    body=$(echo "$result" | cut -d'|' -f3-)
    
    if [ "$http_code" = "201" ]; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        RESERVATION_ID=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        echo -e "  ${GREEN}✓ Requisição $idx: HTTP $http_code - SUCESSO${NC} (Reserva: ${CYAN}$RESERVATION_ID${NC})"
    elif [ "$http_code" = "409" ]; then
        CONFLICT_COUNT=$((CONFLICT_COUNT + 1))
        echo -e "  ${YELLOW}⚠ Requisição $idx: HTTP $http_code - CONFLITO${NC} (Assento já reservado)"
    else
        ERROR_COUNT=$((ERROR_COUNT + 1))
        error_msg=$(echo "$body" | grep -o '"message":"[^"]*"' | head -1 | cut -d'"' -f4)
        echo -e "  ${RED}✗ Requisição $idx: HTTP $http_code - ERRO${NC} ($error_msg)"
    fi
done

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Resumo:${NC}"
echo -e "  ${GREEN}✓ Sucessos:  $SUCCESS_COUNT${NC}"
echo -e "  ${YELLOW}⚠ Conflitos: $CONFLICT_COUNT${NC}"
echo -e "  ${RED}✗ Erros:     $ERROR_COUNT${NC}"
echo ""

# Verificação do teste
if [ $SUCCESS_COUNT -eq 1 ] && [ $CONFLICT_COUNT -eq $((NUM_REQUESTS - 1)) ]; then
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✓ TESTE PASSOU! Controle de concorrência funcionando!            ║${NC}"
    echo -e "${GREEN}║    Apenas 1 requisição conseguiu reservar o assento.              ║${NC}"
    echo -e "${GREEN}║    As outras $CONFLICT_COUNT foram corretamente bloqueadas.                    ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    
    # Verificar status do assento
    echo ""
    echo -e "${BLUE}[Verificação] Checando status do assento...${NC}"
    SEAT_STATUS=$(curl -s "$BASE_URL/sessions/$SESSION_ID/seats" | grep -o "\"id\":\"$SEAT_ID\"[^}]*\"status\":\"[^\"]*\"" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    if [ "$SEAT_STATUS" = "RESERVED" ]; then
        echo -e "  ${GREEN}✓ Assento está RESERVED conforme esperado${NC}"
    else
        echo -e "  ${YELLOW}⚠ Status do assento: $SEAT_STATUS${NC}"
    fi
    
    exit 0
elif [ $SUCCESS_COUNT -gt 1 ]; then
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ✗ TESTE FALHOU! Múltiplas reservas para o mesmo assento!         ║${NC}"
    echo -e "${RED}║    $SUCCESS_COUNT requisições conseguiram reservar (deveria ser apenas 1)    ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    exit 1
else
    echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  ⚠ RESULTADO INESPERADO                                           ║${NC}"
    echo -e "${YELLOW}║    Verifique os logs para mais detalhes.                          ║${NC}"
    echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi
