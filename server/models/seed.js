import { getDatabase, initializeDatabase } from '../config/database.js';
import { hashPassword } from '../config/auth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ─── Frontend demo data (mirrored exactly from App.jsx) ─────────────────────

const ALL_USERS = [
  { id: "sa1", email: "admin@somapay.com.br",      pw: "admin123", name: "Super Admin",      role: "super_admin", av: "SA" },
  { id: "e1",  email: "executivo@somapay.com.br",  pw: "exe123",   name: "Ricardo Executivo", role: "executivo",  av: "RE" },
  { id: "d1",  email: "diretoria@somapay.com.br",  pw: "dir123",   name: "Carlos Diretor",    role: "diretor",    av: "CD", managerId: "e1" },
  { id: "d2",  email: "diretoria2@somapay.com.br", pw: "dir123",   name: "Lucia Diretora",    role: "diretor",    av: "LD", managerId: "e1" },
  { id: "g1",  email: "gerente1@somapay.com.br",   pw: "ger123",   name: "Ana Gerente",       role: "gerente",    av: "AG", managerId: "d1" },
  { id: "g2",  email: "gerente2@somapay.com.br",   pw: "ger123",   name: "Bruno Gerente",     role: "gerente",    av: "BG", managerId: "d1" },
  { id: "g3",  email: "gerente3@somapay.com.br",   pw: "ger123",   name: "Carla Gerente",     role: "gerente",    av: "CG", managerId: "d2" },
  { id: "p1",  email: "parceiro1@email.com",       pw: "par123",   name: "João Parceiro",     role: "parceiro",   av: "JP", managerId: "g1", empresa: "JM Consultoria",  tel: "(85) 99999-1111", comTipo: "pct",   comVal: 1.5 },
  { id: "p2",  email: "parceiro2@email.com",       pw: "par123",   name: "Maria Parceira",    role: "parceiro",   av: "MP", managerId: "g1", empresa: "MP Assessoria",   tel: "(85) 99999-2222", comTipo: "valor", comVal: 4.00 },
  { id: "p3",  email: "parceiro3@email.com",       pw: "par123",   name: "Pedro Parceiro",    role: "parceiro",   av: "PP", managerId: "g2", empresa: "PP Negócios",     tel: "(85) 99999-3333", comTipo: "pct",   comVal: 1.2 },
  { id: "p4",  email: "parceiro4@email.com",       pw: "par123",   name: "Rafaela Parceira",  role: "parceiro",   av: "RP", managerId: "g3", empresa: "RF Digital",      tel: "(85) 99999-4444", comTipo: "valor", comVal: 5.00 },
];

// Map frontend kanban statuses → DB-valid statuses
// DB allows: 'novo' | 'em_contato' | 'proposta' | 'negociacao' | 'fechado' | 'perdido'
const STATUS_MAP = {
  nova:     "novo",
  analise:  "em_contato",
  docs:     "proposta",
  aprovado: "negociacao",
  implant:  "negociacao",
  ativo:    "fechado",
  recusado: "perdido",
};

