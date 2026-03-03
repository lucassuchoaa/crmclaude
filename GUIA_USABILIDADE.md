# CRM Somapay — Guia de Usabilidade Completo

> Portal de Parceiros Indicadores

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Acesso e Login](#2-acesso-e-login)
3. [Papéis e Permissões](#3-papéis-e-permissões)
4. [Dashboard](#4-dashboard)
5. [Kanban de Indicações](#5-kanban-de-indicações)
6. [Minhas Indicações (Parceiro)](#6-minhas-indicações-parceiro)
7. [Meu Convênio](#7-meu-convênio)
8. [Gestão de Parceiros](#8-gestão-de-parceiros)
9. [WhatsApp / Conversas](#9-whatsapp--conversas)
10. [Visão Diretoria](#10-visão-diretoria)
11. [Financeiro](#11-financeiro)
12. [Material de Apoio](#12-material-de-apoio)
13. [Notificações](#13-notificações)
14. [Configurações (Admin)](#14-configurações-admin)
15. [Integrações Externas](#15-integrações-externas)
16. [Referência Rápida por Perfil](#16-referência-rápida-por-perfil)

---

## 1. Visão Geral

O **CRM Somapay** é um portal web para gestão de **parceiros indicadores**. Ele cobre o ciclo completo do programa de indicações:

```
Captação → Indicação → Análise → Aprovação → Implantação → Conta Ativa → Comissão → NFe
```

O sistema permite que parceiros indiquem empresas, gerentes acompanhem o pipeline, diretores supervisionem a operação e o financeiro gerencie comissões e notas fiscais.

### Principais capacidades

- Pipeline visual (Kanban) com 7 estágios
- Consulta automática de CNPJ na Receita Federal
- Integração com HubSpot CRM
- Chat com integração WhatsApp (Evolution API)
- Gestão de comissões e NFes
- Sistema de liberação com trava temporal
- Notificações automáticas por cadência
- Comunicação segmentada por perfil
- Gestão de convênios
- Material de apoio por categoria
- Tema claro e escuro
- Layout responsivo (mobile, tablet e desktop)

---

## 2. Acesso e Login

### Tela de Login

1. Acesse o endereço do portal.
2. Insira seu **e-mail** e **senha**.
3. Clique em **Entrar**.

### Escolha de Tema

Após o primeiro login, o sistema apresenta a tela de escolha de aparência:

- **Modo Escuro** — fundo escuro, ideal para ambientes com pouca luz
- **Modo Claro** — fundo claro, ideal para uso diurno

O tema pode ser alterado a qualquer momento pelo botão no rodapé do menu lateral.

### Sessão

- A sessão é mantida automaticamente por até **7 dias**.
- Ao recarregar a página, o sistema restaura a sessão sem pedir login novamente.
- Para encerrar, clique no botão **Sair** no rodapé do menu lateral.

---

## 3. Papéis e Permissões

O sistema possui 6 papéis organizados em hierarquia:

```
Super Admin
  └── Executivo
        └── Diretor
              └── Gerente
                    └── Parceiro

(lateral) Convênio — vinculado a parceiros específicos
```

### O que cada papel pode ver e fazer

| Funcionalidade | Super Admin | Executivo | Diretor | Gerente | Parceiro | Convênio |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Dashboard | Completo | Completo | Sua equipe | Seus parceiros | Próprio | Seu convênio |
| Kanban | Todos | Todos | Sua equipe | Seus parceiros | — | — |
| Criar indicação | — | — | — | — | Sim | — |
| Gestão de parceiros | Todos | Todos | Sua equipe | Seus parceiros | — | — |
| WhatsApp/Chat | Todos | Todos | Todos | Seus parceiros | — | — |
| Visão Diretoria | Todos | Todos | Sua equipe | — | — | — |
| Financeiro | Todos | Todos | Sua equipe | Seus parceiros | Próprio | — |
| Aprovar/Pagar NFe | — | — | Sim | — | — | — |
| Enviar NFe | — | — | — | — | Sim | — |
| Material de Apoio | Sim | Sim | Sim | Sim | Sim | Sim |
| Notificações | Sim | Sim | Sim | Sim | Sim | Sim |
| Configurações | Sim | — | — | — | — | — |
| Enviar comunicados | Sim | Sim | — | — | — | — |

### Regra de visibilidade

Cada usuário vê **apenas os dados da sua hierarquia abaixo**:
- **Super Admin / Executivo**: veem tudo
- **Diretor**: vê seus gerentes e os parceiros desses gerentes
- **Gerente**: vê apenas seus parceiros diretos
- **Parceiro**: vê apenas seus próprios dados
- **Convênio**: vê apenas parceiros e indicações vinculados ao seu convênio

---

## 4. Dashboard

A página inicial do sistema. O conteúdo varia conforme o perfil do usuário.

### Dashboard — Admin / Executivo / Diretor / Gerente

#### KPIs (Cards superiores)

| Card | Descrição |
|------|-----------|
| **Total Indicações** | Quantidade total de indicações no período |
| **Pipeline** | Indicações em andamento (excluindo fechadas e perdidas) |
| **Aprovadas/Ativas** | Indicações que chegaram ao status "Ativo" |
| **Parceiros** | Total de parceiros ativos |
| **Recusadas** | Indicações com status "Recusado" |
| **Travas Vencidas** | Indicações com liberação expirada |
| **Taxa de Conversão** | Percentual de indicações fechadas sobre o total |
| **Gerentes** | Total de gerentes na equipe (visível para diretor+) |

#### Funil do Pipeline

Representação visual dos 7 estágios:

```
Nova Indicação → Em Análise → Documentação → Aprovado → Implantação → Ativo → Recusado
```

Cada barra mostra a contagem de indicações naquele estágio.

#### Filtros disponíveis

- **Gerente**: filtra por gerente específico (diretor+)
- **Parceiro**: filtra por parceiro específico
- **Status**: filtra por estágio do pipeline
- **Liberação**: filtra por status de liberação (Liberado, Bloqueado, Pendente, Vencido)
- **Período**: filtro por data (De / Até)

#### Tabelas e Rankings

- **Indicações Recentes**: últimas indicações com empresa, parceiro, status, liberação, limite e data
- **Atividade Recente**: histórico cronológico de ações (quem fez o quê, quando)
- **Ranking de Parceiros**: ordenado por indicações ativas, com taxa de conversão
- **Performance dos Gerentes**: parceiros sob gestão, indicações, ativas e conversão

### Dashboard — Parceiro

Versão simplificada com:
- Cards: Total de indicações, Indicações ativas, Taxa de conversão
- Tabela de indicações recentes com status
- Comissões recebidas (se houver)

---

## 5. Kanban de Indicações

> Acesso: Super Admin, Executivo, Diretor, Gerente

O Kanban é o coração operacional do sistema. Exibe todas as indicações organizadas em **7 colunas**:

| Coluna | Status no Banco | Descrição |
|--------|----------------|-----------|
| **Nova Indicação** | `novo` | Indicação recém-criada pelo parceiro |
| **Em Análise** | `em_contato` | Equipe comercial entrou em contato |
| **Documentação** | `proposta` | Coleta de documentos/proposta em andamento |
| **Aprovado** | `negociacao` | Aprovado internamente |
| **Implantação** | `negociacao` | Em processo de implantação |
| **Ativo** | `fechado` | Conta ativa — conversão concluída |
| **Recusado** | `perdido` | Indicação perdida ou recusada |

### Modos de visualização

- **Kanban**: colunas com cards arrastáveis (drag-and-drop)
- **Lista**: tabela com todas as indicações em formato de linhas

### Card de indicação

Cada card exibe:
- CNPJ formatado (XX.XXX.XXX/XXXX-XX)
- Razão social da empresa
- Nome do parceiro responsável
- Valor estimado (R$)
- Badge de liberação (se aplicável)
- Data da última atualização
- Alerta se trava expirando (< 7 dias)

### Mover indicação entre estágios

1. **Arrastar o card** de uma coluna para outra.
2. O sistema atualiza o status automaticamente.
3. O parceiro é notificado da mudança (se cadência ativa).
4. O histórico da indicação registra a movimentação.

### Detalhes da indicação (clique no card)

Ao clicar em um card, abre-se o painel de detalhes com:

- **Dados do CNPJ**: razão social, situação cadastral, capital social, CNAE, sócios, endereço
- **Observações**: campo de texto livre para anotar sobre a indicação
- **Histórico**: lista cronológica de todas as movimentações com data, autor e ação
- **Status de liberação**: informação sobre trava e prazo

### Sistema de Liberação / Trava

Quando uma indicação chega ao status **Ativo**, ela recebe uma **trava temporal**:

- **Prazo padrão**: configurável (padrão 90 dias)
- **Gerente**: pode prorrogar em até +60 dias
- **Diretor+**: pode definir qualquer prazo
- **Ao expirar**: a indicação fica com badge vermelho "Expirado" e precisa ser revalidada

Status possíveis:
- 🔓 **Liberado** — dentro do prazo de trava
- 🔒 **Bloqueado** — aguardando liberação
- ⏳ **Pendente** — sem liberação definida
- ⚠️ **Vencido** — prazo de trava expirado

### Filtros do Kanban

- Busca por texto (razão social, CNPJ, nome do parceiro)
- Filtro por gerente
- Filtro por parceiro
- Filtro por status de liberação
- Ordenação: mais recente, mais antigo, por valor

---

## 6. Minhas Indicações (Parceiro)

> Acesso: Parceiro

Página exclusiva do parceiro para gerenciar suas indicações.

### Criar nova indicação

1. Clique em **"+ Nova Indicação"**.
2. Insira o **CNPJ** da empresa.
3. O sistema consulta automaticamente a **Receita Federal** e exibe:
   - Razão social
   - Situação cadastral
   - Capital social
   - CNAE principal
   - Endereço
4. O sistema verifica **duplicatas**:
   - No CRM (se o CNPJ já foi indicado)
   - No HubSpot (se integração ativa)
5. Preencha os campos adicionais: nome fantasia, valor estimado
6. Clique em **Confirmar** para criar a indicação

A indicação é criada com status **"Novo"** e o gerente responsável é notificado.

### Visualização

- Toggle entre **modo lista** e **modo kanban** (simplificado, sem drag-and-drop)
- Filtro por status
- Busca por razão social ou CNPJ
- Cada indicação mostra: CNPJ, razão social, status, valor, data, badge de liberação

---

## 7. Meu Convênio

> Acesso: Convênio

Dashboard exclusivo para usuários com papel "Convênio", mostrando dados dos parceiros vinculados.

### KPIs

- Total de parceiros vinculados
- Total de indicações
- Indicações ativas
- Indicações fechadas
- Taxa de conversão

### Seções

- **Distribuição por status**: gráfico visual por estágio
- **Lista de parceiros**: nome, empresa, CNPJ, telefone, status, indicações
- **Lista de indicações**: todas as indicações dos parceiros do convênio

---

## 8. Gestão de Parceiros

> Acesso: Super Admin, Executivo, Diretor, Gerente

### Lista de parceiros

Tabela com:
- Avatar e nome
- Empresa
- CNPJ e telefone
- Gerente responsável
- Modelo de comissão (badge: "X% cashin" ou "R$X/conta")
- Total de indicações e indicações ativas
- Status (Ativo/Inativo)

**Filtros**: busca por nome/e-mail/empresa, filtro por gerente, filtro por status.

### Criar novo parceiro

Clique em **"+ Novo Parceiro"** e preencha:

| Campo | Obrigatório | Descrição |
|-------|:-----------:|-----------|
| Nome | Sim | Nome completo do parceiro |
| E-mail | Sim | E-mail para login (deve ser único) |
| Senha | Sim | Senha de acesso inicial |
| Gerente | Sim | Gerente responsável (`manager_id`) |
| Empresa | Não | Nome da empresa do parceiro |
| CNPJ | Não | CNPJ do parceiro (auto-consulta Receita Federal) |
| Telefone | Não | Telefone de contato |
| Comissão | Sim | Modelo: % sobre cashin **ou** R$ por conta ativa |
| Convênios | Não | Convênios vinculados (multiselect) |

### Editar parceiro

- Atualiza todos os campos acima.
- Gerentes só podem editar parceiros sob sua gestão.

### Resetar senha

- Botão **"Resetar Senha"** gera nova senha aleatória.
- A senha é exibida em modal para o gestor copiar e enviar ao parceiro.

### Desativar parceiro

- Botão para desativar o parceiro (soft delete).
- O parceiro perde acesso, mas o histórico de indicações é mantido.

---

## 9. WhatsApp / Conversas

> Acesso: Super Admin, Executivo, Diretor, Gerente

Canal de comunicação direta com parceiros, integrado ao WhatsApp.

### Layout

- **Barra lateral esquerda**: lista de parceiros (grupos de conversa)
  - Avatar, nome, empresa
  - Contagem de indicações
  - Badge de mensagens não lidas
  - Indicador de status WhatsApp (verde = conectado, vermelho = desconectado)

- **Área de chat**: histórico de mensagens com o parceiro selecionado

### Conectar WhatsApp (apenas gerentes)

1. Clique em **"Conectar WA"**.
2. Um **QR code** é exibido.
3. Escaneie o QR code com o WhatsApp no celular.
4. O sistema detecta a conexão automaticamente (polling a cada 3 segundos).
5. Após conectar: mensagens do WhatsApp são recebidas no CRM e vice-versa.

Cada gerente possui sua **instância WhatsApp individual**.

### Enviar mensagens

- Se o WhatsApp estiver **conectado**: a mensagem é enviada pelo WhatsApp **e** salva no CRM.
- Se estiver **desconectado**: a mensagem é salva apenas no CRM (uso interno).

### Agente CNPJ no Chat

Botão **"CNPJ"** no cabeçalho do chat:

1. Insira um CNPJ.
2. O sistema consulta a Receita Federal e verifica duplicatas.
3. O resultado aparece como mensagem de bot no chat:
   - Dados da empresa (razão social, situação, capital, sócios)
   - Se duplicado: alerta com status e responsável da indicação existente
   - Se novo: botão **"+ Criar Indicação"** para criar diretamente do chat

### Tipos de mensagens no chat

| Tipo | Descrição |
|------|-----------|
| **Normal** | Texto enviado pelo gerente ou parceiro |
| **Via WhatsApp** | Mensagem recebida/enviada pelo WhatsApp |
| **Bot - CNPJ** | Resultado da consulta de CNPJ |
| **Bot - Duplicata** | Alerta de CNPJ já existente |
| **Bot - Indicação** | Confirmação de indicação criada |

---

## 10. Visão Diretoria

> Acesso: Super Admin, Executivo, Diretor

Painel hierárquico para acompanhar a performance da equipe.

### Para Executivos

Visão agrupada **por diretor**, cada um mostrando seus gerentes.

### Para Diretores

Lista direta dos **seus gerentes**.

### Card de Gerente

**Cabeçalho (sempre visível)**:
- Avatar e nome do gerente
- Quantidade de parceiros sob gestão
- Métricas: Total de indicações, Ativas, Pipeline, Taxa de Conversão
- Barra de progresso colorida:
  - Verde: conversão ≥ 30%
  - Amarelo: conversão ≥ 15%
  - Vermelho: conversão < 15%

**Expandido (clique no card)**:
- Tabela detalhada de cada parceiro do gerente:
  - Nome, empresa, total indicações, ativas, pipeline, taxa de conversão

---

## 11. Financeiro

> Acesso: Super Admin, Executivo, Diretor, Gerente, Parceiro

Gestão de comissões e notas fiscais.

### Visão Admin / Diretor / Gerente

#### KPIs (3 cards)

| Card | Descrição |
|------|-----------|
| **Comissões enviadas** | Valor total de relatórios de comissão emitidos |
| **NFes pendentes** | Valor total de NFes aguardando pagamento |
| **NFes pagas** | Valor total de NFes já pagas |

#### Tab "Relatórios de Comissão"

Tabela com: parceiro, título, período, valor, status, data.

**Enviar relatório de comissão**:
1. Clique em **"Enviar Relatório"**.
2. Selecione o parceiro.
3. Preencha: título, período (ex: "Fev/2026"), valor (R$).
4. Envie. O parceiro é notificado.

#### Tab "NFes Recebidas"

Tabela com: parceiro, número da NFe, valor, data de envio, status, data de pagamento.

**Pagar NFe** (Diretor+):
1. Clique no botão **"Pagar"** na linha da NFe.
2. O status muda para "Pago" com a data registrada.
3. O parceiro é notificado do pagamento.

### Visão Parceiro

#### Tab "Meus Relatórios"

Tabela de relatórios de comissão recebidos do gerente, com valor e status.

#### Tab "Minhas NFes"

**Enviar NFe**:
1. Clique em **"Enviar NFe"**.
2. Preencha: número da NFe, valor (R$).
3. Envie. O gerente é notificado.

Status: **Pendente** (amarelo) ou **Pago** (verde).

### Modelos de Comissão

Cada parceiro possui um modelo individual configurado na criação:

| Modelo | Descrição |
|--------|-----------|
| **% sobre Cashin** | Percentual aplicado sobre o volume total de cashin no mês |
| **R$ por Conta Ativa** | Valor fixo por conta que teve pelo menos 1 cashin no mês |

---

## 12. Material de Apoio

> Acesso: Todos os perfis

Biblioteca de documentos e materiais para os parceiros.

### Categorias

- **Comercial** — materiais de vendas e abordagem
- **Financeiro** — planilhas, relatórios modelo
- **Treinamento** — guias e vídeos de capacitação
- **Suporte** — manuais e FAQ
- **Legal** — contratos e termos

### Funcionalidades

- **Filtro por categoria**: botões de filtro rápido
- **Download**: botão para baixar o arquivo
- **Formatos aceitos**: PDF, XLSX, XLS, DOCX, DOC, MP4, PPTX, PPT, PNG, JPG, JPEG, ZIP (máx. 50MB)

### Gerenciar materiais (Admin)

Na aba **Configurações > Materiais**:
- Adicionar material: título + categoria + upload de arquivo
- Excluir material
- Definir quais perfis podem visualizar cada material

---

## 13. Notificações

> Acesso: Todos os perfis

### Sino de Notificações (cabeçalho)

- Ícone 🔔 com badge de contagem de não lidas
- Clique abre dropdown com as 8 últimas notificações
- Clique em uma notificação: marca como lida e navega para a página relacionada
- Link **"Ver todas"** no rodapé

### Central de Notificações (página)

#### KPIs

| Card | Descrição |
|------|-----------|
| Total | Todas as notificações |
| Não Lidas | Notificações pendentes |
| Lidas | Notificações já visualizadas |
| Comunicados | Comunicados recebidos da gestão |

#### Filtros

- Toggle: **Todas** / **Não Lidas** / **Lidas**
- Dropdown por tipo: Status, Financeiro, Liberação, Comunicado, Sistema

#### Tipos de notificação

| Tipo | Ícone | Quando é gerada |
|------|-------|----------------|
| **Status** | 📋 | Indicação criada ou status atualizado |
| **Financeiro** | 💰 | Comissão enviada, NFe enviada ou paga |
| **Liberação** | 🔓 | Indicação liberada, trava expirando ou expirada |
| **Comunicado** | 📢 | Comunicado enviado pela gestão |
| **Sistema** | ⚙️ | Eventos do sistema |

#### Ações

- **Marcar como lida** — individualmente ou todas de uma vez
- **Excluir** — remove a notificação

### Notificações Automáticas (Cadências)

O sistema dispara notificações automaticamente nos seguintes eventos:

| Evento | Destinatário | Tipo |
|--------|-------------|------|
| Nova indicação criada | Gerente | Status |
| Status da indicação atualizado | Parceiro | Status |
| Relatório de comissão enviado | Parceiro | Financeiro |
| NFe enviada pelo parceiro | Gerente | Financeiro |
| NFe marcada como paga | Parceiro | Financeiro |
| Liberação criada | Parceiro | Liberação |
| Liberação expirando em breve | Gerente | Liberação |
| Liberação expirada | Gerente | Liberação |

---

## 14. Configurações (Admin)

> Acesso: Super Admin

A página de configurações possui 6 abas:

### Aba "Geral"

| Configuração | Descrição | Padrão |
|-------------|-----------|--------|
| **Prazo de Análise** | Dias para análise de indicações | 5 dias |
| **Mín. Funcionários** | Mínimo de funcionários para indicação | 20 |
| **Trava da Oportunidade** | Dias que uma indicação ativa fica "travada" | 90 dias |

### Aba "HubSpot"

Configuração da integração com HubSpot CRM:

1. Insira a **API Key** do HubSpot.
2. Clique em **"Testar Conexão"** para validar.
3. Selecione o **Pipeline** a ser utilizado.
4. Os **estágios** do pipeline são exibidos automaticamente.
5. Clique em **"Salvar"**.

Com a integração ativa:
- Consulta automática de duplicatas ao criar indicações
- Deals do HubSpot exibidos no Dashboard

### Aba "Notificações"

**Canais de notificação**:
- Toggle para ativar/desativar envio por e-mail

**Cadência automática**:
- Tabela com as 8 regras de notificação automática
- Toggle para ativar/desativar cada regra individualmente
- Botão de edição para customizar evento, destinatário e tipo

**Comunicação segmentada**:
- Enviar comunicados para grupos específicos de usuários
- Campos: título, prioridade (Informativo/Urgente/Aviso), mensagem
- Selecionar destinatários por perfil: parceiro, gerente, diretor, executivo
- Contagem dinâmica de usuários que receberão
- Preview da notificação em tempo real

**Histórico de comunicados**:
- Tabela com todos os comunicados enviados

### Aba "Usuários"

Gerenciamento de usuários internos (gerentes, diretores, executivos):

- **Criar**: nome, e-mail, senha, perfil, vínculo hierárquico
  - Gerente deve ter um Diretor responsável
  - Diretor deve ter um Executivo responsável
- **Editar**: nome, perfil, status, vínculo
- **Resetar senha**: gera nova senha aleatória
- **Desativar**: soft delete (mantém histórico)

### Aba "Convênios"

CRUD completo de convênios:

- **Criar convênio**: nome + descrição
- **Editar convênio**: nome, descrição, status (ativo/inativo)
- **Vincular parceiros**: associar parceiros ao convênio
- **Desvincular parceiros**: remover associação
- **Desativar convênio**: soft delete

### Aba "Materiais"

Gerenciamento de materiais de apoio:

- **Adicionar material**: título + categoria + upload de arquivo
- **Excluir material**: remove o material da biblioteca
- Tabela com: tipo (extensão), título, categoria, tamanho, data

---

## 15. Integrações Externas

### Receita Federal (BrasilAPI)

- **Onde aparece**: criação de indicações, cadastro de parceiros, Agente CNPJ no chat
- **O que faz**: ao inserir um CNPJ, consulta automaticamente dados oficiais:
  - Razão social e nome fantasia
  - Situação cadastral
  - Capital social
  - CNAE principal e secundários
  - Quadro de sócios
  - Endereço completo

### HubSpot CRM

- **Configuração**: Admin > Configurações > HubSpot
- **Funcionalidades**:
  - Verificação de duplicatas de CNPJ ao criar indicações
  - Exibição de deals ativos no Dashboard
  - Verificação cruzada no Agente CNPJ do chat

### Evolution API (WhatsApp)

- **Configuração**: cada gerente conecta seu WhatsApp individualmente
- **Funcionalidades**:
  - Envio e recebimento de mensagens pelo CRM
  - Sincronização bidirecional de conversas
  - QR code para autenticação
  - Status em tempo real da conexão

---

## 16. Referência Rápida por Perfil

### Super Admin

Acesso total ao sistema. Responsável por:
- Configurar o sistema (prazos, integrações, cadências)
- Gerenciar todos os usuários e convênios
- Enviar comunicados segmentados
- Adicionar materiais de apoio
- Monitorar todo o pipeline e performance

### Executivo

Visão completa sem configurações:
- Dashboard global com todos os indicadores
- Acompanhar todos os diretores, gerentes e parceiros
- Enviar comunicados
- Aprovar comissões e NFes
- Monitorar a Visão Diretoria

### Diretor

Supervisão da sua equipe:
- Dashboard filtrado pela sua hierarquia
- Kanban de indicações dos seus gerentes
- Visão Diretoria com drill-down por gerente
- Aprovar/pagar NFes
- Gestão de parceiros da sua equipe

### Gerente

Operação direta com parceiros:
- Dashboard dos seus parceiros
- Kanban com drag-and-drop das indicações
- Chat com parceiros (WhatsApp integrado)
- Conectar instância WhatsApp
- Agente CNPJ no chat
- Enviar relatórios de comissão
- Cadastrar e gerenciar parceiros
- Liberar e prorrogar travas de indicações

### Parceiro

Atuação como indicador:
- Criar indicações com consulta automática de CNPJ
- Acompanhar status das indicações (kanban simplificado ou lista)
- Receber relatórios de comissão
- Enviar notas fiscais (NFes)
- Acessar materiais de apoio
- Receber notificações de movimentações

### Convênio

Acompanhamento do programa:
- Dashboard exclusivo com parceiros vinculados
- KPIs de indicações do convênio
- Lista de parceiros com métricas individuais
- Distribuição de indicações por status

---

## Atalhos e Dicas

| Dica | Descrição |
|------|-----------|
| **Sidebar colapsável** | Clique em ◀ para minimizar o menu lateral e ganhar espaço |
| **Tema** | Alterne entre claro e escuro a qualquer momento pelo menu |
| **Filtros** | Use combinações de filtros para encontrar indicações específicas |
| **CNPJ no chat** | Consulte CNPJs diretamente no chat e crie indicações em 1 clique |
| **Arrastar cards** | No Kanban, arraste cards entre colunas para mover indicações |
| **Badge de notificação** | O sino pisca quando há notificações novas |
| **Responsivo** | O sistema funciona em celular, tablet e desktop |

---

*CRM Somapay — Portal de Parceiros v1.0*
