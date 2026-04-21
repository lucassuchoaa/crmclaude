<div align="center">

# 🚀 CRM Somapay

**Portal de Parceiros — Gestão completa de indicações, comissões e pipeline comercial**

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/Licença-Proprietária-red)](#-licença)
[![Status](https://img.shields.io/badge/Status-Produção-brightgreen)](#)

<br/>

<img src="kanban-negocios.png" alt="Pipeline Kanban — Visão do gerente com drag & drop entre estágios" width="90%"/>

<br/>

*Pipeline Kanban com drag & drop, filtros avançados e sistema de liberação temporal*

</div>

<br/>

---

## ⚡ Highlights

| | Feature | O que resolve |
|---|---|---|
| 🎯 | **Pipeline Kanban visual** | Drag & drop entre 8 estágios com travas, liberação e prorrogação — sem planilha |
| 💬 | **WhatsApp integrado** | Envio/recebimento bidirecional via Evolution API + agente CNPJ no chat |
| 🔄 | **Sync HubSpot automático** | Sincronização 3x/dia + auto-criação de empresas/deals ao liberar indicações |
| 💰 | **Financeiro completo** | Comissões (% cashin ou R$/conta), upload de NFes, aprovação por diretoria |
| 👥 | **6 perfis com RBAC** | Super Admin → Executivo → Diretor → Gerente → Parceiro → Convênio |

---

## 🏁 Quick Start

Do zero ao CRM rodando em **4 comandos**:

```bash
git clone https://github.com/lucassuchoaa/crmclaude.git
cd crmclaude
npm install
npm run dev
```

Acesse **http://localhost:5173** — login: `admin@somapay.com.br` / `admin123`

> [!TIP]
> O banco SQLite é criado automaticamente. Sem necessidade de configurar banco externo para desenvolvimento.

---

## 📦 Instalação Detalhada

### Pré-requisitos

| Requisito | Versão mínima | Verificar |
|-----------|---------------|-----------|
| **Node.js** | 20.0.0+ | `node -v` |
| **npm** | 9+ | `npm -v` |
| **Docker** *(produção)* | 20+ | `docker -v` |
| **Git** | 2.30+ | `git -v` |

### Passo a passo

```bash
# 1. Clone o repositório
git clone https://github.com/lucassuchoaa/crmclaude.git
cd crmclaude

# 2. Instale as dependências
npm install

# 3. Configure o ambiente (opcional para dev)
cp .env.example .env

# 4. Popule o banco com dados de demonstração
npm run seed

# 5. Inicie frontend + backend simultaneamente
npm run dev
```

| Serviço | URL | Descrição |
|---------|-----|-----------|
| Frontend | http://localhost:5173 | React + Vite (HMR) |
| Backend API | http://localhost:3001/api | Node.js + Express |
| Health Check | http://localhost:3001/api/health | Status do servidor |

### Configuração do `.env`

Crie a partir do template:

```bash
cp .env.example .env
```

```env
# === Servidor ===
NODE_ENV=development
PORT=3001

# === Autenticação (OBRIGATÓRIO em produção) ===
JWT_SECRET=sua-chave-secreta-minimo-32-caracteres
REFRESH_SECRET=sua-chave-refresh-minimo-32-caracteres

# === CORS ===
CORS_ORIGIN=http://localhost:5173

# === Frontend ===
VITE_API_URL=http://localhost:3001/api

# === Rate Limiting ===
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# === Email (opcional) ===
MAIL_PROVIDER=gmail                    # gmail | ses
GMAIL_USER=seu-email@gmail.com
GMAIL_APP_PASSWORD=sua-app-password

# === Database (vazio = SQLite local) ===
DATABASE_URL=                          # postgresql://user:pass@host:5432/db

# === WhatsApp — Evolution API (opcional) ===
EVOLUTION_API_KEY=sua-chave
EVOLUTION_API_URL=http://evolution-api:8080

# === HubSpot (opcional) ===
HUBSPOT_API_KEY=pat-na1-xxxxx
```

> [!IMPORTANT]
> Em produção, gere segredos fortes:
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

---

## 🎬 Uso & Exemplos

### 1. Criar uma indicação (Parceiro)

```javascript
// POST /api/indications
const response = await fetch('http://localhost:3001/api/indications', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    company_name: 'TechCorp LTDA',
    cnpj: '12.345.678/0001-90',
    contact_name: 'João Silva',
    contact_phone: '11999887766',
    estimated_employees: 150,
    notes: 'Interessado no produto premium'
  })
});
```

### 2. Consultar CNPJ automaticamente

```javascript
// GET /api/cnpj/:cnpj
const cnpjData = await fetch('http://localhost:3001/api/cnpj/12345678000190', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Retorno: razão social, fantasia, endereço, situação cadastral, etc.
// Fonte: BrasilAPI (Receita Federal)
```

### 3. Movimentar deal no Kanban (Gerente)

```javascript
// PATCH /api/indications/:id/stage
await fetch('http://localhost:3001/api/indications/42/stage', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    stage: 'proposta_enviada'
  })
});
```

---

## 📡 API — Endpoints Principais

A API REST roda na porta `3001` com prefixo `/api`. Autenticação via **Bearer Token (JWT)**.

### Autenticação

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/auth/login` | Login (retorna access + refresh token) |
| `POST` | `/api/auth/register` | Cadastrar usuário (admin) |
| `POST` | `/api/auth/refresh` | Renovar access token |
| `POST` | `/api/auth/change-password` | Trocar senha |

### Core — Indicações & Pipeline

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/indications` | Listar indicações (filtros por status, parceiro, datas) |
| `POST` | `/api/indications` | Criar indicação |
| `PATCH` | `/api/indications/:id/stage` | Mover estágio no Kanban |
| `POST` | `/api/indications/:id/release` | Liberar indicação (auto-cria no HubSpot) |
| `GET` | `/api/pipelines` | Listar pipelines configurados |
| `GET` | `/api/leads` | Listar leads |
| `POST` | `/api/proposals` | Criar proposta comercial |

### Parceiros & Usuários

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/users` | Listar usuários |
| `POST` | `/api/users` | Criar usuário (com perfil e permissões) |
| `GET` | `/api/users/:id` | Detalhes do usuário |
| `GET` | `/api/teams` | Listar equipes |
| `GET` | `/api/convenios` | Listar convênios |

### Financeiro

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/commissions` | Relatório de comissões |
| `POST` | `/api/nfes` | Upload de nota fiscal |
| `PATCH` | `/api/nfes/:id/status` | Aprovar/rejeitar NFe |
| `GET` | `/api/contracts` | Listar contratos |

### Integrações

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/hubspot/sync` | Forçar sincronização HubSpot |
| `GET` | `/api/hubspot/status` | Status da integração |
| `GET` | `/api/whatsapp/status` | Status da conexão WhatsApp |
| `POST` | `/api/whatsapp/send` | Enviar mensagem WhatsApp |
| `GET` | `/api/cnpj/:cnpj` | Consulta CNPJ (BrasilAPI) |

### Dashboard & Relatórios

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/dashboard` | KPIs, funil, ranking |
| `GET` | `/api/diretoria` | Visão hierárquica (drill-down) |
| `GET` | `/api/notifications` | Central de notificações |
| `GET` | `/api/materials` | Materiais de apoio |

---

## ⚙️ Configuração

### Variáveis de Ambiente

| Variável | Obrigatória | Default | Descrição |
|----------|:-----------:|---------|-----------|
| `NODE_ENV` | — | `development` | Ambiente (`development`, `staging`, `production`) |
| `PORT` | — | `3001` | Porta do servidor backend |
| `JWT_SECRET` | ✅ Prod | `dev-secret` | Segredo para assinar JWT tokens |
| `REFRESH_SECRET` | ✅ Prod | `dev-refresh` | Segredo para refresh tokens |
| `CORS_ORIGIN` | — | `http://localhost:5173` | Origem permitida para CORS |
| `VITE_API_URL` | — | `http://localhost:3001/api` | URL da API para o frontend |
| `DATABASE_URL` | — | — | URL do PostgreSQL (vazio = SQLite) |
| `RATE_LIMIT_WINDOW_MS` | — | `900000` | Janela do rate limit (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | — | `100` | Máx. requisições por janela |
| `MAIL_PROVIDER` | — | `gmail` | Provider de email (`gmail` \| `ses`) |
| `GMAIL_USER` | — | — | Email para envio via Gmail |
| `GMAIL_APP_PASSWORD` | — | — | App Password do Gmail |
| `EVOLUTION_API_KEY` | — | — | Chave da Evolution API (WhatsApp) |
| `EVOLUTION_API_URL` | — | — | URL da Evolution API |
| `HUBSPOT_API_KEY` | — | — | Token da API HubSpot |

### Banco de Dados

| Ambiente | Banco | Config |
|----------|-------|--------|
| **Development** | SQLite | Automático, sem config |
| **Staging** | SQLite ou PostgreSQL | `DATABASE_URL` no `.env.staging` |
| **Production** | PostgreSQL (recomendado) | `DATABASE_URL` no `.env.production` |

---

## 📁 Estrutura do Projeto

```
CRMCLAUD/
├── .github/workflows/         # CI/CD — deploy automatizado
│   └── deploy.yml
├── deploy/                    # Infraestrutura de deploy
│   ├── nginx.conf             # Nginx produção (reverse proxy + SSL)
│   ├── nginx-staging.conf     # Nginx staging
│   ├── setup.sh               # Bootstrap do servidor (DigitalOcean)
│   └── ssl-setup.sh           # Configuração SSL com Certbot
│
├── server/                    # 🔧 Backend — Node.js + Express
│   ├── config/
│   │   ├── auth.js            # Configuração JWT (access + refresh)
│   │   └── database.js        # Adapter dual SQLite ↔ PostgreSQL
│   ├── middleware/
│   │   └── rbac.js            # Role-Based Access Control (6 perfis)
│   ├── models/
│   │   └── seed.js            # Dados iniciais + usuários demo
│   ├── routes/                # 28 módulos de rotas
│   │   ├── auth.js            # Login, registro, refresh token
│   │   ├── indications.js     # CRUD indicações + liberação + travas
│   │   ├── pipelines.js       # Pipeline Kanban configurável
│   │   ├── leads.js           # Gestão de leads
│   │   ├── commissions.js     # Relatórios de comissão
│   │   ├── contracts.js       # Contratos
│   │   ├── proposals.js       # Propostas comerciais
│   │   ├── nfes.js            # Notas fiscais (upload + aprovação)
│   │   ├── hubspot.js         # Sync HubSpot (auto 3x/dia)
│   │   ├── whatsapp.js        # Integração WhatsApp/Evolution
│   │   ├── cnpjAgent.js       # Agente CNPJ no chat
│   │   ├── dashboard.js       # KPIs e dados do dashboard
│   │   ├── diretoria.js       # Visão hierárquica (drill-down)
│   │   ├── notifications.js   # Central de notificações
│   │   ├── cadences.js        # Cadências automáticas
│   │   ├── users.js           # CRUD de usuários
│   │   ├── teams.js           # Equipes
│   │   ├── convenios.js       # CRUD de convênios
│   │   ├── materials.js       # Upload/download de materiais
│   │   ├── permissions.js     # Permissões granulares
│   │   ├── workflows.js       # Automações/workflows
│   │   ├── products.js        # Catálogo de produtos
│   │   ├── landingPages.js    # Landing pages
│   │   ├── inbox.js           # Caixa de entrada
│   │   ├── groups.js          # Grupos de conversa
│   │   ├── google.js          # Integração Google
│   │   ├── netsuite.js        # Integração NetSuite
│   │   └── aiAgent.js         # Agente IA
│   ├── services/
│   │   └── evolutionApi.js    # Client Evolution API (WhatsApp)
│   ├── utils/
│   │   ├── cnpjLookup.js      # Consulta CNPJ via BrasilAPI
│   │   ├── notificationHelper.js  # Engine de notificações
│   │   ├── phoneUtils.js      # Formatação de telefones BR
│   │   └── validators.js      # Validação de entrada
│   ├── data/                  # Banco SQLite (auto-criado)
│   └── index.js               # Entry point do servidor
│
├── src/                       # ⚛️ Frontend — React 19
│   ├── App.jsx                # App principal (componentes + roteamento)
│   ├── pages/
│   │   ├── LoginPage.jsx      # Tela de login
│   │   ├── DashboardPage.jsx  # Dashboard com KPIs
│   │   └── KanbanPage.jsx     # Pipeline Kanban (drag & drop)
│   ├── components/
│   │   ├── layout/            # Sidebar, Header, Layout
│   │   └── ui/                # Componentes reutilizáveis
│   ├── contexts/
│   │   ├── AuthContext.jsx    # Estado de autenticação
│   │   ├── NotificationContext.jsx  # Notificações real-time
│   │   └── ThemeContext.jsx   # Tema claro/escuro
│   ├── hooks/
│   │   └── useBreakpoint.js   # Hook de responsividade
│   ├── services/
│   │   └── api.js             # Client HTTP (axios)
│   ├── assets/                # Imagens e recursos estáticos
│   ├── main.jsx               # Entry point React
│   └── index.css              # Reset + variáveis CSS globais
│
├── docker-compose.yml         # Orquestração: staging + prod + Evolution API
├── Dockerfile                 # Multi-stage build (frontend + backend)
├── package.json               # Dependências e scripts
├── vite.config.js             # Configuração Vite + proxy API
├── eslint.config.js           # Linting (React + Node.js)
├── tailwind.config.js         # Configuração Tailwind CSS
├── GUIA_USABILIDADE.md        # Guia completo de usabilidade
└── GUIA_PROSPECCAO.md         # Guia de prospecção de parceiros
```

---

## 👥 Perfis de Acesso

| Perfil | Dashboard | Kanban | Indicações | Financeiro | Config | WhatsApp |
|--------|:---------:|:------:|:----------:|:----------:|:------:|:--------:|
| **Super Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Executivo** | ✅ Completo | ✅ | ✅ | ✅ | — | ✅ |
| **Diretor** | ✅ Equipe | ✅ | ✅ | ✅ Aprovar NFe | — | ✅ |
| **Gerente** | ✅ Parceiros | ✅ | ✅ | ✅ | — | ✅ |
| **Parceiro** | ✅ Pessoal | — | ✅ Próprias | ✅ Próprias | — | — |
| **Convênio** | ✅ Vinculados | — | — | — | — | — |

### Usuários de Demonstração

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Super Admin | `admin@somapay.com.br` | `admin123` |
| Executivo | `executivo@somapay.com.br` | `exe123` |
| Diretor | `diretoria@somapay.com.br` | `dir123` |
| Gerente | `gerente1@somapay.com.br` | `ger123` |
| Parceiro | `parceiro1@email.com` | `par123` |

> [!WARNING]
> No primeiro login, o sistema exige **troca obrigatória de senha**. Em produção, altere todas as senhas padrão imediatamente.

---

## 🛠️ Desenvolvimento

### Scripts disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia frontend + backend (concurrently) |
| `npm run dev:client` | Apenas Vite dev server |
| `npm run dev:server` | Apenas backend com `--watch` |
| `npm run build` | Build de produção do frontend |
| `npm run seed` | Popula banco com dados demo |
| `npm run setup` | `npm install` + seed (setup completo) |
| `npm run lint` | Verifica código (ESLint) |
| `npm run lint:fix` | Corrige problemas automaticamente |
| `npm test` | Roda testes (Vitest watch) |
| `npm run test:run` | Testes — single run |
| `npm run test:coverage` | Testes com cobertura (v8) |
| `npm run test:ui` | Vitest UI browser |
| `npm start` | Inicia servidor em produção |

### Testes

```bash
# Rodar todos os testes
npm test

# Single run (CI)
npm run test:run

# Com cobertura
npm run test:coverage

# Interface visual
npm run test:ui
```

### Linting & Code Style

```bash
# Verificar
npm run lint

# Corrigir automaticamente
npm run lint:fix
```

Configuração ESLint em `eslint.config.js` com regras separadas para:
- **Frontend** (`src/`): React Hooks, React Refresh
- **Backend** (`server/`): Node.js globals
- **Testes** (`*.test.js`): Vitest globals

### Stack Técnica

<table>
<tr>
<td width="50%">

**Frontend**
- React 19 + React Router 7
- Vite 7 (bundler + HMR)
- Tailwind CSS 3.4
- Axios (HTTP client)
- Google Fonts (DM Sans + Space Mono)

</td>
<td width="50%">

**Backend**
- Node.js 20 + Express 4
- SQLite (better-sqlite3) / PostgreSQL (pg)
- JWT (jsonwebtoken) + bcrypt
- Multer (uploads) + Helmet (segurança)
- node-cron (scheduler) + Nodemailer

</td>
</tr>
<tr>
<td width="50%">

**Infraestrutura**
- Docker + Docker Compose
- Nginx (reverse proxy)
- Certbot (SSL automático)
- GitHub Actions (CI/CD)

</td>
<td width="50%">

**Integrações**
- HubSpot CRM (sync automático)
- Evolution API (WhatsApp)
- BrasilAPI (consulta CNPJ)
- Gmail / Amazon SES (email)
- Google APIs
- NetSuite

</td>
</tr>
</table>

---

## 🐳 Deploy

### Docker — Staging

```bash
# Subir staging (porta 3333)
docker compose --profile staging up -d --build

# Verificar
curl http://localhost:3333/api/health
```

### Docker — Produção (SSL)

```bash
# Subir produção (80/443 com Nginx + SSL)
docker compose --profile prod up -d --build

# Verificar
docker compose --profile prod ps
curl https://seu-dominio.com.br/api/health
```

### Deploy no DigitalOcean

```bash
# 1. Bootstrap do servidor
ssh root@SEU_IP "bash -s" < deploy/setup.sh

# 2. Enviar código
rsync -avz --exclude node_modules --exclude .git \
  . root@SEU_IP:/opt/crm-somapay/

# 3. Configurar variáveis
ssh root@SEU_IP "nano /opt/crm-somapay/.env.production"

# 4. Subir containers
ssh root@SEU_IP "cd /opt/crm-somapay && docker compose --profile prod up -d --build"

# 5. SSL automático
ssh root@SEU_IP "bash /opt/crm-somapay/deploy/ssl-setup.sh seu-dominio.com.br"
```

### Arquitetura Docker

```
┌──────────────────────────────────────────────┐
│                   Internet                    │
└──────────────────┬───────────────────────────┘
                   │ :80 / :443
           ┌───────▼───────┐
           │     Nginx     │  Reverse proxy + SSL
           │   (Alpine)    │  Certbot auto-renewal
           └───────┬───────┘
                   │ :3001
           ┌───────▼───────┐
           │   CRM App     │  Frontend (dist/) + Backend (Express)
           │  (Node 20)    │  SQLite/PostgreSQL
           └───────┬───────┘
                   │ :8080 (internal)
        ┌──────────▼──────────┐
        │   Evolution API     │  WhatsApp Business
        │   (v1.8.1)          │  QR Code + Webhooks
        └─────────────────────┘
```

---

## 🤝 Contribuição

### Como contribuir

1. **Fork** o repositório
2. Crie sua branch: `git checkout -b feature/minha-feature`
3. Faça commit: `git commit -m 'feat: adiciona nova feature'`
4. Envie: `git push origin feature/minha-feature`
5. Abra um **Pull Request**

### Convenções

- **Commits**: Use [Conventional Commits](https://www.conventionalcommits.org/)
  - `feat:` nova funcionalidade
  - `fix:` correção de bug
  - `docs:` documentação
  - `refactor:` refatoração sem mudança de comportamento
  - `chore:` manutenção / tooling
- **Branch naming**: `feature/`, `fix/`, `docs/`, `refactor/`
- **Linting**: Rode `npm run lint` antes de commitar
- **Testes**: Adicione testes para novas funcionalidades

### Padrões de código

- ESM (ES Modules) — `import`/`export` em toda a codebase
- Componentes React como funções com hooks
- Context API para estado global (Auth, Theme, Notifications)
- Validação de entrada no backend com `validators.js`
- RBAC middleware para controle de acesso

---

## ❓ FAQ

<details>
<summary><strong>🔌 O banco não inicializa / "SQLITE_ERROR"</strong></summary>

O SQLite precisa da pasta `server/data/` para existir. O seed cria automaticamente:

```bash
npm run seed
```

Se persistir, crie manualmente:

```bash
mkdir -p server/data
npm run seed
```

</details>

<details>
<summary><strong>🔐 "Token inválido" ou "Unauthorized" após login</strong></summary>

1. Verifique se `JWT_SECRET` está configurado no `.env`
2. Limpe o localStorage do navegador
3. Faça login novamente
4. Em produção, confirme que `CORS_ORIGIN` bate com o domínio do frontend

</details>

<details>
<summary><strong>📱 WhatsApp não conecta / QR Code não aparece</strong></summary>

A Evolution API precisa estar rodando:

```bash
# Subir apenas a Evolution API
docker compose up evolution-api -d

# Verificar logs
docker logs evolution-api
```

Certifique-se que `EVOLUTION_API_KEY` e `EVOLUTION_API_URL` estão corretos no `.env`.

</details>

<details>
<summary><strong>🔄 HubSpot não sincroniza</strong></summary>

1. Verifique se `HUBSPOT_API_KEY` está configurado (token tipo `pat-na1-...`)
2. O sync automático roda 3x/dia (8h, 12h, 17h) — para forçar:

```bash
curl -X POST http://localhost:3001/api/hubspot/sync \
  -H "Authorization: Bearer SEU_TOKEN"
```

3. Confira os logs do servidor para erros de API

</details>

<details>
<summary><strong>🐳 Build do Docker falha com erro de memória</strong></summary>

O build multi-stage pode exigir mais RAM. Aumente o limite do Docker:

```bash
# Docker Desktop: Settings → Resources → Memory → 4GB+

# OU build com swap no Linux
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
docker compose --profile prod up -d --build
```

</details>

---

## 📝 Licença

Projeto proprietário — **Lucas Uchoa © 2025–2026**

Todos os direitos reservados. Este software é de uso exclusivo da Somapay e seus parceiros autorizados. A reprodução, distribuição ou uso não autorizado é expressamente proibido.

---

<div align="center">

**Feito com ☕ para a Somapay**

[⬆ Voltar ao topo](#-crm-somapay)

</div>