// Indications (INDS0 from App.jsx)
// Extra fields not in DB schema are encoded in notes as JSON.
const INDS0 = [
  {
    id: "i1", emp: "Tech Solutions LTDA", cnpj: "44555666000177",
    razao: "Tech Solutions Ltda", fantasia: "TechSol",
    cont: "Roberto Silva", tel: "(85) 98888-1111", em: "roberto@techsol.com",
    nf: 150, st: "analise", pId: "p1", gId: "g1",
    hsId: "HS-001", hsSt: "open", lib: "liberado", libDt: "2025-01-16", libExp: "2025-04-16",
    dt: "2025-01-15", obs: "Grande potencial",
    capital: "500.000,00", abertura: "2015-03-10",
    cnae: "62.01-5-01 - Desenvolvimento de software",
    endereco: "Rua das Flores, 123 - Aldeota, Fortaleza/CE",
    hist: [
      { dt: "2025-01-15 09:30", autor: "João Parceiro",  txt: "Indicação criada" },
      { dt: "2025-01-16 14:20", autor: "Ana Gerente",    txt: "Oportunidade liberada. Prazo 90 dias." },
    ],
  },
  {
    id: "i2", emp: "Construtora Norte", cnpj: "55666777000188",
    razao: "Construtora Norte S.A.", fantasia: "Norte Construções",
    cont: "Fernanda Lima", tel: "(85) 97777-2222", em: "fernanda@cn.com",
    nf: 300, st: "nova", pId: "p1", gId: "g1",
    hsId: null, hsSt: null, lib: null, libDt: null, libExp: null,
    dt: "2025-02-01", obs: "",
    capital: "2.000.000,00", abertura: "2008-07-22",
    cnae: "41.20-4-00 - Construção de edifícios",
    endereco: "Av. Santos Dumont, 1500 - Centro, Fortaleza/CE",
    hist: [
      { dt: "2025-02-01 10:00", autor: "João Parceiro", txt: "Indicação criada" },
    ],
  },
  {
    id: "i3", emp: "Agro Ceará SA", cnpj: "66777888000199",
    razao: "Agro Ceará S.A.", fantasia: "AgroCE",
    cont: "Marcos Oliveira", tel: "(85) 96666-3333", em: "marcos@agro.com",
    nf: 500, st: "docs", pId: "p2", gId: "g1",
    hsId: "HS-002", hsSt: "open", lib: "liberado", libDt: "2025-01-21", libExp: "2025-04-21",
    dt: "2025-01-20", obs: "Docs pendentes",
    capital: "10.000.000,00", abertura: "2001-11-05",
    cnae: "01.11-3-01 - Cultivo de arroz",
    endereco: "Rod. BR-116, Km 20 - Eusébio/CE",
    hist: [
      { dt: "2025-01-20 11:15", autor: "Maria Parceira", txt: "Indicação criada" },
      { dt: "2025-01-21 09:00", autor: "Ana Gerente",    txt: "Liberado. Aguardando documentação." },
    ],
  },
  {
    id: "i4", emp: "Logística Express", cnpj: "77888999000100",
    razao: "Logística Express Ltda", fantasia: "LogExpress",
    cont: "Carla Souza", tel: "(85) 95555-4444", em: "carla@log.com",
    nf: 80, st: "aprovado", pId: "p3", gId: "g2",
    hsId: "HS-003", hsSt: "won", lib: "liberado", libDt: "2024-12-11", libExp: "2025-03-11",
    dt: "2024-12-10", obs: "Concluído",
    capital: "800.000,00", abertura: "2012-01-15",
    cnae: "49.30-2-02 - Transporte rodoviário de carga",
    endereco: "Rua A, 500 - Distrito Industrial, Maracanaú/CE",
    hist: [
      { dt: "2024-12-10 08:45", autor: "Pedro Parceiro", txt: "Indicação criada" },
      { dt: "2024-12-11 16:30", autor: "Bruno Gerente",  txt: "Aprovado e liberado." },
    ],
  },
  {
    id: "i5", emp: "Escola Futuro", cnpj: "88999000000111",
    razao: "Escola Futuro Ltda", fantasia: "Escola Futuro",
    cont: "Paula Santos", tel: "(85) 94444-5555", em: "paula@ef.com",
    nf: 45, st: "implant", pId: "p3", gId: "g2",
    hsId: "HS-004", hsSt: "open", lib: "liberado", libDt: "2025-01-06", libExp: "2025-04-06",
    dt: "2025-01-05", obs: "Implantando",
    capital: "300.000,00", abertura: "2018-02-28",
    cnae: "85.13-9-00 - Ensino fundamental",
    endereco: "Rua Prof. João Bosco, 88 - Meireles, Fortaleza/CE",
    hist: [
      { dt: "2025-01-05 13:00", autor: "Pedro Parceiro", txt: "Indicação criada" },
      { dt: "2025-01-06 10:20", autor: "Bruno Gerente",  txt: "Em implantação." },
    ],
  },
  {
    id: "i6", emp: "Farmácia Vida", cnpj: "99000111000122",
    razao: "Farmácia Vida Ltda ME", fantasia: "Farmácia Vida",
    cont: "Lucas Mendes", tel: "(85) 93333-6666", em: "lucas@fv.com",
    nf: 25, st: "recusado", pId: "p1", gId: "g1",
    hsId: "HS-005", hsSt: "lost", lib: "bloqueado", libDt: null, libExp: null,
    dt: "2025-01-25", obs: "Abaixo do mínimo de funcionários",
    capital: "50.000,00", abertura: "2020-06-10",
    cnae: "47.71-7-01 - Comércio varejista de produtos farmacêuticos",
    endereco: "Rua Barão de Aracati, 45 - Joaquim Távora, Fortaleza/CE",
    hist: [
      { dt: "2025-01-25 15:00", autor: "João Parceiro", txt: "Indicação criada" },
      { dt: "2025-01-26 11:00", autor: "Ana Gerente",   txt: "Bloqueado — abaixo do mínimo de funcionários." },
    ],
  },
  {
    id: "i7", emp: "Hospital São José", cnpj: "10111222000133",
    razao: "Hospital São José S.A.", fantasia: "HSJ",
    cont: "Dra. Ana Beatriz", tel: "(85) 92222-7777", em: "ana@hsj.com",
    nf: 800, st: "ativo", pId: "p2", gId: "g1",
    hsId: "HS-006", hsSt: "won", lib: "liberado", libDt: "2024-11-16", libExp: "2025-02-16",
    dt: "2024-11-15", obs: "Ativo e satisfeito",
    capital: "25.000.000,00", abertura: "1995-04-01",
    cnae: "86.10-1-01 - Atividades de atendimento hospitalar",
    endereco: "Av. Imperador, 545 - Centro, Fortaleza/CE",
    hist: [
      { dt: "2024-11-15 09:00", autor: "Maria Parceira", txt: "Indicação criada" },
      { dt: "2024-11-16 14:00", autor: "Ana Gerente",    txt: "Liberado para implantação." },
      { dt: "2024-12-20 10:30", autor: "Ana Gerente",    txt: "Cliente ativo. Folha processada com sucesso." },
    ],
  },
  {
    id: "i8", emp: "Padaria Central", cnpj: "11222333000144",
    razao: "Padaria Central Ltda", fantasia: "Padaria Central",
    cont: "Seu José", tel: "(85) 91111-8888", em: "jose@padaria.com",
    nf: 35, st: "nova", pId: "p4", gId: "g3",
    hsId: null, hsSt: null, lib: null, libDt: null, libExp: null,
    dt: "2025-02-10", obs: "",
    capital: "150.000,00", abertura: "2010-05-20",
    cnae: "10.91-1-02 - Fabricação de produtos de padaria",
    endereco: "Rua Major Facundo, 200 - Centro, Fortaleza/CE",
    hist: [
      { dt: "2025-02-10 11:00", autor: "Rafaela Parceira", txt: "Indicação criada" },
    ],
  },
  {
    id: "i9", emp: "Auto Peças Ceará", cnpj: "12333444000155",
    razao: "Auto Peças Ceará S.A.", fantasia: "AutoCE",
    cont: "Marcos Reis", tel: "(85) 90000-9999", em: "marcos@autoce.com",
    nf: 120, st: "analise", pId: "p4", gId: "g3",
    hsId: "HS-007", hsSt: "open", lib: "liberado", libDt: "2025-02-05", libExp: "2025-05-05",
    dt: "2025-02-03", obs: "Grande rede de lojas",
    capital: "3.000.000,00", abertura: "2005-08-15",
    cnae: "45.30-7-03 - Comércio de peças para veículos",
    endereco: "Av. Bezerra de Menezes, 1800 - São Gerardo, Fortaleza/CE",
    hist: [
      { dt: "2025-02-03 09:30", autor: "Rafaela Parceira", txt: "Indicação criada" },
      { dt: "2025-02-05 14:00", autor: "Carla Gerente",    txt: "Liberado. Rede com 3 filiais." },
    ],
  },
];

