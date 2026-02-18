#!/bin/bash
set -e

# ============================================
# CRM Somapay - SSL Setup com Let's Encrypt
# ============================================
# Uso: bash deploy/ssl-setup.sh seudominio.com.br

DOMAIN=$1

if [ -z "$DOMAIN" ]; then
    echo "Uso: bash deploy/ssl-setup.sh seudominio.com.br"
    echo ""
    echo "Antes de rodar:"
    echo "  1. Configure o DNS do domínio apontando para o IP do servidor"
    echo "  2. Tenha o docker compose rodando (docker compose --profile prod up -d)"
    exit 1
fi

echo "=========================================="
echo "  Configurando SSL para: $DOMAIN"
echo "=========================================="

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# 1. Obter certificado
echo "[1/3] Obtendo certificado SSL..."
docker compose run --rm certbot certonly \
    --webroot \
    --webroot-path /var/www/certbot \
    --email admin@$DOMAIN \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN

# 2. Atualizar nginx.conf
echo "[2/3] Atualizando Nginx..."
sed -i "s/SEU_DOMINIO.com.br/$DOMAIN/g" deploy/nginx.conf

# Descomentar bloco HTTPS
sed -i 's/^# server {/server {/' deploy/nginx.conf
sed -i 's/^#     /    /' deploy/nginx.conf
sed -i 's/^# }/}/' deploy/nginx.conf

# Descomentar redirect HTTP -> HTTPS
sed -i 's/^    # location \/ {/    location \/ {/' deploy/nginx.conf
sed -i 's/^    #     return 301/        return 301/' deploy/nginx.conf
sed -i 's/^    # }/    }/' deploy/nginx.conf

# Comentar bloco HTTP temporário (proxy direto)
# O redirect já vai cuidar disso

# 3. Atualizar CORS_ORIGIN no .env.production
echo "[3/3] Atualizando CORS_ORIGIN..."
sed -i "s|CORS_ORIGIN=.*|CORS_ORIGIN=https://$DOMAIN|" .env.production

# Reload
echo "Recarregando containers..."
docker compose --profile prod up -d --build
docker compose exec nginx nginx -s reload 2>/dev/null || true

echo ""
echo "=========================================="
echo "  SSL configurado com sucesso!"
echo "  Acesse: https://$DOMAIN"
echo "=========================================="
echo ""
echo "  O certificado renova automaticamente."
echo "  Para verificar: docker compose logs certbot"
echo ""
