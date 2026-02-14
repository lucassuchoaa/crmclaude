# CRM Somapay — Portal de Parceiros

Sistema CRM completo para gestão de indicações e parceiros da Somapay. Construído com **React** + **Vite**.

---

## ✨ Funcionalidades

| Módulo             | Descrição                                                                 |
|--------------------|---------------------------------------------------------------------------|
| **Dashboard**      | KPIs, funil de pipeline, ranking de parceiros e atividade recente         |
| **Kanban**         | Pipeline visual com drag & drop, filtros e gestão de travas               |
| **Parceiros**      | Cadastro, condições comerciais (% cashin ou R$/conta) e histórico         |
| **Indicações**     | Criação com consulta CNPJ/Receita Federal e verificação HubSpot          |
| **Financeiro**     | Relatórios de comissão, upload de NFes e controle de pagamentos           |
| **Material Apoio** | Biblioteca de documentos categorizados para parceiros                     |
| **Configurações**  | HubSpot, notificações, gestão de usuários e materiais (Super Admin)       |

## 👥 Perfis de Acesso

| Perfil          | Acesso                                                        |
|-----------------|---------------------------------------------------------------|
| **Super Admin** | Acesso total + configurações                                  |
| **Executivo**   | Visão da cadeia de diretores → gerentes → parceiros           |
| **Diretoria**   | Gestão dos gerentes vinculados e seus parceiros               |
| **Gerente**     | Gestão dos parceiros do seu time                              |
| **Parceiro**    | Dashboard pessoal, indicações e financeiro                    |

## 🚀 Como Rodar

### Pré-requisitos
- [Node.js](https://nodejs.org/) v18+
- npm v9+

### Instalação

```bash
# Clone o repositório
git clone <url-do-repo>
cd CRMCLAUD

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento
npm run dev
```

A aplicação estará disponível em **http://localhost:5173**

### Build para Produção

```bash
npm run build
npm run preview
```

## 🔑 Usuários de Demonstração

| Perfil      | E-mail                         | Senha      |
|-------------|--------------------------------|------------|
| Super Admin | `admin@somapay.com.br`         | `admin123` |
| Executivo   | `executivo@somapay.com.br`     | `exe123`   |
| Diretoria   | `diretoria@somapay.com.br`     | `dir123`   |
| Gerente     | `gerente1@somapay.com.br`      | `ger123`   |
| Parceiro    | `parceiro1@email.com`          | `par123`   |

## 🎨 Tema

O sistema possui **modo escuro** e **modo claro**, selecionável após o login e alternável a qualquer momento pelo menu lateral.

## 🛠️ Stack Técnica

- **React 19** — Biblioteca de UI
- **Vite 7** — Bundler e servidor de desenvolvimento
- **CSS-in-JS** — Estilos inline com sistema de temas
- **Google Fonts** — DM Sans + Space Mono

## 📁 Estrutura do Projeto

```
CRMCLAUD/
├── public/
│   └── vite.svg
├── src/
│   ├── App.jsx          # Aplicação completa (componentes + dados mock)
│   ├── main.jsx         # Entry point React
│   └── index.css        # Reset CSS global
├── index.html           # Template HTML
├── package.json
├── vite.config.js
└── README.md
```

## 📝 Licença

Projeto proprietário — Somapay © 2025