// Materials (MATS from App.jsx)
const MATS = [
  { id: "m1", t: "Apresentação Comercial 2025",  tipo: "pdf",  cat: "comercial",   sz: "2.4 MB",  dt: "2025-01-10" },
  { id: "m2", t: "Tabela de Comissionamento",    tipo: "xlsx", cat: "financeiro",  sz: "540 KB",  dt: "2025-01-15" },
  { id: "m3", t: "Manual do Parceiro",           tipo: "pdf",  cat: "treinamento", sz: "5.1 MB",  dt: "2024-12-20" },
  { id: "m4", t: "Vídeo - Como Indicar",         tipo: "mp4",  cat: "treinamento", sz: "45 MB",   dt: "2025-01-05" },
  { id: "m5", t: "Modelo de Proposta",           tipo: "docx", cat: "comercial",   sz: "1.2 MB",  dt: "2025-02-01" },
  { id: "m6", t: "FAQ - Perguntas Frequentes",   tipo: "pdf",  cat: "suporte",     sz: "890 KB",  dt: "2025-01-20" },
  { id: "m7", t: "Regulamento do Programa",      tipo: "pdf",  cat: "legal",       sz: "1.8 MB",  dt: "2024-11-10" },
  { id: "m8", t: "Cases de Sucesso 2024",        tipo: "pdf",  cat: "comercial",   sz: "3.2 MB",  dt: "2025-01-30" },
];

