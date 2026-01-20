#!/bin/bash

# ============================================================================
# TESTE DE RATE LIMITING - Cinema Booking System
# ============================================================================
# Este script testa se o rate limiting está funcionando corretamente
# fazendo múltiplas requisições rápidas até atingir o limite.
#
# Uso:
#   ./scripts/test-rate-limit.sh [endpoint] [numRequests]
#
# Exemplo:
#   ./scripts/test-rate-limit.sh /sessions 150
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
ENDPOINT="${1:-/sessions}"
NUM_REQUESTS="${2:-120}"

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║           TESTE DE RATE LIMITING - Cinema Booking System          ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${YELLOW}Configuração:${NC}"
echo -e "  • Endpoint:    ${CYAN}$BASE_URL$ENDPOINT${NC}"
echo -e "  • Requisições: ${CYAN}$NUM_REQUESTS${NC}"
echo ""

# Primeira requisição para verificar headers
echo -e "${BLUE}[1/2] Verificando headers de rate limit...${NC}"

FIRST_RESPONSE=$(curl -s -i "$BASE_URL$ENDPOINT" 2>&1 | head -20)

LIMIT=$(echo "$FIRST_RESPONSE" | grep -i "x-ratelimit-limit" | cut -d':' -f2 | tr -d ' \r')
REMAINING=$(echo "$FIRST_RESPONSE" | grep -i "x-ratelimit-remaining" | cut -d':' -f2 | tr -d ' \r')
RESET=$(echo "$FIRST_RESPONSE" | grep -i "x-ratelimit-reset" | cut -d':' -f2 | tr -d ' \r')

if [ -z "$LIMIT" ]; then
    echo -e "  ${YELLOW}⚠ Headers de rate limit não encontrados${NC}"
    echo -e "  ${YELLOW}  O rate limiting pode não estar habilitado${NC}"
else
    echo -e "  ${GREEN}✓${NC} X-RateLimit-Limit: ${CYAN}$LIMIT${NC}"
    echo -e "  ${GREEN}✓${NC} X-RateLimit-Remaining: ${CYAN}$REMAINING${NC}"
    echo -e "  ${GREEN}✓${NC} X-RateLimit-Reset: ${CYAN}$RESET${NC}"
fi

echo ""
echo -e "${BLUE}[2/2] Disparando $NUM_REQUESTS requisições...${NC}"
echo ""

# Criar arquivo temporário para resultados
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

SUCCESS_COUNT=0
RATE_LIMITED_COUNT=0
ERROR_COUNT=0

# Função para fazer requisição
make_request() {
    local idx=$1
    local response=$(curl -s -w "\n%{http_code}" "$BASE_URL$ENDPOINT")
    local http_code=$(echo "$response" | tail -1)
    echo "$http_code" > "$TEMP_DIR/result_$idx.txt"
}

# Disparar requisições em lotes de 20 para não sobrecarregar
BATCH_SIZE=20
BATCHES=$((NUM_REQUESTS / BATCH_SIZE))
REMAINDER=$((NUM_REQUESTS % BATCH_SIZE))

current=1
for batch in $(seq 1 $BATCHES); do
    for i in $(seq 1 $BATCH_SIZE); do
        make_request $current &
        current=$((current + 1))
    done
    wait
    
    # Mostrar progresso
    printf "\r  Progresso: [${CYAN}%3d/${NUM_REQUESTS}${NC}]" "$((batch * BATCH_SIZE))"
done

# Processar requisições restantes
if [ $REMAINDER -gt 0 ]; then
    for i in $(seq 1 $REMAINDER); do
        make_request $current &
        current=$((current + 1))
    done
    wait
fi

printf "\r  Progresso: [${CYAN}$NUM_REQUESTS/$NUM_REQUESTS${NC}]"
echo ""
echo ""

# Analisar resultados
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Análise dos Resultados:${NC}"
echo ""

for i in $(seq 1 $NUM_REQUESTS); do
    if [ -f "$TEMP_DIR/result_$i.txt" ]; then
        http_code=$(cat "$TEMP_DIR/result_$i.txt")
        case $http_code in
            200|201)
                SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
                ;;
            429)
                RATE_LIMITED_COUNT=$((RATE_LIMITED_COUNT + 1))
                ;;
            *)
                ERROR_COUNT=$((ERROR_COUNT + 1))
                ;;
        esac
    fi
done

echo -e "  ${GREEN}✓ HTTP 200/201 (Sucesso):     $SUCCESS_COUNT${NC}"
echo -e "  ${YELLOW}⚠ HTTP 429 (Rate Limited):   $RATE_LIMITED_COUNT${NC}"
echo -e "  ${RED}✗ Outros erros:              $ERROR_COUNT${NC}"

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ $RATE_LIMITED_COUNT -gt 0 ]; then
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✓ RATE LIMITING FUNCIONANDO!                                     ║${NC}"
    echo -e "${GREEN}║    $RATE_LIMITED_COUNT requisições foram bloqueadas (HTTP 429)               ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    
    # Testar header Retry-After
    echo ""
    echo -e "${BLUE}Verificando header Retry-After...${NC}"
    
    RETRY_RESPONSE=$(curl -s -i "$BASE_URL$ENDPOINT" 2>&1 | head -20)
    RETRY_AFTER=$(echo "$RETRY_RESPONSE" | grep -i "retry-after" | cut -d':' -f2 | tr -d ' \r')
    
    if [ -n "$RETRY_AFTER" ]; then
        echo -e "  ${GREEN}✓${NC} Retry-After: ${CYAN}$RETRY_AFTER segundos${NC}"
    fi
    
    exit 0
else
    echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  ⚠ RATE LIMITING NÃO DETECTADO                                    ║${NC}"
    echo -e "${YELLOW}║    Nenhuma requisição foi bloqueada com HTTP 429.                 ║${NC}"
    echo -e "${YELLOW}║    Possíveis causas:                                              ║${NC}"
    echo -e "${YELLOW}║    • Rate limit muito alto (acima de $NUM_REQUESTS req/min)                  ║${NC}"
    echo -e "${YELLOW}║    • Rate limiting não está habilitado                            ║${NC}"
    echo -e "${YELLOW}║    • Redis não está conectado                                     ║${NC}"
    echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    exit 0
fi
