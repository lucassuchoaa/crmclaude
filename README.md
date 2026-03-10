# CRM Somapay — Portal de Parceiros

Sistema CRM completo para gestão de indicações e parceiros da Somapay.
Backend em **Node.js/Express** com banco **SQLite** (local) ou **PostgreSQL** (cloud), frontend em **React 19** + **Vite 7**.

---

## ✨ Funcionalidades

| Módulo              | Descrição                                                                      |
|---------------------|--------------------------------------------------------------------------------|
| **Dashboard**       | KPIs dinâmicos, funil do pipeline, ranking de parceiros, performance de gerentes, atividade recente |
| **Kanban**          | Pipeline visual com drag & drop (8 estágios), filtros avançados, sistema de travas/liberação |
| **Minhas Indicações** | Tela do parceiro para criar e acompanhar indicações (lista ou kanban simplificado) |
| **Meu Convênio**    | Dashboard exclusivo para perfil Convênio com métricas dos parceiros vinculados   |
| **Parceiros**       | Cadastro com consulta CNPJ automática, comissão (% cashin ou R$/conta), convênios |
| **WhatsApp/Chat**   | Chat integrado com WhatsApp via Evolution API, Agente CNPJ, criação de indicações no chat |
| **Visão Diretoria** | Painel hierárquico com drill-down por diretor → gerente → parceiro               |
| **Financeiro**      | Relatórios de comissão, envio/pagamento de NFes, KPIs financeiros               |
| **Material de Apoio**| Biblioteca categorizada com upload de documentos (PDF, XLSX, MP4, etc.)         |
| **Notificações**    | Central de notificações, sino com badge, cadências automáticas, comunicados segmentados |
| **Sync HubSpot**    | Sincronização automática HubSpot 3x/dia (8h, 12h, 17h)                          |
| **Auto-criação HubSpot** | Auto-criação de empresa/oportunidade no HubSpot ao liberar indicação        |
| **Configurações**   | 7 abas: Geral, HubSpot, Notificações, Usuários, Convênios, Materiais, Auditoria (Super Admin) |

### Recursos Adicionais

- 🔐 Autenticação JWT com refresh tokens e troca obrigatória de senha no primeiro login
- 🏢 Consulta automática de CNPJ na Receita Federal (BrasilAPI)
- 🔗 Integração com HubSpot CRM (verificação de duplicatas, deals, sync automático 3x/dia)
- 📱 Integração WhatsApp via Evolution API (QR code, envio/recebimento bidirecional)
- 🔔 Sistema de notificações com 8 cadências automáticas configuráveis
- 📢 Comunicação segmentada por perfil de usuário
- 🤝 Gestão de convênios com vínculo a parceiros
- 🔒 Sistema de liberação/trava temporal com prorrogação
- 🌗 Tema claro e escuro
- 📱 Layout responsivo (mobile, tablet e desktop)
- 🐳 Deploy com Docker + Nginx + SSL (Certbot)
- 🗄️ Suporte dual: SQLite (dev/local) e PostgreSQL (produção/cloud)

---

## 👥 Perfis de Acesso

| Perfil          | Acesso                                                                  |
|-----------------|-------------------------------------------------------------------------|
| **Super Admin** | Acesso total + configurações do sistema                                 |
| **Executivo**   | Visão completa da cadeia de diretores → gerentes → parceiros            |
| **Diretor**     | Gestão da sua equipe de gerentes e seus parceiros + aprovação de NFes   |
| **Gerente**     | Gestão dos seus parceiros, chat WhatsApp, Kanban, comissões             |
| **Parceiro**    | Dashboard pessoal, indicações, NFes, materiais                          |
| **Convênio**    | Dashboard dos parceiros vinculados ao convênio                          |

---

## 🚀 Como Rodar