// Commissions (COMMS0 from App.jsx)
// Commission records are linked to a parceiro user and a period.
// They do not map 1-to-1 to the DB commissions table (which is per-indication).
// We store them as approved commissions tied to the first matching indication of that parceiro,
// using the amount directly. The indication_id will be the first indication owned by that parceiro.
const COMMS0 = [
  { id: "c1", pId: "p1", titulo: "Comissão Janeiro 2025",   periodo: "Jan/2025", valor: 2450.00,  arq: "comissao_jan25_joao.pdf",  dt: "2025-02-05", by: "g1" },
  { id: "c2", pId: "p2", titulo: "Comissão Janeiro 2025",   periodo: "Jan/2025", valor: 3820.50,  arq: "comissao_jan25_maria.pdf", dt: "2025-02-05", by: "g1" },
  { id: "c3", pId: "p3", titulo: "Comissão Janeiro 2025",   periodo: "Jan/2025", valor: 1200.00,  arq: "comissao_jan25_pedro.pdf", dt: "2025-02-06", by: "g2" },
  { id: "c4", pId: "p1", titulo: "Comissão Dezembro 2024",  periodo: "Dez/2024", valor: 1890.75,  arq: "comissao_dez24_joao.pdf",  dt: "2025-01-05", by: "g1" },
  { id: "c5", pId: "p2", titulo: "Comissão Dezembro 2024",  periodo: "Dez/2024", valor: 4100.00,  arq: "comissao_dez24_maria.pdf", dt: "2025-01-05", by: "g1" },
];

// NFes (NFES0 from App.jsx)
const NFES0 = [
  { id: "nf1", pId: "p1", num: "NFe 001234", valor: 2450.00,  arq: "nfe_001234.pdf", dt: "2025-02-06", st: "pago",    pgDt: "2025-02-15" },
  { id: "nf2", pId: "p2", num: "NFe 005678", valor: 3820.50,  arq: "nfe_005678.pdf", dt: "2025-02-07", st: "pendente", pgDt: null },
  { id: "nf3", pId: "p3", num: "NFe 009012", valor: 1200.00,  arq: "nfe_009012.pdf", dt: "2025-02-08", st: "pendente", pgDt: null },
  { id: "nf4", pId: "p1", num: "NFe 000890", valor: 1890.75,  arq: "nfe_000890.pdf", dt: "2025-01-06", st: "pago",    pgDt: "2025-01-20" },
];

// Notifications (NOTIFS0 from App.jsx)
// DB notifications type: 'info' | 'success' | 'warning' | 'error'
// Frontend tipos: status, financeiro, liberacao, comunicado, sistema  → mapped below
const NOTIF_TYPE_MAP = {
  status:     "info",
  financeiro: "info",
  liberacao:  "success",
  comunicado: "warning",
  sistema:    "info",
};

