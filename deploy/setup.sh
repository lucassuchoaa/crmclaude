#!/bin/bash
set -e

# ============================================
# CRM Somapay - Script de Deploy (DigitalOcean)
# ============================================
# Uso: ssh root@SEU_IP "bash -s" < deploy/setup.sh
# Ou:  copie o projeto e rode: bash deploy/setup.sh

echo "=========================================="
echo "  CRM Somapay - Setup de Produção"
echo "=========================================="

# 1. Atualizar sistema
echo ""
echo "[1/6] Atualizando sistema..."
apt-get update -qq && apt-get upgrade -y -qq

# 2. Instalar Docker (se não estiver instalado)
if ! command -v docker &> /dev/null; then
    echo "[2/6] Instalando Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
else
    echo "[2/6] Docker já instalado ✓"
fi

# 3. Instalar Docker Compose plugin (se não estiver)
if ! docker compose version &> /dev/null; then
    echo "[3/6] Instalando Docker Compose..."
    apt-get install -y -qq docker-compose-plugin
else
    echo "[3/6] Docker Compose já instalado ✓"
fi

# 4. Firewall
echo "[4/6] Configurando firewall..."
apt-get install -y -qq ufw
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable

# 5. Criar diretório do projeto
echo "[5/6] Configurando diretório..."
PROJECT_DIR="/opt/crm-somapay"
mkdir -p "$PROJECT_DIR"

if [ -f "docker-compose.yml" ]; then
    echo "  Copiando projeto local..."
    cp -r . "$PROJECT_DIR/"
else
    echo ""
    echo "  ⚠️  O projeto não está no diretório atual."
    echo "  Copie o projeto para $PROJECT_DIR e rode novamente."
    echo ""
    echo "  No seu Mac, rode:"
    echo "    rsync -avz --exclude node_modules --exclude .git \\"
    echo "      /Users/lucasuchoa/Downloads/CRMCLAUD/ root@SEU_IP:$PROJECT_DIR/"
    echo ""
fi

# 6. Checklist
echo "[6/6] Setup do sistema concluído!"
echo ""
echo "=========================================="
echo "  PRÓXIMOS PASSOS"
echo "=========================================="
echo ""
echo "  1. Copie o projeto para o servidor:"
echo "     rsync -avz --exclude node_modules --exclude .git \\"
echo "       . root@SEU_IP:/opt/crm-somapay/"
echo ""
echo "  2. No servidor, edite o .env.production:"
echo "     cd /opt/crm-somapay"
echo "     nano .env.production"
echo "     → Gere JWT_SECRET e REFRESH_SECRET:"
echo "       openssl rand -hex 64"
echo "     → Gere EVOLUTION_API_KEY:"
echo "       openssl rand -hex 32"
echo "     → Defina CORS_ORIGIN com seu IP ou domínio"
echo ""
echo "  3. Suba os containers:"
echo "     docker compose --profile prod up -d --build"
echo ""
echo "  4. Verifique se está rodando:"
echo "     docker compose --profile prod ps"
echo "     curl http://localhost/api/health"
echo ""
echo "  5. (Opcional) Configurar SSL com domínio:"
echo "     bash deploy/ssl-setup.sh SEU_DOMINIO.com.br"
echo ""
echo "=========================================="