### Pré-requisitos
- [Node.js](https://nodejs.org/) v18+
- npm v9+

### Instalação Local (dev)

```bash
# Clone o repositório
git clone https://github.com/lucassuchoaa/crmclaude.git
cd crmclaude

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento (frontend + backend)
npm run dev
```

O frontend estará em **http://localhost:5173** e o backend em **http://localhost:3001**.

### Deploy com Docker (Produção)

```bash
# Staging (porta 3333)
docker compose --profile staging up -d --build

# Produção (portas 80/443 com Nginx + SSL)
docker compose --profile prod up -d --build

# Verificar status
docker compose --profile prod ps
curl http://localhost/api/health
```

### Deploy no DigitalOcean

```bash
# 1. Configurar servidor
ssh root@SEU_IP "bash -s" < deploy/setup.sh

# 2. Sincronizar código
rsync -avz --exclude node_modules --exclude .git \
  . root@SEU_IP:/opt/crm-somapay/

# 3. Configurar variáveis de ambiente
ssh root@SEU_IP "nano /opt/crm-somapay/.env.production"

# 4. Subir containers
ssh root@SEU_IP "cd /opt/crm-somapay && docker compose --profile prod up -d --build"

# 5. (Opcional) Configurar SSL
ssh root@SEU_IP "bash /opt/crm-somapay/deploy/ssl-setup.sh SEU_DOMINIO.com.br"
```

---

## 🔑 Usuários de Demonstração

| Perfil      | E-mail                         | Senha      |
|-------------|--------------------------------|------------|
| Super Admin | `admin@somapay.com.br`         | `admin123` |
| Executivo   | `executivo@somapay.com.br`     | `exe123`   |
| Diretor     | `diretoria@somapay.com.br`     | `dir123`   |
| Gerente     | `gerente1@somapay.com.br`      | `ger123`   |
| Parceiro    | `parceiro1@email.com`          | `par123`   |

> ⚠️ No primeiro login, o sistema pode exigir troca obrigatória de senha.

---

## 🎨 Tema

O sistema possui **modo escuro** e **modo claro**, selecionável após o login e alternável a qualquer momento pelo botão no rodapé do menu lateral.

---

## 🛠️ Stack Técnica

### Frontend
- **React 19** — Biblioteca de UI
- **Vite 7** — Bundler e servidor de desenvolvimento
- **CSS-in-JS** — Estilos inline com sistema de temas
- **Google Fonts** — DM Sans + Space Mono

### Backend
- **Node.js 20** + **Express** — API REST
- **SQLite** (better-sqlite3) — Banco de dados local
- **PostgreSQL** (pg) — Banco de dados em produção/cloud
- **JWT** — Autenticação com access + refresh tokens
- **bcrypt** — Hash de senhas
- **multer** — Upload de arquivos
- **node-cron** — Agendamento de tarefas (sync HubSpot 3x/dia)

### Infraestrutura
- **Docker** + **Docker Compose** — Containerização
- **Nginx** — Reverse proxy + SSL
- **Certbot** — Certificados SSL automáticos
- **Evolution API** — Integração WhatsApp

---

## 📁 Estrutura do Projeto

```
CRMCLAUD/
├── deploy/                    # Scripts e configs de deploy
│   ├── nginx.conf             # Nginx produção (SSL)
│   ├── nginx-staging.conf     # Nginx staging
│   ├── setup.sh               # Setup do servidor (DigitalOcean)
│   └── ssl-setup.sh           # Configuração SSL com Certbot
├── server/                    # Backend Node.js/Express
│   ├── config/
│   │   ├── auth.js            # Configuração JWT
│   │   └── database.js        # Adapter dual SQLite/PostgreSQL
│   ├── middleware/
│   │   └── rbac.js            # Controle de acesso por perfil
│   ├── models/
│   │   └── seed.js            # Dados iniciais (seed)
│   ├── routes/
│   │   ├── auth.js            # Login, registro, refresh token
│   │   ├── cnpjAgent.js       # Consulta CNPJ no chat
│   │   ├── commissions.js     # Relatórios de comissão
│   │   ├── convenios.js       # CRUD de convênios
│   │   ├── dashboard.js       # KPIs e dados do dashboard
│   │   ├── diretoria.js       # Visão hierárquica
│   │   ├── groups.js          # Chat/grupos de conversa
│   │   ├── hubspot.js         # Integração HubSpot
│   │   ├── indications.js     # CRUD de indicações + liberação
│   │   ├── materials.js       # Upload/download de materiais
│   │   ├── nfes.js            # Notas fiscais
│   │   ├── notifications.js   # Notificações
│   │   ├── users.js           # CRUD de usuários
│   │   └── whatsapp.js        # Integração WhatsApp/Evolution API
│   ├── services/
│   │   └── evolutionApi.js    # Client Evolution API
│   ├── utils/
│   │   ├── cnpjLookup.js      # Consulta CNPJ (BrasilAPI)
│   │   ├── notificationHelper.js
│   │   ├── phoneUtils.js      # Formatação de telefones
│   │   └── validators.js      # Validações de entrada
│   └── index.js               # Entry point do servidor
├── src/                       # Frontend React
│   ├── App.jsx                # Aplicação principal (componentes + lógica)
│   ├── services/api.js        # Client API (axios)
│   ├── hooks/useBreakpoint.js # Hook de responsividade
│   ├── components/            # Componentes reutilizáveis (UI + layout)
│   ├── main.jsx               # Entry point React
│   └── index.css              # Reset CSS global
├── docker-compose.yml         # Orquestração: staging + prod + Evolution API
├── Dockerfile                 # Build multi-stage (frontend + backend)
├── GUIA_USABILIDADE.md        # Guia completo de usabilidade
└── package.json
```

---

## 🔗 Variáveis de Ambiente

Criar arquivo `.env.production` (ou `.env.staging`) com:

```env
# Autenticação
JWT_SECRET=<openssl rand -hex 64>
REFRESH_SECRET=<openssl rand -hex 64>

# Banco de dados (deixar vazio para SQLite)
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# CORS
CORS_ORIGIN=https://SEU_DOMINIO.com.br

# Evolution API (WhatsApp)
EVOLUTION_API_KEY=<openssl rand -hex 32>
EVOLUTION_API_URL=http://evolution-api:8080

# HubSpot (opcional)
HUBSPOT_API_KEY=pat-na1-xxxxx
```

---

## 📝 Licença

Projeto proprietário — Somapay © 2025–2026