const NOTIFS0 = [
  { id: "nt1", tipo: "status",     titulo: "Status alterado",         msg: "Indicação Tech Solutions LTDA movida para Em Análise.",               dt: "2025-02-10 14:30", lido: false, para: "p1",  de: "g1",  link: "kanban" },
  { id: "nt2", tipo: "financeiro", titulo: "Relatório de comissão",   msg: "Novo relatório de comissão: Comissão Janeiro 2025 — R$ 2.450,00.",   dt: "2025-02-05 10:15", lido: true,  para: "p1",  de: "g1",  link: "fin" },
  { id: "nt3", tipo: "liberacao",  titulo: "Oportunidade liberada",   msg: "Sua indicação Digital Commerce SA foi liberada. Trava: 90 dias.",    dt: "2025-02-08 09:00", lido: false, para: "p2",  de: "g1",  link: "kanban" },
  { id: "nt4", tipo: "status",     titulo: "Indicação aprovada",      msg: "Indicação MegaPay Serviços foi aprovada e está ativa.",               dt: "2025-02-07 16:45", lido: false, para: "d1",  de: "g2",  link: "kanban" },
  { id: "nt5", tipo: "financeiro", titulo: "NFe recebida",            msg: "Parceiro João Silva enviou NFe 001234 — R$ 2.450,00.",               dt: "2025-02-06 11:20", lido: true,  para: "g1",  de: "p1",  link: "fin" },
  { id: "nt6", tipo: "sistema",    titulo: "Nova indicação",          msg: "Parceiro Maria Santos criou nova indicação: FinTech Brasil LTDA.",   dt: "2025-02-09 08:30", lido: false, para: "g1",  de: "p2",  link: "kanban" },
  { id: "nt7", tipo: "comunicado", titulo: "Novo material disponível",msg: "Apresentação Comercial 2025 foi adicionada à biblioteca de materiais.", dt: "2025-01-10 12:00", lido: true,  para: "*",   de: "sa1", link: "mats" },
  { id: "nt8", tipo: "financeiro", titulo: "NFe paga",                msg: "Sua NFe 000890 foi marcada como paga.",                              dt: "2025-01-20 15:30", lido: true,  para: "p1",  de: "sa1", link: "fin" },
];

// ─── Seed function ───────────────────────────────────────────────────────────

async function seed() {
  console.log('Initializing database...');
  initializeDatabase();

  const db = getDatabase();

  // Check if already seeded
  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (existingUsers.count > 0) {
    console.log('Database already seeded. Skipping...');
    return;
  }

  console.log('Seeding database with frontend demo data...');

  // ── 1. Users ──────────────────────────────────────────────────────────────
  // Include parceiro-specific fields (empresa, tel, com_tipo, com_val)
  for (const u of ALL_USERS) {
    const hashedPassword = await hashPassword(u.pw);

    db.prepare(`
      INSERT INTO users (id, email, password, name, role, avatar, manager_id, empresa, tel, com_tipo, com_val)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      u.id,
      u.email,
      hashedPassword,
      u.name,
      u.role,
      u.av,
      u.managerId || null,
      u.empresa || null,
      u.tel || null,
      u.comTipo || null,
      u.comVal || null
    );

    console.log(`  Created user: ${u.email} (${u.id})`);
  }

  // ── 2. Indications ────────────────────────────────────────────────────────
  // Map frontend kanban statuses to DB-valid status values.
  // Extra kanban metadata (lib, libDt, libExp, hsId, hsSt, nf, capital, etc.)
  // is preserved as JSON inside the notes column.

  for (const ind of INDS0) {
    const dbStatus = STATUS_MAP[ind.st] || 'novo';

    const extraMeta = JSON.stringify({
      kanbSt:  ind.st,
      nf:      ind.nf,
      hsId:    ind.hsId,
      hsSt:    ind.hsSt,
      lib:     ind.lib,
      libDt:   ind.libDt,
      libExp:  ind.libExp,
      capital: ind.capital,
      abertura:ind.abertura,
      cnae:    ind.cnae,
      endereco:ind.endereco,
    });

    db.prepare(`
      INSERT INTO indications
        (id, cnpj, razao_social, nome_fantasia, contato_nome, contato_telefone, contato_email,
         status, owner_id, manager_id, value, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ind.id,
      ind.cnpj,
      ind.razao,
      ind.fantasia,
      ind.cont,
      ind.tel,
      ind.em,
      dbStatus,
      ind.pId,
      ind.gId,
      ind.nf,           // using nf (num funcionários) as value proxy; adjust if needed
      extraMeta,
      ind.dt,
    );

    // History entries
    for (const h of ind.hist) {
      db.prepare(`
        INSERT INTO indication_history (indication_id, user_id, action, new_value, created_at)
        VALUES (?, ?, 'status_change', ?, ?)
      `).run(ind.id, ind.pId, h.txt, h.dt);
    }

    console.log(`  Created indication: ${ind.emp} (${ind.id}) → status=${dbStatus}`);
  }

  // ── 3. Commissions ────────────────────────────────────────────────────────
  // The DB commissions table requires an indication_id.
  // We link each commission to the first indication owned by that parceiro.
  // The 'percentage' column is set to 0 for period-based commissions where only
  // the fixed amount (valor) is known; comTipo/comVal from the user record is stored in notes.

  // Build a map: pId -> first indication id
  const firstIndByParceiro = {};
  for (const ind of INDS0) {
    if (!firstIndByParceiro[ind.pId]) {
      firstIndByParceiro[ind.pId] = ind.id;
    }
  }

  for (const c of COMMS0) {
    const indId = firstIndByParceiro[c.pId] || INDS0[0].id;
    const pUser = ALL_USERS.find(u => u.id === c.pId);

    db.prepare(`
      INSERT INTO commissions (id, indication_id, user_id, amount, percentage, status, payment_date, created_at)
      VALUES (?, ?, ?, ?, ?, 'approved', ?, ?)
    `).run(
      c.id,
      indId,
      c.pId,
      c.valor,
      pUser?.comTipo === 'pct' ? (pUser?.comVal || 0) : 0,
      c.dt,
      c.dt,
    );

    console.log(`  Created commission: ${c.titulo} for ${c.pId} — R$ ${c.valor.toFixed(2)} (${c.id})`);
  }

  // ── 4. NFes ───────────────────────────────────────────────────────────────
  // DB status: 'pending' | 'approved' | 'rejected' | 'paid'
  const NFE_STATUS_MAP = { pago: 'paid', pendente: 'pending' };

  for (const nf of NFES0) {
    const dbNfSt = NFE_STATUS_MAP[nf.st] || 'pending';

    db.prepare(`
      INSERT INTO nfes (id, user_id, number, value, status, file_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nf.id,
      nf.pId,
      nf.num,
      nf.valor,
      dbNfSt,
      nf.arq,
      nf.dt,
      nf.pgDt || nf.dt,
    );

    console.log(`  Created NFe: ${nf.num} for ${nf.pId} — R$ ${nf.valor.toFixed(2)} (${nf.id})`);
  }

  // ── 5. Materials ──────────────────────────────────────────────────────────
  for (const m of MATS) {
    // Determine roles_allowed based on category
    let rolesAllowed = 'all';
    if (m.cat === 'financeiro') rolesAllowed = 'gerente,diretor,executivo,super_admin';
    if (m.cat === 'legal')      rolesAllowed = 'all';

    // Store size in description since there is no size column
    const description = `Arquivo: ${m.t} | Tamanho: ${m.sz}`;

    db.prepare(`
      INSERT INTO materials (id, title, description, category, file_path, file_type, roles_allowed, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      m.id,
      m.t,
      description,
      m.cat,
      m.arq || null,      // no file path in demo data
      m.tipo,
      rolesAllowed,
      'sa1',              // created by super admin
      m.dt,
    );

    console.log(`  Created material: ${m.t} (${m.id})`);
  }

  // ── 6. Notifications ──────────────────────────────────────────────────────
  // DB type: 'info' | 'success' | 'warning' | 'error'
  // Broadcast notifications (para === '*') are fanned out to all users.

  const allUserIds = ALL_USERS.map(u => u.id);

  for (const n of NOTIFS0) {
    const dbType = NOTIF_TYPE_MAP[n.tipo] || 'info';
    const targets = n.para === '*' ? allUserIds : [n.para];

    for (const userId of targets) {
      // Skip if userId doesn't match any real user (e.g. '*' already expanded)
      const notifId = n.para === '*'
        ? `${n.id}_${userId}`
        : n.id;

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, is_read, link, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        notifId,
        userId,
        n.titulo,
        n.msg,
        dbType,
        n.lido ? 1 : 0,
        n.link,
        n.dt,
      );
    }

    const targetDesc = n.para === '*' ? `all users (${allUserIds.length})` : n.para;
    console.log(`  Created notification: "${n.titulo}" → ${targetDesc} (${n.id})`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\nDatabase seeded successfully!');
  console.log('\nDemo credentials:');
  console.log('─'.repeat(70));
  const maxRoleLen = Math.max(...ALL_USERS.map(u => u.role.length));
  const maxEmailLen = Math.max(...ALL_USERS.map(u => u.email.length));
  for (const u of ALL_USERS) {
    const extra = u.empresa ? ` | ${u.empresa}` : '';
    console.log(
      `${u.role.padEnd(maxRoleLen)} | ${u.email.padEnd(maxEmailLen)} | ${u.pw}${extra}`
    );
  }
  console.log('─'.repeat(70));
}

seed().catch(console.error);
