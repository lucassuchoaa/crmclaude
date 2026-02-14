import { useState, createContext, useContext } from "react";

const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

const ALL_USERS = [
  { id: "sa1", email: "admin@somapay.com.br", pw: "admin123", name: "Super Admin", role: "super_admin", av: "SA" },
  { id: "e1", email: "executivo@somapay.com.br", pw: "exe123", name: "Ricardo Executivo", role: "executivo", av: "RE" },
  { id: "d1", email: "diretoria@somapay.com.br", pw: "dir123", name: "Carlos Diretor", role: "diretor", av: "CD", eId: "e1" },
  { id: "d2", email: "diretoria2@somapay.com.br", pw: "dir123", name: "Lucia Diretora", role: "diretor", av: "LD", eId: "e1" },
  { id: "g1", email: "gerente1@somapay.com.br", pw: "ger123", name: "Ana Gerente", role: "gerente", av: "AG", dId: "d1" },
  { id: "g2", email: "gerente2@somapay.com.br", pw: "ger123", name: "Bruno Gerente", role: "gerente", av: "BG", dId: "d1" },
  { id: "g3", email: "gerente3@somapay.com.br", pw: "ger123", name: "Carla Gerente", role: "gerente", av: "CG", dId: "d2" },
  { id: "p1", email: "parceiro1@email.com", pw: "par123", name: "João Parceiro", role: "parceiro", gId: "g1", empresa: "JM Consultoria", tel: "(85) 99999-1111", comTipo: "pct", comVal: 1.5 },
  { id: "p2", email: "parceiro2@email.com", pw: "par123", name: "Maria Parceira", role: "parceiro", gId: "g1", empresa: "MP Assessoria", tel: "(85) 99999-2222", comTipo: "valor", comVal: 4.00 },
  { id: "p3", email: "parceiro3@email.com", pw: "par123", name: "Pedro Parceiro", role: "parceiro", gId: "g2", empresa: "PP Negócios", tel: "(85) 99999-3333", comTipo: "pct", comVal: 1.2 },
  { id: "p4", email: "parceiro4@email.com", pw: "par123", name: "Rafaela Parceira", role: "parceiro", gId: "g3", empresa: "RF Digital", tel: "(85) 99999-4444", comTipo: "valor", comVal: 5.00 },
];

const KCOLS = [
  { id: "nova", label: "Nova Indicação", co: "#6366f1" },
  { id: "analise", label: "Em Análise", co: "#f59e0b" },
  { id: "docs", label: "Documentação", co: "#3b82f6" },
  { id: "aprovado", label: "Aprovado", co: "#10b981" },
  { id: "implant", label: "Implantação", co: "#8b5cf6" },
  { id: "ativo", label: "Ativo", co: "#059669" },
  { id: "recusado", label: "Recusado", co: "#ef4444" },
];

const INDS0 = [
  { id: "i1", emp: "Tech Solutions LTDA", cnpj: "44.555.666/0001-77", cont: "Roberto Silva", tel: "(85) 98888-1111", em: "roberto@techsol.com", nf: 150, st: "analise", pId: "p1", gId: "g1", hsId: "HS-001", hsSt: "open", lib: "liberado", libDt: "2025-01-16", libExp: "2025-04-16", dt: "2025-01-15", obs: "Grande potencial", razao: "Tech Solutions Ltda", fantasia: "TechSol", capital: "500.000,00", abertura: "2015-03-10", cnae: "62.01-5-01 - Desenvolvimento de software", endereco: "Rua das Flores, 123 - Aldeota, Fortaleza/CE", hist: [{ dt: "2025-01-15 09:30", autor: "João Parceiro", txt: "Indicação criada" }, { dt: "2025-01-16 14:20", autor: "Ana Gerente", txt: "Oportunidade liberada. Prazo 90 dias." }] },
  { id: "i2", emp: "Construtora Norte", cnpj: "55.666.777/0001-88", cont: "Fernanda Lima", tel: "(85) 97777-2222", em: "fernanda@cn.com", nf: 300, st: "nova", pId: "p1", gId: "g1", hsId: null, hsSt: null, lib: null, libDt: null, libExp: null, dt: "2025-02-01", obs: "", razao: "Construtora Norte S.A.", fantasia: "Norte Construções", capital: "2.000.000,00", abertura: "2008-07-22", cnae: "41.20-4-00 - Construção de edifícios", endereco: "Av. Santos Dumont, 1500 - Centro, Fortaleza/CE", hist: [{ dt: "2025-02-01 10:00", autor: "João Parceiro", txt: "Indicação criada" }] },
  { id: "i3", emp: "Agro Ceará SA", cnpj: "66.777.888/0001-99", cont: "Marcos Oliveira", tel: "(85) 96666-3333", em: "marcos@agro.com", nf: 500, st: "docs", pId: "p2", gId: "g1", hsId: "HS-002", hsSt: "open", lib: "liberado", libDt: "2025-01-21", libExp: "2025-04-21", dt: "2025-01-20", obs: "Docs pendentes", razao: "Agro Ceará S.A.", fantasia: "AgroCE", capital: "10.000.000,00", abertura: "2001-11-05", cnae: "01.11-3-01 - Cultivo de arroz", endereco: "Rod. BR-116, Km 20 - Eusébio/CE", hist: [{ dt: "2025-01-20 11:15", autor: "Maria Parceira", txt: "Indicação criada" }, { dt: "2025-01-21 09:00", autor: "Ana Gerente", txt: "Liberado. Aguardando documentação." }] },
  { id: "i4", emp: "Logística Express", cnpj: "77.888.999/0001-00", cont: "Carla Souza", tel: "(85) 95555-4444", em: "carla@log.com", nf: 80, st: "aprovado", pId: "p3", gId: "g2", hsId: "HS-003", hsSt: "won", lib: "liberado", libDt: "2024-12-11", libExp: "2025-03-11", dt: "2024-12-10", obs: "Concluído", razao: "Logística Express Ltda", fantasia: "LogExpress", capital: "800.000,00", abertura: "2012-01-15", cnae: "49.30-2-02 - Transporte rodoviário de carga", endereco: "Rua A, 500 - Distrito Industrial, Maracanaú/CE", hist: [{ dt: "2024-12-10 08:45", autor: "Pedro Parceiro", txt: "Indicação criada" }, { dt: "2024-12-11 16:30", autor: "Bruno Gerente", txt: "Aprovado e liberado." }] },
  { id: "i5", emp: "Escola Futuro", cnpj: "88.999.000/0001-11", cont: "Paula Santos", tel: "(85) 94444-5555", em: "paula@ef.com", nf: 45, st: "implant", pId: "p3", gId: "g2", hsId: "HS-004", hsSt: "open", lib: "liberado", libDt: "2025-01-06", libExp: "2025-04-06", dt: "2025-01-05", obs: "Implantando", razao: "Escola Futuro Ltda", fantasia: "Escola Futuro", capital: "300.000,00", abertura: "2018-02-28", cnae: "85.13-9-00 - Ensino fundamental", endereco: "Rua Prof. João Bosco, 88 - Meireles, Fortaleza/CE", hist: [{ dt: "2025-01-05 13:00", autor: "Pedro Parceiro", txt: "Indicação criada" }, { dt: "2025-01-06 10:20", autor: "Bruno Gerente", txt: "Em implantação." }] },
  { id: "i6", emp: "Farmácia Vida", cnpj: "99.000.111/0001-22", cont: "Lucas Mendes", tel: "(85) 93333-6666", em: "lucas@fv.com", nf: 25, st: "recusado", pId: "p1", gId: "g1", hsId: "HS-005", hsSt: "lost", lib: "bloqueado", libDt: null, libExp: null, dt: "2025-01-25", obs: "Abaixo do mínimo de funcionários", razao: "Farmácia Vida Ltda ME", fantasia: "Farmácia Vida", capital: "50.000,00", abertura: "2020-06-10", cnae: "47.71-7-01 - Comércio varejista de produtos farmacêuticos", endereco: "Rua Barão de Aracati, 45 - Joaquim Távora, Fortaleza/CE", hist: [{ dt: "2025-01-25 15:00", autor: "João Parceiro", txt: "Indicação criada" }, { dt: "2025-01-26 11:00", autor: "Ana Gerente", txt: "Bloqueado — abaixo do mínimo de funcionários." }] },
  { id: "i7", emp: "Hospital São José", cnpj: "10.111.222/0001-33", cont: "Dra. Ana Beatriz", tel: "(85) 92222-7777", em: "ana@hsj.com", nf: 800, st: "ativo", pId: "p2", gId: "g1", hsId: "HS-006", hsSt: "won", lib: "liberado", libDt: "2024-11-16", libExp: "2025-02-16", dt: "2024-11-15", obs: "Ativo e satisfeito", razao: "Hospital São José S.A.", fantasia: "HSJ", capital: "25.000.000,00", abertura: "1995-04-01", cnae: "86.10-1-01 - Atividades de atendimento hospitalar", endereco: "Av. Imperador, 545 - Centro, Fortaleza/CE", hist: [{ dt: "2024-11-15 09:00", autor: "Maria Parceira", txt: "Indicação criada" }, { dt: "2024-11-16 14:00", autor: "Ana Gerente", txt: "Liberado para implantação." }, { dt: "2024-12-20 10:30", autor: "Ana Gerente", txt: "Cliente ativo. Folha processada com sucesso." }] },
  { id: "i8", emp: "Padaria Central", cnpj: "11.222.333/0001-44", cont: "Seu José", tel: "(85) 91111-8888", em: "jose@padaria.com", nf: 35, st: "nova", pId: "p4", gId: "g3", hsId: null, hsSt: null, lib: null, libDt: null, libExp: null, dt: "2025-02-10", obs: "", razao: "Padaria Central Ltda", fantasia: "Padaria Central", capital: "150.000,00", abertura: "2010-05-20", cnae: "10.91-1-02 - Fabricação de produtos de padaria", endereco: "Rua Major Facundo, 200 - Centro, Fortaleza/CE", hist: [{ dt: "2025-02-10 11:00", autor: "Rafaela Parceira", txt: "Indicação criada" }] },
  { id: "i9", emp: "Auto Peças Ceará", cnpj: "12.333.444/0001-55", cont: "Marcos Reis", tel: "(85) 90000-9999", em: "marcos@autoce.com", nf: 120, st: "analise", pId: "p4", gId: "g3", hsId: "HS-007", hsSt: "open", lib: "liberado", libDt: "2025-02-05", libExp: "2025-05-05", dt: "2025-02-03", obs: "Grande rede de lojas", razao: "Auto Peças Ceará S.A.", fantasia: "AutoCE", capital: "3.000.000,00", abertura: "2005-08-15", cnae: "45.30-7-03 - Comércio de peças para veículos", endereco: "Av. Bezerra de Menezes, 1800 - São Gerardo, Fortaleza/CE", hist: [{ dt: "2025-02-03 09:30", autor: "Rafaela Parceira", txt: "Indicação criada" }, { dt: "2025-02-05 14:00", autor: "Carla Gerente", txt: "Liberado. Rede com 3 filiais." }] },
];

const MATS = [
  { id: "m1", t: "Apresentação Comercial 2025", tipo: "pdf", cat: "comercial", sz: "2.4 MB", dt: "2025-01-10" },
  { id: "m2", t: "Tabela de Comissionamento", tipo: "xlsx", cat: "financeiro", sz: "540 KB", dt: "2025-01-15" },
  { id: "m3", t: "Manual do Parceiro", tipo: "pdf", cat: "treinamento", sz: "5.1 MB", dt: "2024-12-20" },
  { id: "m4", t: "Vídeo - Como Indicar", tipo: "mp4", cat: "treinamento", sz: "45 MB", dt: "2025-01-05" },
  { id: "m5", t: "Modelo de Proposta", tipo: "docx", cat: "comercial", sz: "1.2 MB", dt: "2025-02-01" },
  { id: "m6", t: "FAQ - Perguntas Frequentes", tipo: "pdf", cat: "suporte", sz: "890 KB", dt: "2025-01-20" },
  { id: "m7", t: "Regulamento do Programa", tipo: "pdf", cat: "legal", sz: "1.8 MB", dt: "2024-11-10" },
  { id: "m8", t: "Cases de Sucesso 2024", tipo: "pdf", cat: "comercial", sz: "3.2 MB", dt: "2025-01-30" },
];

const COMMS0 = [
  { id: "c1", pId: "p1", titulo: "Comissão Janeiro 2025", periodo: "Jan/2025", valor: 2450.00, arq: "comissao_jan25_joao.pdf", dt: "2025-02-05", by: "g1" },
  { id: "c2", pId: "p2", titulo: "Comissão Janeiro 2025", periodo: "Jan/2025", valor: 3820.50, arq: "comissao_jan25_maria.pdf", dt: "2025-02-05", by: "g1" },
  { id: "c3", pId: "p3", titulo: "Comissão Janeiro 2025", periodo: "Jan/2025", valor: 1200.00, arq: "comissao_jan25_pedro.pdf", dt: "2025-02-06", by: "g2" },
  { id: "c4", pId: "p1", titulo: "Comissão Dezembro 2024", periodo: "Dez/2024", valor: 1890.75, arq: "comissao_dez24_joao.pdf", dt: "2025-01-05", by: "g1" },
  { id: "c5", pId: "p2", titulo: "Comissão Dezembro 2024", periodo: "Dez/2024", valor: 4100.00, arq: "comissao_dez24_maria.pdf", dt: "2025-01-05", by: "g1" },
];

const NFES0 = [
  { id: "nf1", pId: "p1", num: "NFe 001234", valor: 2450.00, arq: "nfe_001234.pdf", dt: "2025-02-06", st: "pago", pgDt: "2025-02-15" },
  { id: "nf2", pId: "p2", num: "NFe 005678", valor: 3820.50, arq: "nfe_005678.pdf", dt: "2025-02-07", st: "pendente", pgDt: null },
  { id: "nf3", pId: "p3", num: "NFe 009012", valor: 1200.00, arq: "nfe_009012.pdf", dt: "2025-02-08", st: "pendente", pgDt: null },
  { id: "nf4", pId: "p1", num: "NFe 000890", valor: 1890.75, arq: "nfe_000890.pdf", dt: "2025-01-06", st: "pago", pgDt: "2025-01-20" },
];

const NOTIF_TYPES = {
  status: { emoji: "📋", label: "Status", color: "#6366f1" },
  financeiro: { emoji: "💰", label: "Financeiro", color: "#f59e0b" },
  liberacao: { emoji: "🔓", label: "Liberação", color: "#10b981" },
  comunicado: { emoji: "📢", label: "Comunicado", color: "#f97316" },
  sistema: { emoji: "⚙️", label: "Sistema", color: "#3b82f6" },
};

const NOTIFS0 = [
  { id: "nt1", tipo: "status", titulo: "Status alterado", msg: "Indicação Tech Solutions LTDA movida para Em Análise.", dt: "2025-02-10 14:30", lido: false, para: "p1", de: "g1", link: "kanban" },
  { id: "nt2", tipo: "financeiro", titulo: "Relatório de comissão", msg: "Novo relatório de comissão: Comissão Janeiro 2025 — R$ 2.450,00.", dt: "2025-02-05 10:15", lido: true, para: "p1", de: "g1", link: "fin" },
  { id: "nt3", tipo: "liberacao", titulo: "Oportunidade liberada", msg: "Sua indicação Digital Commerce SA foi liberada. Trava: 90 dias.", dt: "2025-02-08 09:00", lido: false, para: "p2", de: "g1", link: "kanban" },
  { id: "nt4", tipo: "status", titulo: "Indicação aprovada", msg: "Indicação MegaPay Serviços foi aprovada e está ativa.", dt: "2025-02-07 16:45", lido: false, para: "d1", de: "g2", link: "kanban" },
  { id: "nt5", tipo: "financeiro", titulo: "NFe recebida", msg: "Parceiro João Silva enviou NFe 001234 — R$ 2.450,00.", dt: "2025-02-06 11:20", lido: true, para: "g1", de: "p1", link: "fin" },
  { id: "nt6", tipo: "sistema", titulo: "Nova indicação", msg: "Parceiro Maria Santos criou nova indicação: FinTech Brasil LTDA.", dt: "2025-02-09 08:30", lido: false, para: "g1", de: "p2", link: "kanban" },
  { id: "nt7", tipo: "comunicado", titulo: "Novo material disponível", msg: "Apresentação Comercial 2025 foi adicionada à biblioteca de materiais.", dt: "2025-01-10 12:00", lido: true, para: "*", de: "sa1", link: "mats" },
  { id: "nt8", tipo: "financeiro", titulo: "NFe paga", msg: "Sua NFe 000890 foi marcada como paga.", dt: "2025-01-20 15:30", lido: true, para: "p1", de: "sa1", link: "fin" },
];

function addNotif(setNotifs, { tipo, titulo, msg, para, de, link }) {
  const n = { id: "nt" + Date.now() + Math.random().toString(36).slice(2, 5), tipo, titulo, msg, dt: new Date().toISOString().replace("T", " ").slice(0, 16), lido: false, para, de, link: link || "notifs" };
  setNotifs(prev => [n, ...prev]);
}
// Notify multiple targets
function addNotifMulti(setNotifs, targets, data) {
  targets.forEach(para => addNotif(setNotifs, { ...data, para }));
}

const THEMES = {
  dark: {
    bg: "#0a0e1a", bg2: "#111827", card: "#1a2235", inp: "#0d1321",
    bor: "#1e2d4a", ac: "#f97316", txt: "#f1f5f9", t2: "#94a3b8", tm: "#64748b",
    ok: "#10b981", wn: "#f59e0b", er: "#ef4444", inf: "#3b82f6",
  },
  light: {
    bg: "#f1f5f9", bg2: "#ffffff", card: "#ffffff", inp: "#f8fafc",
    bor: "#e2e8f0", ac: "#f97316", txt: "#1e293b", t2: "#475569", tm: "#94a3b8",
    ok: "#10b981", wn: "#f59e0b", er: "#ef4444", inf: "#3b82f6",
  }
};
let T = THEMES.dark;
function setTheme(mode) { T = THEMES[mode] || THEMES.dark; }

const fonts = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');`;

function Badge({ children, type = "info" }) {
  const cl = { success: T.ok, warning: T.wn, danger: T.er, info: T.inf, accent: T.ac, muted: T.tm };
  const co = cl[type] || cl.info;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: co + "22", color: co, textTransform: "uppercase", letterSpacing: 0.3 }}>{children}</span>;
}

function Btn({ children, v = "primary", onClick, disabled, full, sm, style: sx }) {
  const base = { display: "inline-flex", alignItems: "center", gap: 8, padding: sm ? "6px 12px" : "10px 20px", border: "none", borderRadius: 6, fontFamily: "'DM Sans',sans-serif", fontSize: sm ? 12 : 14, fontWeight: 600, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap", width: full ? "100%" : "auto", justifyContent: full ? "center" : undefined, transition: "all 0.2s" };
  const vs = {
    primary: { background: T.ac, color: "#fff" },
    secondary: { background: "transparent", color: T.t2, border: `1px solid ${T.bor}` },
    ghost: { background: "transparent", color: T.t2, padding: "6px 8px" },
    danger: { background: T.er + "22", color: T.er, border: `1px solid ${T.er}44` },
    success: { background: T.ok + "22", color: T.ok, border: `1px solid ${T.ok}44` },
  };
  return <button style={{ ...base, ...vs[v], ...sx }} onClick={disabled ? undefined : onClick}>{children}</button>;
}

function Modal({ open, onClose, title, children, footer, wide }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 12, width: wide ? 700 : 520, maxWidth: "92vw", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: `1px solid ${T.bor}` }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.t2, cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
        {footer && <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 24px", borderTop: `1px solid ${T.bor}` }}>{footer}</div>}
      </div>
    </div>
  );
}

function Inp({ label, value, onChange, type = "text", placeholder, style: sx }) {
  return (
    <div style={{ marginBottom: 14, ...sx }}>
      {label && <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
    </div>
  );
}

// ===== LOGIN =====
function Login({ onLogin }) {
  const [em, setEm] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const go = () => {
    const u = ALL_USERS.find(x => x.email === em && x.pw === pw);
    if (u) onLogin(u);
    else setErr("E-mail ou senha inválidos");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, fontFamily: "'DM Sans',sans-serif", color: T.txt }}>
      <style>{fonts}</style>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${T.ac}14 0%, transparent 60%)` }} />
      <div style={{ position: "relative", background: T.card, border: `1px solid ${T.bor}`, borderRadius: 16, padding: "44px 36px", width: 400, maxWidth: "90vw", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ position: "absolute", top: -1, left: "20%", right: "20%", height: 2, background: `linear-gradient(90deg, transparent, ${T.ac}, transparent)` }} />
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ fontFamily: "'Space Mono',monospace", fontSize: 26, fontWeight: 700, color: T.ac }}>SOMAPAY</h1>
          <p style={{ fontSize: 12, color: T.tm, marginTop: 4, letterSpacing: 2, textTransform: "uppercase" }}>Portal de Parceiros</p>
        </div>
        <Inp label="E-mail" value={em} onChange={v => { setEm(v); setErr(""); }} placeholder="seu@email.com" />
        <Inp label="Senha" value={pw} onChange={v => { setPw(v); setErr(""); }} type="password" placeholder="••••••••" />
        {err && <p style={{ color: T.er, fontSize: 13, textAlign: "center", margin: "8px 0" }}>{err}</p>}
        <Btn v="primary" full onClick={go} style={{ marginTop: 12, padding: 14 }}>Entrar</Btn>
        <div style={{ marginTop: 20, padding: 14, background: T.inp, borderRadius: 6, fontSize: 11, color: T.tm, lineHeight: 1.9 }}>
          <strong style={{ color: T.t2 }}>Usuários Demo:</strong><br />
          🔑 admin@somapay.com.br / admin123<br />
          🏛️ executivo@somapay.com.br / exe123<br />
          📊 diretoria@somapay.com.br / dir123<br />
          👤 gerente1@somapay.com.br / ger123<br />
          🤝 parceiro1@email.com / par123
        </div>
      </div>
    </div>
  );
}

// ===== HELPERS =====
function LibBadge({ lib }) {
  if (lib === "liberado") return <Badge type="success">🔓 Liberado</Badge>;
  if (lib === "bloqueado") return <Badge type="danger">🔒 Bloqueado</Badge>;
  return <Badge type="warning">⏳ Pendente</Badge>;
}
function ComBadge({ tipo, val }) {
  if (!tipo || val == null) return <span style={{ color: "#64748b", fontSize: 11 }}>—</span>;
  return tipo === "pct"
    ? <Badge type="accent">{val}% sobre cashin</Badge>
    : <Badge type="info">R$ {parseFloat(val).toFixed(2)} por conta</Badge>;
}
function comLabel(tipo, val) {
  if (!tipo || val == null) return "—";
  return tipo === "pct" ? `${val}% cashin` : `R$ ${parseFloat(val).toFixed(2)}/conta`;
}

// ===== DASHBOARD =====
function Dash({ inds, users, comms, nfes }) {
  const { user } = useAuth();
  const isParceiro = user.role === "parceiro";
  const isExec = user.role === "executivo";
  const isDiretor = user.role === "diretor" || user.role === "super_admin" || isExec;
  const isGerente = user.role === "gerente";

  // Chain filtering: executivo sees only their directors' chains
  const myDiretores = isExec ? users.filter(u => u.role === "diretor" && u.eId === user.id) : user.role === "super_admin" ? users.filter(u => u.role === "diretor") : [];
  const myDiretorIds = isExec ? myDiretores.map(d => d.id) : [];
  const chainGerenteIds = isExec ? users.filter(u => u.role === "gerente" && myDiretorIds.includes(u.dId)).map(g => g.id) : [];

  const baseInds = isGerente ? inds.filter(i => i.gId === user.id)
    : isParceiro ? inds.filter(i => i.pId === user.id)
      : user.role === "diretor" ? inds.filter(i => { const g = users.find(u => u.id === i.gId); return g && g.dId === user.id; })
        : isExec ? inds.filter(i => chainGerenteIds.includes(i.gId))
          : inds;
  const today = new Date().toISOString().split("T")[0];

  // Filters
  const [fSt, setFSt] = useState("todos");
  const [fDtDe, setFDtDe] = useState("");
  const [fDtAte, setFDtAte] = useState("");
  const [fPar, setFPar] = useState("todos");
  const [fLib, setFLib] = useState("todos");
  const [fGer, setFGer] = useState("todos");
  const [fDir, setFDir] = useState("todos");

  const myParceiros = isGerente ? users.filter(u => u.role === "parceiro" && u.gId === user.id)
    : user.role === "diretor" ? users.filter(u => u.role === "parceiro" && users.find(g => g.id === u.gId && g.dId === user.id))
      : isExec ? users.filter(u => u.role === "parceiro" && chainGerenteIds.includes(u.gId))
        : users.filter(u => u.role === "parceiro");
  const myGerentes = isGerente ? []
    : user.role === "diretor" ? users.filter(u => u.role === "gerente" && u.dId === user.id)
      : isExec ? users.filter(u => u.role === "gerente" && myDiretorIds.includes(u.dId))
        : users.filter(u => u.role === "gerente");

  const filtered = baseInds.filter(i => {
    if (fSt !== "todos" && i.st !== fSt) return false;
    if (fDtDe && i.dt < fDtDe) return false;
    if (fDtAte && i.dt > fDtAte) return false;
    if (fPar !== "todos" && i.pId !== fPar) return false;
    if (fLib === "liberado" && i.lib !== "liberado") return false;
    if (fLib === "bloqueado" && i.lib !== "bloqueado") return false;
    if (fLib === "pendente" && i.lib !== null) return false;
    if (fLib === "vencido" && !(i.lib === "liberado" && i.libExp && i.libExp < today)) return false;
    if (fGer !== "todos" && i.gId !== fGer) return false;
    if (fDir !== "todos") {
      const g = users.find(u => u.id === i.gId);
      if (!g || g.dId !== fDir) return false;
    }
    return true;
  });
  const hasFilters = fSt !== "todos" || fDtDe || fDtAte || fPar !== "todos" || fLib !== "todos" || fGer !== "todos" || fDir !== "todos";
  const clearFilters = () => { setFSt("todos"); setFDtDe(""); setFDtAte(""); setFPar("todos"); setFLib("todos"); setFGer("todos"); setFDir("todos"); };

  // Stats (always from baseInds for KPIs, filtered for tables)
  const total = baseInds.length;
  const pipeline = baseInds.filter(i => ["nova", "analise", "docs"].includes(i.st)).length;
  const aprovadas = baseInds.filter(i => ["aprovado", "implant", "ativo"].includes(i.st)).length;
  const ativas = baseInds.filter(i => i.st === "ativo").length;
  const recusadas = baseInds.filter(i => i.st === "recusado").length;
  const travasVencidas = baseInds.filter(i => i.lib === "liberado" && i.libExp && i.libExp < today).length;
  const txConversao = total > 0 ? ((ativas / total) * 100).toFixed(1) : "0.0";
  const parcCount = myParceiros.length;

  // Funnel data
  const funnelData = KCOLS.map(col => ({ ...col, count: baseInds.filter(i => i.st === col.id).length }));
  const maxFunnel = Math.max(...funnelData.map(f => f.count), 1);

  // Ranking parceiros
  const parcRanking = myParceiros.map(p => {
    const pi = baseInds.filter(i => i.pId === p.id);
    return { ...p, total: pi.length, ativas: pi.filter(i => i.st === "ativo").length, pipeline: pi.filter(i => ["nova", "analise", "docs"].includes(i.st)).length, recusadas: pi.filter(i => i.st === "recusado").length, tx: pi.length > 0 ? ((pi.filter(i => i.st === "ativo").length / pi.length) * 100).toFixed(0) : "0" };
  }).sort((a, b) => b.ativas - a.ativas);

  // Performance por gerente (só diretor)
  const gerRanking = isDiretor ? myGerentes.map(g => {
    const gi = baseInds.filter(i => i.gId === g.id);
    const gp = users.filter(u => u.role === "parceiro" && u.gId === g.id);
    return { ...g, total: gi.length, ativas: gi.filter(i => i.st === "ativo").length, parceiros: gp.length, tx: gi.length > 0 ? ((gi.filter(i => i.st === "ativo").length / gi.length) * 100).toFixed(0) : "0" };
  }).sort((a, b) => b.ativas - a.ativas) : [];

  // Director ranking for executivo
  const dirRanking = isExec ? myDiretores.map(d => {
    const dGerentes = users.filter(u => u.role === "gerente" && u.dId === d.id);
    const dGerenteIds = dGerentes.map(g => g.id);
    const di = inds.filter(i => dGerenteIds.includes(i.gId));
    const dp = users.filter(u => u.role === "parceiro" && dGerenteIds.includes(u.gId));
    return { ...d, gerentes: dGerentes.length, parceiros: dp.length, total: di.length, ativas: di.filter(i => i.st === "ativo").length, tx: di.length > 0 ? ((di.filter(i => i.st === "ativo").length / di.length) * 100).toFixed(0) : "0" };
  }).sort((a, b) => b.ativas - a.ativas) : [];

  // Travas vencidas list
  const travasVencidasList = baseInds.filter(i => i.lib === "liberado" && i.libExp && i.libExp < today).sort((a, b) => a.libExp.localeCompare(b.libExp));

  // Últimas interações (all hist entries from all inds)
  const allHist = baseInds.flatMap(i => (i.hist || []).map(h => ({ ...h, emp: i.emp, indId: i.id }))).sort((a, b) => b.dt.localeCompare(a.dt)).slice(0, 10);

  const sorted = [...filtered].sort((a, b) => b.dt.localeCompare(a.dt));

  const thS = { textAlign: "left", padding: "10px 14px", fontSize: 10, fontWeight: 600, color: T.tm, textTransform: "uppercase", borderBottom: `1px solid ${T.bor}`, background: T.bg2 };
  const tdS = { padding: "10px 14px", borderBottom: `1px solid ${T.bor}` };
  const selS = { padding: "7px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 12, outline: "none" };

  // ======= PARCEIRO DASHBOARD =======
  if (isParceiro) {
    const all = inds.filter(i => i.pId === user.id);
    const me = users.find(u => u.id === user.id);
    const myGerente = users.find(u => u.id === me?.gId);

    // Filters
    const my = all.filter(i => {
      if (fSt !== "todos" && i.st !== fSt) return false;
      if (fLib !== "todos") {
        if (fLib === "liberado" && i.lib !== "liberado") return false;
        if (fLib === "bloqueado" && i.lib !== "bloqueado") return false;
        if (fLib === "pendente" && i.lib !== null) return false;
        if (fLib === "vencido" && !(i.lib === "liberado" && i.libExp && i.libExp < today)) return false;
      }
      if (fDtDe && i.dt < fDtDe) return false;
      if (fDtAte && i.dt > fDtAte) return false;
      return true;
    });
    const pHasFilters = fSt !== "todos" || fDtDe || fDtAte || fLib !== "todos";

    // Stats
    const pTotal = all.length;
    const pPipeline = all.filter(i => ["nova", "analise", "docs"].includes(i.st)).length;
    const pAprov = all.filter(i => ["aprovado", "implant", "ativo"].includes(i.st)).length;
    const pAtivas = all.filter(i => i.st === "ativo").length;
    const pRecusadas = all.filter(i => i.st === "recusado").length;
    const pLiberadas = all.filter(i => i.lib === "liberado").length;
    const pVencidas = all.filter(i => i.lib === "liberado" && i.libExp && i.libExp < today).length;
    const pTx = pTotal > 0 ? ((pAtivas / pTotal) * 100).toFixed(1) : "0.0";

    // Funnel
    const pFunnel = KCOLS.map(col => ({ ...col, count: all.filter(i => i.st === col.id).length }));
    const pMaxFunnel = Math.max(...pFunnel.map(f => f.count), 1);

    // Financial
    const myComms = (comms || []).filter(c => c.pId === user.id);
    const myNfes = (nfes || []).filter(n => n.pId === user.id);
    const totalComm = myComms.reduce((s, c) => s + c.valor, 0);
    const lastComm = myComms.length > 0 ? [...myComms].sort((a, b) => b.dt.localeCompare(a.dt))[0] : null;
    const nfesPendentes = myNfes.filter(n => n.st === "pendente").length;

    // Recent history
    const pHist = all.flatMap(i => (i.hist || []).map(h => ({ ...h, emp: i.emp }))).sort((a, b) => b.dt.localeCompare(a.dt)).slice(0, 8);

    // Sorted for table
    const pSorted = [...my].sort((a, b) => b.dt.localeCompare(a.dt));

    // View state for detail
    const [pSel, setPSel] = useState(null);

    return (
      <div>
        {/* Welcome + Gerente Info */}
        <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "stretch" }}>
          <div style={{ flex: 1, background: `linear-gradient(135deg, ${T.ac}22 0%, ${T.ac}08 100%)`, border: `1px solid ${T.ac}30`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, color: T.ac, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Bem-vindo de volta</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{user.name}</div>
            <div style={{ fontSize: 12, color: T.t2 }}>{me?.empresa || "Parceiro"}</div>
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <div style={{ padding: "6px 12px", background: T.card, borderRadius: 6, border: `1px solid ${T.bor}`, fontSize: 11 }}>
                <span style={{ color: T.tm }}>Gerente: </span><span style={{ fontWeight: 600 }}>{myGerente?.name || "—"}</span>
              </div>
              <div style={{ padding: "6px 12px", background: T.card, borderRadius: 6, border: `1px solid ${T.bor}`, fontSize: 11 }}>
                <span style={{ color: T.tm }}>Conversão: </span><span style={{ fontWeight: 700, color: parseFloat(pTx) >= 20 ? T.ok : T.wn }}>{pTx}%</span>
              </div>
            </div>
          </div>
          {/* My Commercial Condition */}
          <div style={{ width: 300, background: T.card, border: `1px solid ${T.bor}`, borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, fontWeight: 600 }}>💰 Minha Condição Comercial</div>
            <div style={{ flex: 1, background: T.inp, borderRadius: 8, padding: 16, textAlign: "center", border: `1px solid ${me?.comTipo === "pct" ? T.ac : T.inf}25` }}>
              <div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", marginBottom: 4 }}>{me?.comTipo === "pct" ? "% sobre Cashin" : "Valor por Conta Ativa"}</div>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: me?.comTipo === "pct" ? T.ac : T.inf }}>{me?.comTipo === "pct" ? `${me.comVal}%` : me?.comVal != null ? `R$ ${me.comVal.toFixed(2)}` : "—"}</div>
            </div>
          </div>
        </div>

        {/* KPIs Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
          {[
            { l: "Total", v: pTotal, co: T.ac, ic: "📋" },
            { l: "Pipeline", v: pPipeline, co: T.inf, ic: "🔄" },
            { l: "Aprovadas", v: pAprov, co: T.ok, ic: "✅" },
            { l: "Ativas", v: pAtivas, co: T.wn, ic: "🏢" },
          ].map((s, i) => (
            <div key={i} style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 14, borderLeft: `3px solid ${s.co}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{s.l}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Space Mono',monospace" }}>{s.v}</div>
                </div>
                <div style={{ fontSize: 20 }}>{s.ic}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { l: "Recusadas", v: pRecusadas, co: T.er, ic: "❌" },
            { l: "Liberadas", v: pLiberadas, co: T.ok, ic: "🔓" },
            { l: "Vencidas", v: pVencidas, co: pVencidas > 0 ? T.er : T.ok, ic: pVencidas > 0 ? "⚠️" : "✓" },
            { l: "Comissão Acum.", v: fmtBRL(totalComm), co: T.ac, ic: "💰" },
          ].map((s, i) => (
            <div key={i} style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 14, borderLeft: `3px solid ${s.co}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{s.l}</div>
                  <div style={{ fontSize: s.l === "Comissão Acum." ? 16 : 22, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: s.co }}>{s.v}</div>
                </div>
                <div style={{ fontSize: 20 }}>{s.ic}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Funnel + Financial Side by Side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {/* Mini Funnel */}
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📊 Meu Funil</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pFunnel.map(f => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 90, fontSize: 10, fontWeight: 600, color: T.t2, flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: f.co, flexShrink: 0 }} />{f.label}
                  </div>
                  <div style={{ flex: 1, height: 18, background: T.inp, borderRadius: 3, overflow: "hidden", position: "relative" }}>
                    <div style={{ width: `${(f.count / pMaxFunnel) * 100}%`, height: "100%", background: f.co + "55", borderRadius: 3, minWidth: f.count > 0 ? 6 : 0 }} />
                    <span style={{ position: "absolute", right: 6, top: 2, fontSize: 10, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: T.txt }}>{f.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Financial Summary */}
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>💵 Resumo Financeiro</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: T.inp, borderRadius: 8, border: `1px solid ${T.bor}` }}>
                <div><div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", marginBottom: 2 }}>Comissão Total</div><div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: T.ok }}>{fmtBRL(totalComm)}</div></div>
                <div style={{ fontSize: 10, color: T.tm, textAlign: "right" }}>{myComms.length} relatório(s)</div>
              </div>
              {lastComm && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: T.inp, borderRadius: 8, border: `1px solid ${T.bor}` }}>
                  <div><div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", marginBottom: 2 }}>Última Comissão</div><div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: T.ac }}>{fmtBRL(lastComm.valor)}</div></div>
                  <div style={{ textAlign: "right" }}><div style={{ fontSize: 10, color: T.tm }}>{lastComm.periodo}</div><div style={{ fontSize: 10, color: T.tm }}>{lastComm.dt}</div></div>
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1, padding: "10px 12px", background: T.inp, borderRadius: 8, border: `1px solid ${T.bor}`, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", marginBottom: 2 }}>NFes Enviadas</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Space Mono',monospace" }}>{myNfes.length}</div>
                </div>
                <div style={{ flex: 1, padding: "10px 12px", background: nfesPendentes > 0 ? T.wn + "0D" : T.inp, borderRadius: 8, border: `1px solid ${nfesPendentes > 0 ? T.wn + "30" : T.bor}`, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", marginBottom: 2 }}>Pgto Pendente</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: nfesPendentes > 0 ? T.wn : T.ok }}>{nfesPendentes}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Vencidas Alert */}
        {pVencidas > 0 && (
          <div style={{ background: T.er + "0A", border: `1px solid ${T.er}30`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>⚠️</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.er }}>Oportunidades com Trava Vencida</span>
              <Badge type="danger">{pVencidas}</Badge>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {all.filter(i => i.lib === "liberado" && i.libExp && i.libExp < today).map(ind => (
                <div key={ind.id} onClick={() => setPSel(ind)} style={{ background: T.card, border: `1px solid ${T.er}33`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", flex: "1 1 200px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{ind.emp}</div>
                  <div style={{ fontSize: 10, color: T.er, fontWeight: 600 }}>Vencida em {ind.libExp}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap", padding: "10px 14px", background: T.card, border: `1px solid ${T.bor}`, borderRadius: 8 }}>
          <span style={{ fontSize: 11, color: T.tm, fontWeight: 600 }}>🔍</span>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Status:</span>
            <select value={fSt} onChange={e => setFSt(e.target.value)} style={selS}><option value="todos">Todos</option>{KCOLS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Liberação:</span>
            <select value={fLib} onChange={e => setFLib(e.target.value)} style={selS}><option value="todos">Todos</option><option value="liberado">🔓 Liberado</option><option value="bloqueado">🔒 Bloqueado</option><option value="pendente">⏳ Pendente</option><option value="vencido">⚠️ Vencido</option></select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>De:</span><input type="date" value={fDtDe} onChange={e => setFDtDe(e.target.value)} style={selS} /></div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Até:</span><input type="date" value={fDtAte} onChange={e => setFDtAte(e.target.value)} style={selS} /></div>
          {pHasFilters && <>
            <button onClick={() => { setFSt("todos"); setFDtDe(""); setFDtAte(""); setFLib("todos"); }} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.er}44`, background: T.er + "11", color: T.er, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>✕ Limpar</button>
            <span style={{ fontSize: 11, color: T.t2 }}>{my.length} de {all.length}</span>
          </>}
        </div>

        {/* Table + Activity */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
          {/* Indicações */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📋 Minhas Indicações{pHasFilters ? " (Filtradas)" : ""}</h3>
            <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Empresa", "Status", "Liberação", "Limite", "Data"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
                <tbody>{pSorted.map(ind => (
                  <tr key={ind.id} onClick={() => setPSel(ind)} style={{ cursor: "pointer" }}>
                    <td style={{ ...tdS, fontSize: 13, fontWeight: 600 }}>{ind.emp}<div style={{ fontSize: 10, color: T.tm }}>{ind.cnpj}</div></td>
                    <td style={tdS}><Badge type={ind.st === "ativo" ? "success" : ind.st === "recusado" ? "danger" : "info"}>{KCOLS.find(k => k.id === ind.st)?.label}</Badge></td>
                    <td style={tdS}><LibBadge lib={ind.lib} /></td>
                    <td style={tdS}>{ind.lib === "liberado" && ind.libExp ? <span style={{ fontSize: 10, fontWeight: 600, color: ind.libExp < today ? T.er : T.ok }}>{ind.libExp < today ? "⚠ " : ""}{ind.libExp}</span> : <span style={{ color: T.tm, fontSize: 10 }}>—</span>}</td>
                    <td style={{ ...tdS, fontSize: 11, color: T.tm }}>{ind.dt}</td>
                  </tr>
                ))}</tbody>
                {my.length === 0 && <tbody><tr><td colSpan={5} style={{ padding: 30, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhuma indicação{pHasFilters ? " com esses filtros" : ""}.</td></tr></tbody>}
              </table>
            </div>
          </div>
          {/* Activity Feed */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🕐 Atividade Recente</h3>
            <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 4, maxHeight: 400, overflowY: "auto" }}>
              {pHist.length === 0 && <div style={{ padding: 30, textAlign: "center", fontSize: 12, color: T.tm }}>Sem atividades.</div>}
              {pHist.map((h, i) => (
                <div key={i} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.bor}22` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.ac }}>{h.emp}</span>
                    <span style={{ fontSize: 9, color: T.tm, fontFamily: "'Space Mono',monospace" }}>{h.dt}</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.t2 }}>{h.txt}</div>
                  <div style={{ fontSize: 9, color: T.tm }}>por {h.autor}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detail Modal (read-only) */}
        <Modal open={!!pSel} onClose={() => setPSel(null)} title="Detalhes da Indicação" wide>
          {pSel && <div>
            {[["Empresa", pSel.emp, true], ["CNPJ", pSel.cnpj], ["Contato", pSel.cont], ["Telefone", pSel.tel], ["E-mail", pSel.em], ["Funcionários", pSel.nf], ["Data", pSel.dt]].map(([l, v, b], i) => (
              <div key={i} style={{ display: "flex", padding: "8px 0", borderBottom: `1px solid ${T.bor}33` }}>
                <div style={{ width: 130, fontSize: 11, color: T.tm, textTransform: "uppercase", flexShrink: 0 }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: b ? 700 : 400 }}>{v || "—"}</div>
              </div>
            ))}
            <div style={{ display: "flex", padding: "8px 0", borderBottom: `1px solid ${T.bor}33` }}>
              <div style={{ width: 130, fontSize: 11, color: T.tm, textTransform: "uppercase" }}>Status</div>
              <Badge type={pSel.st === "ativo" ? "success" : pSel.st === "recusado" ? "danger" : "info"}>{KCOLS.find(k => k.id === pSel.st)?.label}</Badge>
            </div>
            <div style={{ display: "flex", padding: "8px 0", borderBottom: `1px solid ${T.bor}33` }}>
              <div style={{ width: 130, fontSize: 11, color: T.tm, textTransform: "uppercase" }}>Liberação</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <LibBadge lib={pSel.lib} />
                {pSel.lib === "liberado" && pSel.libDt && <span style={{ fontSize: 11, color: T.t2 }}>desde {pSel.libDt}</span>}
                {pSel.lib === "liberado" && pSel.libExp && (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: pSel.libExp < today ? T.er + "1A" : T.ok + "1A", color: pSel.libExp < today ? T.er : T.ok }}>
                    {pSel.libExp < today ? "⚠ Vencido " : "Limite: "}{pSel.libExp}
                  </span>
                )}
              </div>
            </div>
            {pSel.obs && <div style={{ marginTop: 10, padding: 10, background: T.inp, borderRadius: 6, fontSize: 12, color: T.t2 }}><span style={{ fontSize: 10, fontWeight: 600, color: T.tm, textTransform: "uppercase" }}>Obs: </span>{pSel.obs}</div>}
            {(pSel.hist || []).length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.t2, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>📜 Histórico</div>
                <div style={{ maxHeight: 180, overflowY: "auto", borderRadius: 8, border: `1px solid ${T.bor}` }}>
                  {[...(pSel.hist || [])].reverse().map((h, i) => (
                    <div key={i} style={{ padding: "8px 14px", borderBottom: `1px solid ${T.bor}22`, fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, color: T.ac, fontSize: 11 }}>{h.autor}</span>
                        <span style={{ fontSize: 9, color: T.tm, fontFamily: "'Space Mono',monospace" }}>{h.dt}</span>
                      </div>
                      <div style={{ color: T.t2, fontSize: 11 }}>{h.txt}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>}
        </Modal>
      </div>
    );
  }

  // ======= GERENTE / DIRETOR DASHBOARD =======
  return (
    <div>
      {/* ROW 1: KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        {[
          { l: "Total Indicações", v: total, co: T.ac, ic: "📋" },
          { l: "Pipeline", v: pipeline, co: T.inf, ic: "🔄" },
          { l: "Aprovadas/Ativas", v: `${aprovadas}/${ativas}`, co: T.ok, ic: "✅" },
          { l: "Parceiros", v: parcCount, co: T.wn, ic: "👥" },
        ].map((s, i) => (
          <div key={i} style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 16, borderLeft: `3px solid ${s.co}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{s.l}</div>
                <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Space Mono',monospace" }}>{s.v}</div>
              </div>
              <div style={{ fontSize: 24 }}>{s.ic}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { l: "Recusadas", v: recusadas, co: T.er, ic: "❌" },
          { l: "Travas Vencidas", v: travasVencidas, co: travasVencidas > 0 ? T.er : T.ok, ic: travasVencidas > 0 ? "⚠️" : "🔒" },
          { l: "Taxa Conversão", v: txConversao + "%", co: parseFloat(txConversao) >= 20 ? T.ok : T.wn, ic: "📈" },
          { l: isExec ? "Diretores" : isDiretor ? "Gerentes" : "Liberadas", v: isExec ? myDiretores.length : isDiretor ? myGerentes.length : baseInds.filter(i => i.lib === "liberado").length, co: T.ac, ic: isExec ? "🏛️" : isDiretor ? "👔" : "🔓" },
        ].map((s, i) => (
          <div key={i} style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 16, borderLeft: `3px solid ${s.co}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{s.l}</div>
                <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: s.co }}>{s.v}</div>
              </div>
              <div style={{ fontSize: 24 }}>{s.ic}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ROW 2: Funil Visual */}
      <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 18, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>📊 Funil do Pipeline</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {funnelData.map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 120, fontSize: 11, fontWeight: 600, color: T.t2, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: f.co, flexShrink: 0 }} />{f.label}
              </div>
              <div style={{ flex: 1, height: 22, background: T.inp, borderRadius: 4, overflow: "hidden", position: "relative" }}>
                <div style={{ width: `${(f.count / maxFunnel) * 100}%`, height: "100%", background: f.co + "44", borderRadius: 4, transition: "width 0.3s", minWidth: f.count > 0 ? 8 : 0 }} />
                <span style={{ position: "absolute", right: 8, top: 3, fontSize: 11, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: T.txt }}>{f.count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ROW 3: Filters */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap", padding: "10px 14px", background: T.card, border: `1px solid ${T.bor}`, borderRadius: 8 }}>
        <span style={{ fontSize: 11, color: T.tm, fontWeight: 600 }}>🔍 Filtros:</span>
        {isExec && <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Diretor:</span>
          <select value={fDir} onChange={e => setFDir(e.target.value)} style={selS}><option value="todos">Todos</option>{myDiretores.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </div>}
        {isDiretor && <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Gerente:</span>
          <select value={fGer} onChange={e => setFGer(e.target.value)} style={selS}><option value="todos">Todos</option>{myGerentes.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        </div>}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Parceiro:</span>
          <select value={fPar} onChange={e => setFPar(e.target.value)} style={selS}><option value="todos">Todos</option>{myParceiros.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Status:</span>
          <select value={fSt} onChange={e => setFSt(e.target.value)} style={selS}><option value="todos">Todos</option>{KCOLS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Liberação:</span>
          <select value={fLib} onChange={e => setFLib(e.target.value)} style={selS}><option value="todos">Todos</option><option value="liberado">🔓 Liberado</option><option value="bloqueado">🔒 Bloqueado</option><option value="pendente">⏳ Pendente</option><option value="vencido">⚠️ Vencido</option></select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>De:</span>
          <input type="date" value={fDtDe} onChange={e => setFDtDe(e.target.value)} style={selS} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Até:</span>
          <input type="date" value={fDtAte} onChange={e => setFDtAte(e.target.value)} style={selS} />
        </div>
        {hasFilters && <>
          <button onClick={clearFilters} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.er}44`, background: T.er + "11", color: T.er, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>✕ Limpar</button>
          <span style={{ fontSize: 11, color: T.t2 }}>{filtered.length} de {baseInds.length}</span>
        </>}
      </div>

      {/* ROW 4: Travas Vencidas Alert + Recent Activity */}
      {travasVencidas > 0 && (
        <div style={{ background: T.er + "0A", border: `1px solid ${T.er}30`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: T.er }}>Travas Vencidas — Ação Necessária</h3>
            <Badge type="danger">{travasVencidas}</Badge>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {travasVencidasList.slice(0, 6).map(ind => (
              <div key={ind.id} style={{ background: T.card, border: `1px solid ${T.er}33`, borderRadius: 8, padding: "10px 14px", minWidth: 200, flex: "1 1 200px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{ind.emp}</div>
                <div style={{ fontSize: 10, color: T.tm }}>{users.find(u => u.id === ind.pId)?.name} · {KCOLS.find(k => k.id === ind.st)?.label}</div>
                <div style={{ fontSize: 10, color: T.er, fontWeight: 600, marginTop: 4 }}>Vencida em {ind.libExp}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ROW 5: 3-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Indicações filtradas */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>📋 Indicações {hasFilters ? "(Filtradas)" : "Recentes"}</h3>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Empresa", "Parceiro", "Status", "Liberação", "Limite", "Data"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>{sorted.slice(0, 10).map(ind => (
                <tr key={ind.id}>
                  <td style={{ ...tdS, fontSize: 13, fontWeight: 600 }}>{ind.emp}</td>
                  <td style={{ ...tdS, fontSize: 11 }}>{users.find(u => u.id === ind.pId)?.name || "—"}</td>
                  <td style={tdS}><Badge type={ind.st === "ativo" ? "success" : ind.st === "recusado" ? "danger" : "info"}>{KCOLS.find(k => k.id === ind.st)?.label}</Badge></td>
                  <td style={tdS}><LibBadge lib={ind.lib} /></td>
                  <td style={tdS}>{ind.lib === "liberado" && ind.libExp ? <span style={{ fontSize: 10, fontWeight: 600, color: ind.libExp < today ? T.er : T.ok }}>{ind.libExp < today ? "⚠ " : ""}{ind.libExp}</span> : <span style={{ color: T.tm, fontSize: 10 }}>—</span>}</td>
                  <td style={{ ...tdS, fontSize: 11, color: T.tm }}>{ind.dt}</td>
                </tr>
              ))}</tbody>
              {sorted.length === 0 && <tbody><tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhuma indicação{hasFilters ? " com esses filtros" : ""}.</td></tr></tbody>}
            </table>
            {sorted.length > 10 && <div style={{ padding: "8px 14px", textAlign: "center", fontSize: 11, color: T.tm, borderTop: `1px solid ${T.bor}` }}>Mostrando 10 de {sorted.length} — veja todas no Kanban</div>}
          </div>
        </div>

        {/* Feed de Atividade */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🕐 Atividade Recente</h3>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 4, maxHeight: 440, overflowY: "auto" }}>
            {allHist.length === 0 && <div style={{ padding: 30, textAlign: "center", fontSize: 12, color: T.tm }}>Sem atividades.</div>}
            {allHist.map((h, i) => (
              <div key={i} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.bor}22` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.ac }}>{h.emp}</span>
                  <span style={{ fontSize: 9, color: T.tm, fontFamily: "'Space Mono',monospace" }}>{h.dt}</span>
                </div>
                <div style={{ fontSize: 11, color: T.t2, marginBottom: 1 }}>{h.txt}</div>
                <div style={{ fontSize: 9, color: T.tm }}>por {h.autor}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ROW 6: Director Ranking (Exec only) */}
      {isExec && dirRanking.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🏛️ Performance dos Diretores</h3>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Diretor", "Gerentes", "Parceiros", "Indicações", "Ativas", "Conversão"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>{dirRanking.map(d => (
                <tr key={d.id}>
                  <td style={tdS}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: T.wn + "22", color: T.wn, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{d.av || d.name[0]}</div>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</span>
                    </div>
                  </td>
                  <td style={{ ...tdS, fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{d.gerentes}</td>
                  <td style={{ ...tdS, fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{d.parceiros}</td>
                  <td style={{ ...tdS, fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{d.total}</td>
                  <td style={tdS}><Badge type="success">{d.ativas}</Badge></td>
                  <td style={tdS}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 50, height: 6, background: T.inp, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${d.tx}%`, height: "100%", background: parseInt(d.tx) >= 30 ? T.ok : parseInt(d.tx) >= 15 ? T.wn : T.er, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "'Space Mono',monospace", color: parseInt(d.tx) >= 30 ? T.ok : parseInt(d.tx) >= 15 ? T.wn : T.er }}>{d.tx}%</span>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ROW 7: Ranking + Gerentes/Deals */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Ranking Parceiros */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🏆 Ranking de Parceiros</h3>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["#", "Parceiro", "Total", "Ativas", "Pipeline", "Conversão"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>{parcRanking.map((p, i) => (
                <tr key={p.id}>
                  <td style={{ ...tdS, fontWeight: 700, color: i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : i === 2 ? "#cd7f32" : T.tm, fontSize: 14 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`}</td>
                  <td style={tdS}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: "50%", background: T.ac + "22", color: T.ac, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{p.av || p.name[0]}</div>
                      <div><div style={{ fontSize: 12, fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: 9, color: T.tm }}>{p.empresa || ""}</div></div>
                    </div>
                  </td>
                  <td style={{ ...tdS, fontFamily: "'Space Mono',monospace", fontSize: 13, fontWeight: 700 }}>{p.total}</td>
                  <td style={tdS}><Badge type="success">{p.ativas}</Badge></td>
                  <td style={tdS}><Badge type="info">{p.pipeline}</Badge></td>
                  <td style={tdS}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 50, height: 6, background: T.inp, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${p.tx}%`, height: "100%", background: parseInt(p.tx) >= 30 ? T.ok : parseInt(p.tx) >= 15 ? T.wn : T.er, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "'Space Mono',monospace", color: parseInt(p.tx) >= 30 ? T.ok : parseInt(p.tx) >= 15 ? T.wn : T.er }}>{p.tx}%</span>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
              {parcRanking.length === 0 && <tbody><tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: T.tm, fontSize: 12 }}>Nenhum parceiro.</td></tr></tbody>}
            </table>
          </div>
        </div>

        {/* Gerentes Performance (Diretor) or HubSpot Deals (Gerente) */}
        {isDiretor ? (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>👔 Performance dos Gerentes</h3>
            <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Gerente", "Parceiros", "Indicações", "Ativas", "Conversão"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
                <tbody>{gerRanking.map(g => (
                  <tr key={g.id}>
                    <td style={tdS}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: T.wn + "22", color: T.wn, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{g.av || g.name[0]}</div>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{g.name}</span>
                      </div>
                    </td>
                    <td style={{ ...tdS, fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{g.parceiros}</td>
                    <td style={{ ...tdS, fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{g.total}</td>
                    <td style={tdS}><Badge type="success">{g.ativas}</Badge></td>
                    <td style={tdS}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 50, height: 6, background: T.inp, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${g.tx}%`, height: "100%", background: parseInt(g.tx) >= 30 ? T.ok : parseInt(g.tx) >= 15 ? T.wn : T.er, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "'Space Mono',monospace", color: parseInt(g.tx) >= 30 ? T.ok : parseInt(g.tx) >= 15 ? T.wn : T.er }}>{g.tx}%</span>
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        ) : (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🔗 HubSpot Deals</h3>
            <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Empresa", "Deal", "Parceiro", "Status"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
                <tbody>{baseInds.filter(i => i.hsId).slice(0, 8).map(ind => (
                  <tr key={ind.id}>
                    <td style={{ ...tdS, fontSize: 12, fontWeight: 600 }}>{ind.emp}</td>
                    <td style={{ ...tdS, fontSize: 10, fontFamily: "'Space Mono',monospace", color: T.tm }}>{ind.hsId}</td>
                    <td style={{ ...tdS, fontSize: 11 }}>{users.find(u => u.id === ind.pId)?.name || "—"}</td>
                    <td style={tdS}><Badge type={ind.hsSt === "won" ? "success" : ind.hsSt === "lost" ? "danger" : "warning"}>{ind.hsSt === "won" ? "Ganho" : ind.hsSt === "lost" ? "Perdido" : "Aberto"}</Badge></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== KANBAN =====
function KanbanPage({ inds, setInds, users, travaDias, notifs, setNotifs }) {
  const { user } = useAuth();
  const [sel, setSel] = useState(null);
  const [view, setView] = useState("kanban");
  const canMove = user.role !== "parceiro";
  const canEdit = ["gerente", "diretor", "executivo", "super_admin"].includes(user.role);
  const isDiretor = user.role === "diretor" || user.role === "super_admin" || user.role === "executivo";
  const isGerente = user.role === "gerente";

  // Chain filtering
  const myDiretorIds = user.role === "executivo" ? users.filter(u => u.role === "diretor" && u.eId === user.id).map(d => d.id) : [];
  const chainGerenteIds = user.role === "executivo" ? users.filter(u => u.role === "gerente" && myDiretorIds.includes(u.dId)).map(g => g.id) : [];
  const base = user.role === "gerente" ? inds.filter(i => i.gId === user.id)
    : user.role === "parceiro" ? inds.filter(i => i.pId === user.id)
      : user.role === "diretor" ? inds.filter(i => { const g = users.find(u => u.id === i.gId); return g && g.dId === user.id; })
        : user.role === "executivo" ? inds.filter(i => chainGerenteIds.includes(i.gId))
          : inds;

  // Filters (gerente/admin)
  const [fPar, setFPar] = useState("todos");
  const [fDtDe, setFDtDe] = useState("");
  const [fDtAte, setFDtAte] = useState("");
  const [fLib, setFLib] = useState("todos"); // todos, liberado, bloqueado, pendente, vencido

  const today = new Date().toISOString().split("T")[0];
  const fl = base.filter(i => {
    if (fPar !== "todos" && i.pId !== fPar) return false;
    if (fDtDe && i.dt < fDtDe) return false;
    if (fDtAte && i.dt > fDtAte) return false;
    if (fLib === "liberado" && i.lib !== "liberado") return false;
    if (fLib === "bloqueado" && i.lib !== "bloqueado") return false;
    if (fLib === "pendente" && i.lib !== null) return false;
    if (fLib === "vencido" && !(i.lib === "liberado" && i.libExp && i.libExp < today)) return false;
    return true;
  });

  const hasFilters = fPar !== "todos" || fDtDe || fDtAte || fLib !== "todos";
  const clearFilters = () => { setFPar("todos"); setFDtDe(""); setFDtAte(""); setFLib("todos"); };

  // Parceiros deste gerente/cadeia
  const myParceiros = isGerente ? users.filter(u => u.role === "parceiro" && u.gId === user.id)
    : user.role === "diretor" ? users.filter(u => u.role === "parceiro" && users.find(g => g.id === u.gId && g.dId === user.id))
      : user.role === "executivo" ? users.filter(u => u.role === "parceiro" && chainGerenteIds.includes(u.gId))
        : users.filter(u => u.role === "parceiro");

  const now = () => { const d = new Date(); return d.toISOString().split("T")[0] + " " + d.toTimeString().slice(0, 5); };
  const addDays = (days) => new Date(Date.now() + days * 86400000).toISOString().split("T")[0];

  const cycleLib = (id, current) => {
    const next = current === null ? "liberado" : current === "liberado" ? "bloqueado" : current === "bloqueado" ? null : "liberado";
    const td = now();
    const expDate = next === "liberado" ? addDays(travaDias || 90) : null;
    const hEntry = { dt: td, autor: user.name, txt: next === "liberado" ? `Oportunidade liberada. Trava: ${travaDias} dias (até ${expDate}).` : next === "bloqueado" ? "Oportunidade bloqueada." : "Status de liberação resetado para pendente." };
    setInds(p => p.map(x => x.id === id ? { ...x, lib: next, libDt: next === "liberado" ? addDays(0) : x.libDt, libExp: next === "liberado" ? expDate : x.libExp, hist: [...(x.hist || []), hEntry] } : x));
    if (sel && sel.id === id) setSel(prev => ({ ...prev, lib: next, libDt: next === "liberado" ? addDays(0) : prev.libDt, libExp: next === "liberado" ? expDate : prev.libExp, hist: [...(prev.hist || []), hEntry] }));
    // Notify parceiro about liberation/block
    const ind = inds.find(x => x.id === id);
    if (ind?.pId && (next === "liberado" || next === "bloqueado")) {
      addNotif(setNotifs, { tipo: "liberacao", titulo: next === "liberado" ? "Oportunidade liberada" : "Oportunidade bloqueada", msg: `Sua indicação ${ind.emp} foi ${next === "liberado" ? "liberada. Trava: " + (travaDias || 90) + " dias." : "bloqueada."}`, para: ind.pId, de: user.id, link: "kanban" });
    }
  };

  // Edit libExp
  const editLibExp = (id, newDate) => {
    const td = now();
    const hEntry = { dt: td, autor: user.name, txt: `Limite da trava alterado para ${newDate}.` };
    setInds(p => p.map(x => x.id === id ? { ...x, libExp: newDate, hist: [...(x.hist || []), hEntry] } : x));
    if (sel && sel.id === id) setSel(prev => ({ ...prev, libExp: newDate, hist: [...(prev.hist || []), hEntry] }));
  };

  // Edit obs
  const editObs = (id, newObs) => {
    setInds(p => p.map(x => x.id === id ? { ...x, obs: newObs } : x));
    if (sel && sel.id === id) setSel(prev => ({ ...prev, obs: newObs }));
  };

  // Add interaction
  const [newNote, setNewNote] = useState("");
  const addNote = (id) => {
    if (!newNote.trim()) return;
    const td = now();
    const hEntry = { dt: td, autor: user.name, txt: newNote.trim() };
    setInds(p => p.map(x => x.id === id ? { ...x, hist: [...(x.hist || []), hEntry] } : x));
    if (sel && sel.id === id) setSel(prev => ({ ...prev, hist: [...(prev.hist || []), hEntry] }));
    // Notify parceiro about new interaction
    const ind = inds.find(x => x.id === id);
    if (ind?.pId && ind.pId !== user.id) {
      addNotif(setNotifs, { tipo: "sistema", titulo: "Nova interação", msg: `${user.name} adicionou uma nota em ${ind.emp}.`, para: ind.pId, de: user.id, link: "kanban" });
    }
    setNewNote("");
  };

  // Max libExp for gerente: libDt + travaDias + 60
  const getMaxLibExp = (ind) => {
    if (isDiretor) return null; // sem limite
    if (isGerente && ind.libDt) {
      const base = new Date(ind.libDt);
      base.setDate(base.getDate() + (travaDias || 90) + 60);
      return base.toISOString().split("T")[0];
    }
    return null;
  };

  const thS = { textAlign: "left", padding: "12px 14px", fontSize: 10, fontWeight: 600, color: T.tm, textTransform: "uppercase", borderBottom: `1px solid ${T.bor}`, background: T.bg2 };
  const tdS = { padding: "12px 14px", fontSize: 13, borderBottom: `1px solid ${T.bor}` };
  const selS = { padding: "7px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 12, outline: "none" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: T.ac + "0F", border: `1px solid ${T.ac}25`, borderRadius: 6, fontSize: 13, color: T.t2, flex: 1, marginRight: 12 }}>
          🔄 HubSpot sincronizado <span style={{ marginLeft: "auto" }}><Badge type="success">Conectado</Badge></span>
        </div>
        <div style={{ display: "flex", gap: 4, background: T.inp, borderRadius: 6, padding: 3, border: `1px solid ${T.bor}` }}>
          <button onClick={() => setView("kanban")} style={{ padding: "6px 14px", borderRadius: 4, border: "none", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", background: view === "kanban" ? T.ac : "transparent", color: view === "kanban" ? "#fff" : T.tm }}>📊 Kanban</button>
          <button onClick={() => setView("list")} style={{ padding: "6px 14px", borderRadius: 4, border: "none", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", background: view === "list" ? T.ac : "transparent", color: view === "list" ? "#fff" : T.tm }}>📋 Lista</button>
        </div>
      </div>

      {/* FILTERS */}
      {canMove && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap", padding: "10px 14px", background: T.card, border: `1px solid ${T.bor}`, borderRadius: 8 }}>
          <span style={{ fontSize: 11, color: T.tm, fontWeight: 600 }}>🔍 Filtros:</span>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Parceiro:</span>
            <select value={fPar} onChange={e => setFPar(e.target.value)} style={selS}>
              <option value="todos">Todos</option>
              {myParceiros.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>De:</span>
            <input type="date" value={fDtDe} onChange={e => setFDtDe(e.target.value)} style={selS} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Até:</span>
            <input type="date" value={fDtAte} onChange={e => setFDtAte(e.target.value)} style={selS} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Liberação:</span>
            <select value={fLib} onChange={e => setFLib(e.target.value)} style={selS}>
              <option value="todos">Todos</option>
              <option value="liberado">🔓 Liberado</option>
              <option value="bloqueado">🔒 Bloqueado</option>
              <option value="pendente">⏳ Pendente</option>
              <option value="vencido">⚠️ Trava Vencida</option>
            </select>
          </div>
          {hasFilters && (
            <>
              <button onClick={clearFilters} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.er}44`, background: T.er + "11", color: T.er, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>✕ Limpar</button>
              <span style={{ fontSize: 11, color: T.t2 }}>{fl.length} de {base.length}</span>
            </>
          )}
        </div>
      )}

      {/* KANBAN VIEW */}
      {view === "kanban" && (
        <div style={{ overflowX: "auto", marginLeft: -28, marginRight: -28, paddingLeft: 28, paddingRight: 28, paddingBottom: 12 }}>
          <div style={{ display: "inline-flex", gap: 10, minWidth: "max-content" }}>
            {KCOLS.map(col => {
              const cards = fl.filter(i => i.st === col.id);
              return (
                <div key={col.id} style={{ width: 220, flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: "8px 8px 0 0", background: T.card, border: `1px solid ${T.bor}`, borderBottom: "none" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: col.co }} />
                    <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{col.label}</span>
                    <span style={{ fontSize: 10, color: T.tm, fontFamily: "'Space Mono',monospace", background: T.inp, padding: "2px 7px", borderRadius: 8 }}>{cards.length}</span>
                  </div>
                  <div style={{ background: T.bg2 + "88", border: `1px solid ${T.bor}`, borderTop: "none", borderRadius: "0 0 8px 8px", padding: 6, minHeight: 100, display: "flex", flexDirection: "column", gap: 6 }}
                    onDragOver={canMove ? e => e.preventDefault() : undefined}
                    onDrop={canMove ? e => { const id = e.dataTransfer.getData("text/plain"); const ind = inds.find(x => x.id === id); const colLabel = KCOLS.find(c => c.id === col.id)?.label || col.id; setInds(p => p.map(x => x.id === id ? { ...x, st: col.id } : x)); if (ind && ind.pId) { addNotif(setNotifs, { tipo: "status", titulo: "Status alterado", msg: `Sua indicação ${ind.emp} foi movida para ${colLabel}.`, para: ind.pId, de: user.id, link: "kanban" }); } if (ind && (col.id === "ativo" || col.id === "recusado")) { const gerente = users.find(u => u.id === ind.gId); const superiors = []; if (gerente?.dId) superiors.push(gerente.dId); const dir = users.find(u => u.id === gerente?.dId); if (dir?.eId) superiors.push(dir.eId); superiors.forEach(sId => addNotif(setNotifs, { tipo: "status", titulo: col.id === "ativo" ? "Indicação aprovada" : "Indicação recusada", msg: `Indicação ${ind.emp} foi ${col.id === "ativo" ? "aprovada" : "recusada"} por ${user.name}.`, para: sId, de: user.id, link: "kanban" })); } } : undefined}>
                    {cards.map(ind => (
                      <div key={ind.id} draggable={canMove} onDragStart={canMove ? e => e.dataTransfer.setData("text/plain", ind.id) : undefined}
                        onClick={() => setSel(ind)}
                        style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 6, padding: 10, cursor: "pointer" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{ind.emp}</div>
                        <div style={{ fontSize: 10, color: T.tm }}>🏢 {ind.nf} func · {ind.cont}</div>
                        {ind.lib === "liberado" && ind.libExp && (
                          <div style={{ fontSize: 9, marginTop: 4, padding: "2px 6px", borderRadius: 4, background: ind.libExp < today ? T.er + "1A" : T.ok + "1A", color: ind.libExp < today ? T.er : T.ok, fontWeight: 600 }}>
                            {ind.libExp < today ? "⚠ Vencido " : "🔓 Até "}{ind.libExp}
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: `1px solid ${T.bor}` }}>
                          {ind.hsId ? <Badge type={ind.hsSt === "won" ? "success" : ind.hsSt === "lost" ? "danger" : "warning"}>{ind.hsId}</Badge> : <Badge type="muted">Sem deal</Badge>}
                          <LibBadge lib={ind.lib} />
                        </div>
                      </div>
                    ))}
                    {cards.length === 0 && <div style={{ padding: 14, textAlign: "center", fontSize: 10, color: T.tm }}>Vazio</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {view === "list" && (
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Empresa", "Contato", "Func.", "Status", "Liberação", "Limite Trava", "Parceiro", "Data"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {[...fl].sort((a, b) => b.dt.localeCompare(a.dt)).map(ind => (
                <tr key={ind.id} onClick={() => setSel(ind)} style={{ cursor: "pointer" }}>
                  <td style={tdS}><div style={{ fontWeight: 600 }}>{ind.emp}</div><div style={{ fontSize: 10, color: T.tm }}>{ind.cnpj}</div></td>
                  <td style={tdS}>{ind.cont}</td>
                  <td style={tdS}>{ind.nf}</td>
                  <td style={tdS}><Badge type={ind.st === "ativo" ? "success" : ind.st === "recusado" ? "danger" : "info"}>{KCOLS.find(k => k.id === ind.st)?.label}</Badge></td>
                  <td style={tdS}><LibBadge lib={ind.lib} /></td>
                  <td style={tdS}>{ind.lib === "liberado" && ind.libExp ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: ind.libExp < today ? T.er : T.ok }}>
                      {ind.libExp < today ? "⚠ " : ""}{ind.libExp}
                    </span>
                  ) : <span style={{ color: T.tm, fontSize: 11 }}>—</span>}</td>
                  <td style={{ ...tdS, fontSize: 12 }}>{users.find(u => u.id === ind.pId)?.name || "—"}</td>
                  <td style={{ ...tdS, fontSize: 11, color: T.tm }}>{ind.dt}</td>
                </tr>
              ))}
              {fl.length === 0 && <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhuma indicação{hasFilters ? " com esses filtros" : ""}.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!sel} onClose={() => setSel(null)} title="Detalhes da Indicação" wide footer={canMove && sel ? <>
        <select value={sel.st} onChange={e => { const v = e.target.value; setInds(p => p.map(x => x.id === sel.id ? { ...x, st: v } : x)); setSel({ ...sel, st: v }); }}
          style={{ padding: "8px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
          {KCOLS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <Btn v={sel.lib === "liberado" ? "danger" : "success"} sm onClick={() => cycleLib(sel.id, sel.lib)}>
          {sel.lib === null ? "🔓 Liberar" : sel.lib === "liberado" ? "🔒 Bloquear" : "⏳ Pendente"}
        </Btn>
        <Btn v="secondary" onClick={() => setSel(null)}>Fechar</Btn>
      </> : null}>
        {sel && <div>
          {[["Empresa", sel.emp, true], ["CNPJ", sel.cnpj], ["Contato", sel.cont], ["Telefone", sel.tel], ["E-mail", sel.em], ["Funcionários", sel.nf], ["Data", sel.dt],
          ["Parceiro", users.find(u => u.id === sel.pId)?.name], ["Gerente", users.find(u => u.id === sel.gId)?.name]
          ].map(([l, v, b], i) => (
            <div key={i} style={{ display: "flex", padding: "8px 0", borderBottom: `1px solid ${T.bor}33` }}>
              <div style={{ width: 130, fontSize: 11, color: T.tm, textTransform: "uppercase", flexShrink: 0 }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: b ? 700 : 400 }}>{v || "—"}</div>
            </div>
          ))}
          {sel.razao && (
            <div style={{ marginTop: 12, padding: 14, background: T.inp, borderRadius: 8, border: `1px solid ${T.bor}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.ac, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>📋 Dados da Receita Federal</div>
              {[["Razão Social", sel.razao], ["Nome Fantasia", sel.fantasia], ["Capital Social", sel.capital ? `R$ ${sel.capital}` : null], ["Data Abertura", sel.abertura], ["CNAE Principal", sel.cnae], ["Endereço", sel.endereco]].map(([l, v], i) => (
                v ? <div key={i} style={{ display: "flex", padding: "5px 0", borderBottom: `1px solid ${T.bor}22` }}>
                  <div style={{ width: 120, fontSize: 10, color: T.tm, textTransform: "uppercase", flexShrink: 0 }}>{l}</div>
                  <div style={{ fontSize: 12, color: T.t2 }}>{v}</div>
                </div> : null
              ))}
            </div>
          )}
          <div style={{ display: "flex", padding: "8px 0", borderBottom: `1px solid ${T.bor}33`, marginTop: 8 }}>
            <div style={{ width: 130, fontSize: 11, color: T.tm, textTransform: "uppercase" }}>Status</div>
            <Badge type={sel.st === "ativo" ? "success" : sel.st === "recusado" ? "danger" : "info"}>{KCOLS.find(k => k.id === sel.st)?.label}</Badge>
          </div>
          <div style={{ display: "flex", padding: "8px 0", borderBottom: `1px solid ${T.bor}33` }}>
            <div style={{ width: 130, fontSize: 11, color: T.tm, textTransform: "uppercase" }}>HubSpot</div>
            <div>{sel.hsId ? <Badge type={sel.hsSt === "won" ? "success" : sel.hsSt === "lost" ? "danger" : "warning"}>{sel.hsId} — {sel.hsSt === "won" ? "Ganho" : sel.hsSt === "lost" ? "Perdido" : "Aberto"}</Badge> : <span style={{ fontSize: 12, color: T.tm }}>Nenhum deal</span>}</div>
          </div>
          <div style={{ display: "flex", padding: "8px 0", borderBottom: `1px solid ${T.bor}33` }}>
            <div style={{ width: 130, fontSize: 11, color: T.tm, textTransform: "uppercase" }}>Liberação</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <LibBadge lib={sel.lib} />
              {sel.lib === "liberado" && sel.libDt && <span style={{ fontSize: 11, color: T.t2 }}>desde {sel.libDt}</span>}
              {sel.lib === "liberado" && sel.libExp && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: sel.libExp < today ? T.er + "1A" : T.ok + "1A", color: sel.libExp < today ? T.er : T.ok }}>
                  {sel.libExp < today ? "⚠ Vencido em " : "Limite: "}{sel.libExp}
                </span>
              )}
            </div>
          </div>

          {/* Editar Limite da Trava */}
          {canEdit && sel.lib === "liberado" && (
            <div style={{ marginTop: 10, padding: 12, background: T.wn + "0A", border: `1px solid ${T.wn}25`, borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.wn, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>📅 Editar Limite da Trava</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="date" value={sel.libExp || ""} min={addDays(0)}
                  max={isGerente ? getMaxLibExp(sel) : undefined}
                  onChange={e => editLibExp(sel.id, e.target.value)}
                  style={{ padding: "7px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 12, outline: "none" }} />
                <span style={{ fontSize: 11, color: T.tm }}>
                  {isGerente ? `Máx: +60 dias do padrão (${getMaxLibExp(sel)})` : "Diretor: sem limite de data"}
                </span>
              </div>
            </div>
          )}

          {/* Observações editáveis */}
          {canEdit ? (
            <div style={{ marginTop: 12 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Observações</label>
              <textarea value={sel.obs || ""} onChange={e => editObs(sel.id, e.target.value)}
                placeholder="Adicionar observações..."
                style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 12, outline: "none", resize: "vertical", minHeight: 50, boxSizing: "border-box" }} />
            </div>
          ) : sel.obs ? (
            <div style={{ marginTop: 10, padding: 10, background: T.inp, borderRadius: 6, fontSize: 12, color: T.t2 }}>{sel.obs}</div>
          ) : null}

          {/* Histórico de Interações */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.t2, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>📜 Histórico de Interações</div>
            {canEdit && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Adicionar interação..."
                  onKeyDown={e => e.key === "Enter" && addNote(sel.id)}
                  style={{ flex: 1, padding: "8px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 12, outline: "none" }} />
                <Btn sm onClick={() => addNote(sel.id)} disabled={!newNote.trim()}>＋ Adicionar</Btn>
              </div>
            )}
            <div style={{ maxHeight: 200, overflowY: "auto", borderRadius: 8, border: `1px solid ${T.bor}` }}>
              {(sel.hist || []).length === 0 && <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: T.tm }}>Nenhuma interação registrada.</div>}
              {[...(sel.hist || [])].reverse().map((h, i) => (
                <div key={i} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.bor}22`, fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, color: T.ac, fontSize: 11 }}>{h.autor}</span>
                    <span style={{ fontSize: 10, color: T.tm, fontFamily: "'Space Mono',monospace" }}>{h.dt}</span>
                  </div>
                  <div style={{ color: T.t2 }}>{h.txt}</div>
                </div>
              ))}
            </div>
          </div>
        </div>}
      </Modal>
    </div>
  );
}
// ===== PARCEIROS =====
function ParcPage({ users, setUsers, inds }) {
  const { user } = useAuth();
  const [modal, setModal] = useState(false);
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ name: "", email: "", pw: "", empresa: "", tel: "", gId: user.role === "gerente" ? user.id : "", comTipo: "pct", comVal: "" });

  const myDirIds = user.role === "executivo" ? users.filter(u => u.role === "diretor" && u.eId === user.id).map(d => d.id) : [];
  const myGerIds = user.role === "executivo" ? users.filter(u => u.role === "gerente" && myDirIds.includes(u.dId)).map(g => g.id) : [];

  const parcs = (user.role === "gerente" ? users.filter(u => u.role === "parceiro" && u.gId === user.id)
    : user.role === "diretor" ? users.filter(u => u.role === "parceiro" && users.find(g => g.id === u.gId && g.dId === user.id))
      : user.role === "executivo" ? users.filter(u => u.role === "parceiro" && myGerIds.includes(u.gId))
        : users.filter(u => u.role === "parceiro"))
    .filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.empresa || "").toLowerCase().includes(q.toLowerCase()));

  const add = () => {
    if (!f.name || !f.email || !f.pw || !f.comVal) return;
    setUsers(prev => [...prev, { ...f, id: "p" + Date.now(), role: "parceiro", av: f.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(), gId: f.gId || user.id, comTipo: f.comTipo, comVal: parseFloat(f.comVal) || 0 }]);
    setModal(false);
    setF({ name: "", email: "", pw: "", empresa: "", tel: "", gId: user.role === "gerente" ? user.id : "", comTipo: "pct", comVal: "" });
  };

  const thS = { textAlign: "left", padding: "12px 14px", fontSize: 10, fontWeight: 600, color: T.tm, textTransform: "uppercase", borderBottom: `1px solid ${T.bor}`, background: T.bg2 };
  const tdS = { padding: "12px 14px", fontSize: 13, borderBottom: `1px solid ${T.bor}` };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, padding: "7px 12px" }}>
          <span style={{ color: T.tm }}>🔍</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar..." style={{ background: "none", border: "none", color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: "none", width: 180 }} />
        </div>
        <div style={{ flex: 1 }} />
        <Btn onClick={() => setModal(true)}>＋ Cadastrar Parceiro</Btn>
      </div>
      <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Parceiro", "Empresa", "Condição Comercial", "Gerente", "Ind.", "Ativas"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>{parcs.map(p => {
            const pi = inds.filter(i => i.pId === p.id);
            return (
              <tr key={p.id} onClick={() => setDetail(p)} style={{ cursor: "pointer" }}>
                <td style={tdS}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: T.ac + "22", color: T.ac, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{p.av || p.name[0]}</div>
                    <div><div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: 10, color: T.tm }}>{p.email}</div></div>
                  </div>
                </td>
                <td style={tdS}>{p.empresa || "—"}</td>
                <td style={tdS}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <ComBadge tipo={p.comTipo} val={p.comVal} />
                  </div>
                </td>
                <td style={tdS}>{users.find(u => u.id === p.gId)?.name || "—"}</td>
                <td style={tdS}><Badge type="info">{pi.length}</Badge></td>
                <td style={tdS}><Badge type="success">{pi.filter(i => i.st === "ativo").length}</Badge></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>

      {/* Detail Modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detalhes do Parceiro">
        {detail && <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: T.ac + "22", color: T.ac, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>{detail.av || detail.name[0]}</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{detail.name}</div>
              <div style={{ fontSize: 12, color: T.tm }}>{detail.empresa || "Sem empresa"}</div>
            </div>
          </div>
          {[["E-mail", detail.email], ["Telefone", detail.tel], ["Gerente", users.find(u => u.id === detail.gId)?.name]].map(([l, v], i) => (
            <div key={i} style={{ display: "flex", padding: "8px 0", borderBottom: `1px solid ${T.bor}33` }}>
              <div style={{ width: 130, fontSize: 11, color: T.tm, textTransform: "uppercase", flexShrink: 0 }}>{l}</div>
              <div style={{ fontSize: 13 }}>{v || "—"}</div>
            </div>
          ))}
          <div style={{ marginTop: 14, padding: 14, background: T.ac + "0A", border: `1px solid ${T.ac}25`, borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.ac, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>💰 Condição Comercial</div>
            <div style={{ background: T.card, borderRadius: 6, padding: 14, border: `1px solid ${T.bor}`, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", marginBottom: 4 }}>{detail.comTipo === "pct" ? "% sobre Cashin" : "R$ por Conta Ativa"}</div>
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: detail.comTipo === "pct" ? T.ac : T.inf }}>{detail.comTipo === "pct" ? `${detail.comVal}%` : detail.comVal != null ? `R$ ${detail.comVal.toFixed(2)}` : "—"}</div>
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <Badge type="info">{inds.filter(i => i.pId === detail.id).length} indicações</Badge>
            <Badge type="success">{inds.filter(i => i.pId === detail.id && i.st === "ativo").length} ativas</Badge>
          </div>
        </div>}
      </Modal>

      {/* Cadastro Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="Cadastrar Parceiro" footer={<><Btn v="secondary" onClick={() => setModal(false)}>Cancelar</Btn><Btn onClick={add} disabled={!f.name || !f.email || !f.pw || !f.comVal}>Cadastrar</Btn></>}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Inp label="Nome *" value={f.name} onChange={v => setF({ ...f, name: v })} placeholder="Nome completo" />
          <Inp label="Empresa" value={f.empresa} onChange={v => setF({ ...f, empresa: v })} placeholder="Empresa" />
          <Inp label="E-mail *" value={f.email} onChange={v => setF({ ...f, email: v })} placeholder="email@ex.com" />
          <Inp label="Senha *" value={f.pw} onChange={v => setF({ ...f, pw: v })} type="password" placeholder="Senha" />
          <Inp label="Telefone" value={f.tel} onChange={v => setF({ ...f, tel: v })} placeholder="(00) 00000-0000" />
          {user.role !== "gerente" && <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Gerente</label>
            <select value={f.gId} onChange={e => setF({ ...f, gId: e.target.value })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
              <option value="">Selecione...</option>
              {users.filter(u => u.role === "gerente").map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>}
        </div>
        {/* Condição Comercial - Obrigatória */}
        <div style={{ marginTop: 4, padding: 14, background: T.ac + "0A", border: `1px solid ${T.ac}25`, borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.ac, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>💰 Condição Comercial *</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => setF({ ...f, comTipo: "pct", comVal: "" })} style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: `2px solid ${f.comTipo === "pct" ? T.ac : T.bor}`, background: f.comTipo === "pct" ? T.ac + "1A" : T.inp, color: f.comTipo === "pct" ? T.ac : T.tm, fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>% sobre Cashin</button>
            <button onClick={() => setF({ ...f, comTipo: "valor", comVal: "" })} style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: `2px solid ${f.comTipo === "valor" ? T.inf : T.bor}`, background: f.comTipo === "valor" ? T.inf + "1A" : T.inp, color: f.comTipo === "valor" ? T.inf : T.tm, fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>R$ por Conta Ativa</button>
          </div>
          <Inp label={f.comTipo === "pct" ? "Percentual (%) *" : "Valor por conta (R$) *"} value={f.comVal} onChange={v => setF({ ...f, comVal: v })} type="number" placeholder={f.comTipo === "pct" ? "Ex: 1.5" : "Ex: 3.50"} />
        </div>
      </Modal>
    </div>
  );
}

// ===== MINHAS INDICAÇÕES =====
const CNPJ_DB = {
  "11.222.333/0001-44": { razao: "Padaria Pão Quente Ltda", fantasia: "Pão Quente", capital: "120.000,00", abertura: "2019-05-12", cnae: "10.91-1-02 - Fabricação de produtos de padaria", endereco: "Rua do Comércio, 200 - Montese, Fortaleza/CE" },
  "22.333.444/0001-55": { razao: "Clínica Saúde Total S.A.", fantasia: "Saúde Total", capital: "1.500.000,00", abertura: "2010-09-01", cnae: "86.30-5-03 - Atividade médica ambulatorial", endereco: "Av. Abolição, 3000 - Meireles, Fortaleza/CE" },
  "33.444.555/0001-66": { razao: "Auto Peças Nordeste Ltda", fantasia: "Auto Nordeste", capital: "350.000,00", abertura: "2014-03-20", cnae: "45.30-7-03 - Comércio de peças para veículos", endereco: "Av. Bezerra de Menezes, 1800 - São Gerardo, Fortaleza/CE" },
};

function MinhasInd({ inds, setInds, notifs, setNotifs, users }) {
  const { user } = useAuth();
  const [modal, setModal] = useState(false);
  const [sel, setSel] = useState(null);
  const [view, setView] = useState("list");
  const [ck, setCk] = useState(false);
  const [hr, setHr] = useState(null);
  const [cnpjData, setCnpjData] = useState(null);
  const [f, setF] = useState({ emp: "", cnpj: "", cont: "", tel: "", em: "", nf: "", obs: "" });
  const my = inds.filter(i => i.pId === user.id);
  const today = new Date().toISOString().split("T")[0];

  const checkHS = () => {
    setCk(true); setHr(null); setCnpjData(null);
    setTimeout(() => {
      const found = inds.find(i => i.cnpj === f.cnpj);
      setHr(found ? { found: true, d: found.hsId } : { found: false });
      // Simulate CNPJ enrichment lookup
      const enrichment = CNPJ_DB[f.cnpj];
      if (enrichment) {
        setCnpjData(enrichment);
        setF(prev => ({ ...prev, emp: enrichment.razao }));
      } else if (!found) {
        // Simulate a generic response for unknown CNPJs
        const fake = { razao: f.emp || "Empresa Consultada", fantasia: f.emp || "—", capital: "100.000,00", abertura: "2020-01-01", cnae: "—", endereco: "—" };
        setCnpjData(fake);
      }
      setCk(false);
    }, 1500);
  };

  const submit = () => {
    const dt = new Date().toISOString().split("T")[0];
    const tm = new Date().toISOString().split("T")[0] + " " + new Date().toTimeString().slice(0, 5);
    setInds(p => [...p, {
      ...f, id: "i" + Date.now(), nf: parseInt(f.nf) || 0, st: "nova", pId: user.id, gId: user.gId,
      hsId: null, hsSt: null, lib: null, libDt: null, libExp: null, dt,
      razao: cnpjData?.razao || null, fantasia: cnpjData?.fantasia || null, capital: cnpjData?.capital || null,
      abertura: cnpjData?.abertura || null, cnae: cnpjData?.cnae || null, endereco: cnpjData?.endereco || null,
      hist: [{ dt: tm, autor: user.name, txt: "Indicação criada" }],
    }]);
    setModal(false); setF({ emp: "", cnpj: "", cont: "", tel: "", em: "", nf: "", obs: "" }); setHr(null); setCnpjData(null);
    // Notify gerente about new indication
    if (user.gId) {
      addNotif(setNotifs, { tipo: "sistema", titulo: "Nova indicação", msg: `Parceiro ${user.name} criou nova indicação: ${f.emp}.`, para: user.gId, de: user.id, link: "kanban" });
    }
  };

  const thS = { textAlign: "left", padding: "12px 14px", fontSize: 10, fontWeight: 600, color: T.tm, textTransform: "uppercase", borderBottom: `1px solid ${T.bor}`, background: T.bg2 };
  const tdS = { padding: "12px 14px", fontSize: 13, borderBottom: `1px solid ${T.bor}` };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 4, background: T.inp, borderRadius: 6, padding: 3, border: `1px solid ${T.bor}` }}>
          <button onClick={() => setView("list")} style={{ padding: "6px 14px", borderRadius: 4, border: "none", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", background: view === "list" ? T.ac : "transparent", color: view === "list" ? "#fff" : T.tm }}>📋 Lista</button>
          <button onClick={() => setView("kanban")} style={{ padding: "6px 14px", borderRadius: 4, border: "none", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", background: view === "kanban" ? T.ac : "transparent", color: view === "kanban" ? "#fff" : T.tm }}>📊 Kanban</button>
        </div>
        <Btn onClick={() => setModal(true)}>＋ Nova Indicação</Btn>
      </div>

      {/* LIST VIEW */}
      {view === "list" && (
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Empresa", "Contato", "Func.", "Status", "HubSpot", "Liberação", "Data"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {my.map(ind => (
                <tr key={ind.id} onClick={() => setSel(ind)} style={{ cursor: "pointer" }}>
                  <td style={tdS}><div style={{ fontSize: 13, fontWeight: 600 }}>{ind.emp}</div><div style={{ fontSize: 10, color: T.tm }}>{ind.cnpj}</div></td>
                  <td style={tdS}>{ind.cont}</td>
                  <td style={tdS}>{ind.nf}</td>
                  <td style={tdS}><Badge type={ind.st === "ativo" ? "success" : ind.st === "recusado" ? "danger" : "info"}>{KCOLS.find(k => k.id === ind.st)?.label}</Badge></td>
                  <td style={tdS}>{ind.hsId ? <Badge type="warning">{ind.hsId}</Badge> : <span style={{ color: T.tm, fontSize: 11 }}>—</span>}</td>
                  <td style={tdS}><LibBadge lib={ind.lib} /></td>
                  <td style={{ ...tdS, fontSize: 11, color: T.tm }}>{ind.dt}</td>
                </tr>
              ))}
              {my.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhuma indicação. Clique em "Nova Indicação".</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* KANBAN VIEW */}
      {view === "kanban" && (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12 }}>
          {KCOLS.map(col => {
            const cards = my.filter(i => i.st === col.id);
            return (
              <div key={col.id} style={{ minWidth: 240, maxWidth: 240, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: "8px 8px 0 0", background: T.card, border: `1px solid ${T.bor}`, borderBottom: "none" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: col.co }} />
                  <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{col.label}</span>
                  <span style={{ fontSize: 10, color: T.tm, fontFamily: "'Space Mono',monospace", background: T.inp, padding: "2px 7px", borderRadius: 8 }}>{cards.length}</span>
                </div>
                <div style={{ background: T.bg2 + "88", border: `1px solid ${T.bor}`, borderTop: "none", borderRadius: "0 0 8px 8px", padding: 8, minHeight: 90, display: "flex", flexDirection: "column", gap: 6 }}>
                  {cards.map(ind => (
                    <div key={ind.id} onClick={() => setSel(ind)} style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 6, padding: 12, cursor: "pointer" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{ind.emp}</div>
                      <div style={{ fontSize: 10, color: T.tm }}>🏢 {ind.nf} func · {ind.cont}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 6, borderTop: `1px solid ${T.bor}` }}>
                        {ind.hsId ? <Badge type={ind.hsSt === "won" ? "success" : ind.hsSt === "lost" ? "danger" : "warning"}>{ind.hsId}</Badge> : <Badge type="muted">Sem deal</Badge>}
                        <LibBadge lib={ind.lib} />
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && <div style={{ padding: 14, textAlign: "center", fontSize: 10, color: T.tm }}>—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Detalhe da Indicação (read-only) */}
      <Modal open={!!sel} onClose={() => setSel(null)} title="Detalhes da Indicação" wide>
        {sel && <div>
          {[["Empresa", sel.emp, true], ["CNPJ", sel.cnpj], ["Contato", sel.cont], ["Telefone", sel.tel], ["E-mail", sel.em], ["Funcionários", sel.nf], ["Data Indicação", sel.dt]].map(([l, v, b], i) => (
            <div key={i} style={{ display: "flex", padding: "8px 0", borderBottom: `1px solid ${T.bor}33` }}>
              <div style={{ width: 130, fontSize: 11, color: T.tm, textTransform: "uppercase", flexShrink: 0 }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: b ? 700 : 400 }}>{v || "—"}</div>
            </div>
          ))}
          <div style={{ display: "flex", padding: "8px 0", borderBottom: `1px solid ${T.bor}33` }}>
            <div style={{ width: 130, fontSize: 11, color: T.tm, textTransform: "uppercase" }}>Status</div>
            <Badge type={sel.st === "ativo" ? "success" : sel.st === "recusado" ? "danger" : "info"}>{KCOLS.find(k => k.id === sel.st)?.label}</Badge>
          </div>
          <div style={{ display: "flex", padding: "8px 0", borderBottom: `1px solid ${T.bor}33` }}>
            <div style={{ width: 130, fontSize: 11, color: T.tm, textTransform: "uppercase" }}>Liberação</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <LibBadge lib={sel.lib} />
              {sel.lib === "liberado" && sel.libDt && <span style={{ fontSize: 11, color: T.t2 }}>desde {sel.libDt}</span>}
              {sel.lib === "liberado" && sel.libExp && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: sel.libExp < today ? T.er + "1A" : T.ok + "1A", color: sel.libExp < today ? T.er : T.ok }}>
                  {sel.libExp < today ? "⚠ Vencido " : "Limite: "}{sel.libExp}
                </span>
              )}
            </div>
          </div>
          {sel.obs && (
            <div style={{ marginTop: 10, padding: 10, background: T.inp, borderRadius: 6, fontSize: 12, color: T.t2 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: T.tm, textTransform: "uppercase" }}>Observações: </span>{sel.obs}
            </div>
          )}
          {/* Histórico (read-only) */}
          {(sel.hist || []).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.t2, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>📜 Histórico</div>
              <div style={{ maxHeight: 200, overflowY: "auto", borderRadius: 8, border: `1px solid ${T.bor}` }}>
                {[...(sel.hist || [])].reverse().map((h, i) => (
                  <div key={i} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.bor}22`, fontSize: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, color: T.ac, fontSize: 11 }}>{h.autor}</span>
                      <span style={{ fontSize: 10, color: T.tm, fontFamily: "'Space Mono',monospace" }}>{h.dt}</span>
                    </div>
                    <div style={{ color: T.t2 }}>{h.txt}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>}
      </Modal>

      {/* MODAL: Nova Indicação with CNPJ enrichment */}
      <Modal open={modal} onClose={() => { setModal(false); setHr(null); setCnpjData(null); }} title="Nova Indicação" wide footer={<><Btn v="secondary" onClick={() => { setModal(false); setHr(null); setCnpjData(null); }}>Cancelar</Btn><Btn onClick={submit} disabled={!f.emp || !f.cnpj || !f.cont || hr?.found}>Enviar</Btn></>}>
        <div style={{ marginBottom: 16, padding: 12, background: T.inp, borderRadius: 6, fontSize: 12, color: T.t2 }}>⚠️ Consulte o CNPJ para verificar no HubSpot e preencher dados automaticamente da Receita Federal.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1/-1", marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>CNPJ *</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={f.cnpj} onChange={e => { setF({ ...f, cnpj: e.target.value }); setHr(null); setCnpjData(null); }} placeholder="00.000.000/0000-00" style={{ flex: 1, padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: "none" }} />
              <Btn v="secondary" sm onClick={checkHS} disabled={!f.cnpj || ck}>{ck ? "⏳ Consultando..." : "🔍 Consultar CNPJ"}</Btn>
            </div>
          </div>

          {hr && <div style={{ gridColumn: "1/-1", padding: 10, borderRadius: 6, background: hr.found ? T.er + "11" : T.ok + "11", border: `1px solid ${hr.found ? T.er : T.ok}33`, fontSize: 12, color: hr.found ? T.er : T.ok }}>
            {hr.found ? `❌ Deal existente (${hr.d}). Não é possível indicar.` : "✅ Nenhum deal no HubSpot. Pode indicar!"}
          </div>}

          {/* CNPJ Enrichment Result */}
          {cnpjData && !hr?.found && (
            <div style={{ gridColumn: "1/-1", padding: 14, background: T.inp, borderRadius: 8, border: `1px solid ${T.inf}33` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.inf, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>📋 Dados da Receita Federal</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 12 }}>
                {[["Razão Social", cnpjData.razao], ["Nome Fantasia", cnpjData.fantasia], ["Capital Social", `R$ ${cnpjData.capital}`], ["Data Abertura", cnpjData.abertura], ["CNAE", cnpjData.cnae], ["Endereço", cnpjData.endereco]].map(([l, v], i) => (
                  <div key={i} style={{ padding: "4px 0" }}>
                    <div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase" }}>{l}</div>
                    <div style={{ color: T.t2, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Inp label="Empresa (Razão Social) *" value={f.emp} onChange={v => setF({ ...f, emp: v })} placeholder="Preenchido automaticamente ao consultar CNPJ" />
          <Inp label="Contato *" value={f.cont} onChange={v => setF({ ...f, cont: v })} placeholder="Nome do contato" />
          <Inp label="Telefone" value={f.tel} onChange={v => setF({ ...f, tel: v })} placeholder="(00) 00000-0000" />
          <Inp label="E-mail" value={f.em} onChange={v => setF({ ...f, em: v })} placeholder="contato@empresa.com" />
          <Inp label="Nº Funcionários" value={f.nf} onChange={v => setF({ ...f, nf: v })} type="number" placeholder="0" />
          <div style={{ gridColumn: "1/-1", marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Observações</label>
            <textarea value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} placeholder="Info adicional..." style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: "none", resize: "vertical", minHeight: 70, boxSizing: "border-box" }} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ===== MATERIAIS =====
function MatsPage({ mats }) {
  const [cat, setCat] = useState("todos");
  const cats = ["todos", "comercial", "financeiro", "treinamento", "suporte", "legal"];
  const fl = cat === "todos" ? mats : mats.filter(m => m.cat === cat);
  const tc = { pdf: T.er, xlsx: T.ok, docx: T.inf, mp4: "#8b5cf6" };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {cats.map(c2 => <button key={c2} onClick={() => setCat(c2)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer", border: `1px solid ${cat === c2 ? T.ac : T.bor}`, background: cat === c2 ? T.ac + "1A" : "transparent", color: cat === c2 ? T.ac : T.t2, fontFamily: "'DM Sans',sans-serif", textTransform: "capitalize" }}>{c2}</button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {fl.map(m => (
          <div key={m.id} style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 18, cursor: "pointer" }}>
            <div style={{ width: 40, height: 40, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, fontFamily: "'Space Mono',monospace", textTransform: "uppercase", background: (tc[m.tipo] || T.tm) + "22", color: tc[m.tipo] || T.tm, marginBottom: 12 }}>{m.tipo}</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, lineHeight: 1.4 }}>{m.t}</div>
            <div style={{ fontSize: 11, color: T.tm }}>{m.sz} · {m.dt}</div>
            <div style={{ marginTop: 12 }}><Btn v="secondary" sm>⬇ Download</Btn></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== CONFIG =====
function CfgPage({ mats, setMats, users, setUsers, travaDias, setTravaDias, notifs, setNotifs }) {
  const { user } = useAuth();
  const [cfg, setCfg] = useState({ prazo: 5, minF: 20, hsKey: "pat-na1-xxxx", hsPipe: "default", emOn: true, waOn: false });
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState("geral");
  const [matModal, setMatModal] = useState(false);
  const [mf, setMf] = useState({ t: "", tipo: "pdf", cat: "comercial", sz: "" });
  const [delConf, setDelConf] = useState(null);
  const [userModal, setUserModal] = useState(false);
  const [uf, setUf] = useState({ name: "", email: "", pw: "", role: "gerente", dId: "", eId: "" });
  const [delUserConf, setDelUserConf] = useState(null);
  // Segmented communication state
  const [commForm, setCommForm] = useState({ titulo: "", msg: "", perfis: [], individuais: [], prioridade: "info" });
  const [commHist, setCommHist] = useState([
    { id: "ch1", titulo: "Atualização de política comercial", msg: "Informamos que a nova política de comissionamento entra em vigor em Março/2025.", perfis: ["parceiro"], dt: "2025-02-01 10:00", por: "Super Admin", total: 4 },
    { id: "ch2", titulo: "Treinamento Plataforma", msg: "Participe do treinamento sobre a nova plataforma dia 15/02 às 14h.", perfis: ["parceiro", "gerente"], dt: "2025-01-28 15:30", por: "Super Admin", total: 7 },
  ]);
  const [commSent, setCommSent] = useState(false);

  const addMat = () => {
    if (!mf.t) return;
    setMats(prev => [...prev, { id: "m" + Date.now(), t: mf.t, tipo: mf.tipo, cat: mf.cat, sz: mf.sz || "—", dt: new Date().toISOString().split("T")[0] }]);
    setMatModal(false);
    setMf({ t: "", tipo: "pdf", cat: "comercial", sz: "" });
  };

  const delMat = (id) => { setMats(prev => prev.filter(m => m.id !== id)); setDelConf(null); };

  const addUser = () => {
    if (!uf.name || !uf.email || !uf.pw) return;
    if (uf.role === "gerente" && !uf.dId) return;
    if (uf.role === "diretor" && !uf.eId) return;
    setUsers(prev => [...prev, {
      id: "u" + Date.now(), name: uf.name, email: uf.email, pw: uf.pw, role: uf.role,
      av: uf.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
      ...(uf.role === "gerente" ? { dId: uf.dId } : {}),
      ...(uf.role === "diretor" ? { eId: uf.eId } : {})
    }]);
    setUserModal(false);
    setUf({ name: "", email: "", pw: "", role: "gerente", dId: "", eId: "" });
  };

  const delUser = (id) => { setUsers(prev => prev.filter(u => u.id !== id)); setDelUserConf(null); };

  const tc = { pdf: T.er, xlsx: T.ok, docx: T.inf, mp4: "#8b5cf6" };
  const thS = { textAlign: "left", padding: "12px 14px", fontSize: 10, fontWeight: 600, color: T.tm, textTransform: "uppercase", borderBottom: `1px solid ${T.bor}`, background: T.bg2 };
  const tdS = { padding: "12px 14px", fontSize: 13, borderBottom: `1px solid ${T.bor}` };

  return (
    <div>
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.bor}`, marginBottom: 20 }}>
        {["geral", "hubspot", "notificações", "usuários", "materiais"].map(t => <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", border: "none", background: "none", color: tab === t ? T.ac : T.tm, fontFamily: "'DM Sans',sans-serif", borderBottom: `2px solid ${tab === t ? T.ac : "transparent"}`, marginBottom: -1, textTransform: "capitalize" }}>{t}</button>)}
      </div>
      {tab === "geral" && <div>
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Configurações Gerais</h3>
          {[{ l: "Prazo Análise (dias)", k: "prazo" }, { l: "Mín. Funcionários", k: "minF" }].map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${T.bor}` }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{r.l}</div>
              <input type="number" value={cfg[r.k]} onChange={e => setCfg({ ...cfg, [r.k]: parseFloat(e.target.value) || 0 })} style={{ width: 90, textAlign: "right", padding: "8px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: "none" }} />
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${T.bor}` }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>🔒 Prazo Trava da Oportunidade (dias)</div>
              <div style={{ fontSize: 11, color: T.tm, marginTop: 2 }}>Ao liberar uma indicação, a trava expira após este período. Gerentes podem estender até +60 dias.</div>
            </div>
            <input type="number" value={travaDias} onChange={e => setTravaDias(parseInt(e.target.value) || 90)} style={{ width: 90, textAlign: "right", padding: "8px 10px", background: T.inp, border: `1px solid ${T.ac}44`, borderRadius: 6, color: T.ac, fontFamily: "'Space Mono',monospace", fontSize: 15, fontWeight: 700, outline: "none" }} />
          </div>
        </div>

        {/* Commission Model */}
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>💰 Modelo de Comissionamento</h3>
          <p style={{ fontSize: 12, color: T.tm, marginBottom: 16 }}>Cada parceiro recebe uma condição comercial individual — escolha entre percentual ou valor fixo:</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div style={{ background: T.inp, borderRadius: 8, padding: 16, border: `1px solid ${T.ac}25` }}>
              <div style={{ fontSize: 10, color: T.ac, textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>Opção A</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>% sobre Cashin</div>
              <div style={{ fontSize: 11, color: T.t2 }}>Percentual aplicado sobre o volume total de cashin no mês</div>
            </div>
            <div style={{ background: T.inp, borderRadius: 8, padding: 16, border: `1px solid ${T.inf}25` }}>
              <div style={{ fontSize: 10, color: T.inf, textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>Opção B</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>R$ por Conta Ativa</div>
              <div style={{ fontSize: 11, color: T.t2 }}>Valor fixo por conta que teve pelo menos 1 cashin no mês</div>
            </div>
          </div>

          {/* Parceiro Commission Overview */}
          <div style={{ fontSize: 11, fontWeight: 600, color: T.t2, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Condições por Parceiro</div>
          <div style={{ background: T.bg2, borderRadius: 8, border: `1px solid ${T.bor}`, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Parceiro", "Empresa", "Tipo", "Valor", "Gerente"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>{users.filter(u => u.role === "parceiro").map(p => (
                <tr key={p.id}>
                  <td style={{ ...tdS, fontWeight: 600 }}>{p.name}</td>
                  <td style={{ ...tdS, fontSize: 12, color: T.t2 }}>{p.empresa || "—"}</td>
                  <td style={tdS}>
                    <select value={p.comTipo || "pct"} onChange={e => setUsers(prev => prev.map(u => u.id === p.id ? { ...u, comTipo: e.target.value } : u))}
                      style={{ padding: "5px 8px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 4, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 11, outline: "none" }}>
                      <option value="pct">% Cashin</option>
                      <option value="valor">R$/Conta</option>
                    </select>
                  </td>
                  <td style={tdS}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {p.comTipo === "valor" && <span style={{ fontSize: 11, color: T.tm }}>R$</span>}
                      <input type="number" step={p.comTipo === "pct" ? "0.1" : "0.5"} value={p.comVal ?? ""} onChange={e => setUsers(prev => prev.map(u => u.id === p.id ? { ...u, comVal: parseFloat(e.target.value) || 0 } : u))}
                        style={{ width: 80, textAlign: "right", padding: "5px 8px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 4, color: p.comTipo === "pct" ? T.ac : T.inf, fontFamily: "'Space Mono',monospace", fontSize: 12, fontWeight: 700, outline: "none" }} />
                      {p.comTipo === "pct" && <span style={{ fontSize: 11, color: T.tm }}>%</span>}
                    </div>
                  </td>
                  <td style={{ ...tdS, fontSize: 12, color: T.tm }}>{users.find(u => u.id === p.gId)?.name || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>}
      {tab === "hubspot" && <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Integração HubSpot</h3>
        <Inp label="API Key" value={cfg.hsKey} onChange={v => setCfg({ ...cfg, hsKey: v })} type="password" />
        <Inp label="Pipeline ID" value={cfg.hsPipe} onChange={v => setCfg({ ...cfg, hsPipe: v })} />
        <div style={{ padding: 14, background: T.ok + "0D", border: `1px solid ${T.ok}25`, borderRadius: 6, fontSize: 13, color: T.ok, fontWeight: 600 }}>✓ Conexão ativa · Última sync: 3 min</div>
      </div>}
      {tab === "notificações" && <div>
        {/* Canal Preferences */}
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📡 Canais de Notificação</h3>
          {[{ l: "E-mail", k: "emOn", ico: "📧", desc: "Receba notificações por e-mail" }, { l: "WhatsApp", k: "waOn", ico: "📱", desc: "Receba notificações por WhatsApp" }].map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: `1px solid ${T.bor}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>{r.ico}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{r.l}</div>
                  <div style={{ fontSize: 11, color: T.tm }}>{r.desc}</div>
                </div>
              </div>
              <button onClick={() => setCfg({ ...cfg, [r.k]: !cfg[r.k] })} style={{ width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer", position: "relative", background: cfg[r.k] ? T.ac : T.bor, transition: "background 0.2s" }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: cfg[r.k] ? 25 : 3, transition: "all 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
              </button>
            </div>
          ))}
        </div>

        {/* Automatic cadence table */}
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>⚡ Cadência Automática</h3>
          <p style={{ fontSize: 12, color: T.tm, marginBottom: 16 }}>Notificações disparadas automaticamente a cada ação no sistema.</p>
          <div style={{ background: T.bg2, borderRadius: 8, border: `1px solid ${T.bor}`, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Evento", "Notifica", "Tipo", "Status"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>
                {[
                  { ev: "Status alterado (Kanban)", dest: "Parceiro", tipo: "status" },
                  { ev: "Indicação ativa ou recusada", dest: "Superior hierárquico", tipo: "status" },
                  { ev: "Liberação/Bloqueio", dest: "Parceiro", tipo: "liberacao" },
                  { ev: "Nova interação/nota", dest: "Parceiro", tipo: "sistema" },
                  { ev: "Relatório de comissão enviado", dest: "Parceiro", tipo: "financeiro" },
                  { ev: "NFe enviada", dest: "Gerente", tipo: "financeiro" },
                  { ev: "NFe marcada como paga", dest: "Parceiro", tipo: "financeiro" },
                  { ev: "Nova indicação criada", dest: "Gerente", tipo: "sistema" },
                ].map((r, i) => {
                  const nt = NOTIF_TYPES[r.tipo];
                  return (
                    <tr key={i}>
                      <td style={{ ...tdS, fontWeight: 500 }}>{r.ev}</td>
                      <td style={{ ...tdS, fontSize: 12 }}>{r.dest}</td>
                      <td style={tdS}><span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: nt.color + "22", color: nt.color }}>{nt.emoji} {nt.label}</span></td>
                      <td style={tdS}><Badge type="success">✓ Ativo</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Segmented Communication */}
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>📢 Comunicação Segmentada</h3>
          <p style={{ fontSize: 12, color: T.tm, marginBottom: 16 }}>Envie comunicados direcionados para perfis ou usuários específicos.</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <Inp label="Título do comunicado *" value={commForm.titulo} onChange={v => setCommForm({ ...commForm, titulo: v })} placeholder="Ex: Atualização de política" />
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Prioridade</label>
              <select value={commForm.prioridade} onChange={e => setCommForm({ ...commForm, prioridade: e.target.value })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                <option value="info">ℹ️ Informativo</option>
                <option value="urgente">🚨 Urgente</option>
                <option value="aviso">⚠️ Aviso</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Destinatários por perfil</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["parceiro", "gerente", "diretor", "executivo"].map(role => (
                <button key={role} onClick={() => setCommForm(prev => ({ ...prev, perfis: prev.perfis.includes(role) ? prev.perfis.filter(r => r !== role) : [...prev.perfis, role] }))} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer", border: `1px solid ${commForm.perfis.includes(role) ? T.ac : T.bor}`, background: commForm.perfis.includes(role) ? T.ac + "1A" : "transparent", color: commForm.perfis.includes(role) ? T.ac : T.t2, fontFamily: "'DM Sans',sans-serif", textTransform: "capitalize" }}>{role}{commForm.perfis.includes(role) ? " ✓" : ""}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: T.tm, marginTop: 6 }}>{commForm.perfis.length > 0 ? `${users.filter(u => commForm.perfis.includes(u.role)).length} usuário(s) alcançados` : "Selecione ao menos um perfil"}</div>
          </div>

          {commForm.perfis.includes("parceiro") && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Ou selecione parceiros individuais (opcional)</label>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxHeight: 120, overflowY: "auto", padding: 8, background: T.inp, borderRadius: 6, border: `1px solid ${T.bor}` }}>
                {users.filter(u => u.role === "parceiro").map(p => (
                  <button key={p.id} onClick={() => setCommForm(prev => ({ ...prev, individuais: prev.individuais.includes(p.id) ? prev.individuais.filter(id => id !== p.id) : [...prev.individuais, p.id] }))} style={{ padding: "4px 10px", borderRadius: 14, fontSize: 11, cursor: "pointer", border: `1px solid ${commForm.individuais.includes(p.id) ? T.ac : T.bor}`, background: commForm.individuais.includes(p.id) ? T.ac + "1A" : "transparent", color: commForm.individuais.includes(p.id) ? T.ac : T.t2, fontFamily: "'DM Sans',sans-serif" }}>{p.name}{commForm.individuais.includes(p.id) ? " ✓" : ""}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Mensagem *</label>
            <textarea value={commForm.msg} onChange={e => setCommForm({ ...commForm, msg: e.target.value })} placeholder="Escreva o comunicado..." style={{ width: "100%", padding: "12px 14px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: "none", resize: "vertical", minHeight: 90, boxSizing: "border-box" }} />
          </div>

          {/* Preview */}
          {commForm.titulo && commForm.msg && (
            <div style={{ marginBottom: 16, padding: 14, background: T.inp, borderRadius: 8, border: `1px solid ${T.ac}25` }}>
              <div style={{ fontSize: 10, color: T.ac, textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>👁 Preview da notificação</div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: NOTIF_TYPES.comunicado.color + "1A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>📢</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{commForm.titulo}</div>
                  <div style={{ fontSize: 12, color: T.t2, lineHeight: 1.4 }}>{commForm.msg}</div>
                  <div style={{ fontSize: 10, color: T.tm, marginTop: 4 }}>{commForm.prioridade === "urgente" ? "🚨 Urgente" : commForm.prioridade === "aviso" ? "⚠️ Aviso" : "ℹ️ Informativo"}</div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Btn onClick={() => {
              if (!commForm.titulo || !commForm.msg || commForm.perfis.length === 0) return;
              const targets = commForm.individuais.length > 0 ? commForm.individuais : users.filter(u => commForm.perfis.includes(u.role)).map(u => u.id);
              targets.forEach(para => addNotif(setNotifs, { tipo: "comunicado", titulo: commForm.titulo, msg: commForm.msg, para, de: user.id, link: "notifs" }));
              setCommHist(prev => [{ id: "ch" + Date.now(), titulo: commForm.titulo, msg: commForm.msg, perfis: [...commForm.perfis], dt: new Date().toISOString().replace("T", " ").slice(0, 16), por: user.name, total: targets.length }, ...prev]);
              setCommForm({ titulo: "", msg: "", perfis: [], individuais: [], prioridade: "info" });
              setCommSent(true); setTimeout(() => setCommSent(false), 3000);
            }} disabled={!commForm.titulo || !commForm.msg || commForm.perfis.length === 0}>📤 Enviar Comunicado</Btn>
            {commSent && <span style={{ fontSize: 13, color: T.ok, fontWeight: 600 }}>✓ Comunicado enviado com sucesso!</span>}
          </div>
        </div>

        {/* Communication History */}
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📜 Histórico de Comunicados</h3>
          <div style={{ background: T.bg2, borderRadius: 8, border: `1px solid ${T.bor}`, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Título", "Perfis", "Alcançados", "Enviado por", "Data"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>
                {commHist.map(c => (
                  <tr key={c.id}>
                    <td style={{ ...tdS, fontWeight: 600 }}>{c.titulo}</td>
                    <td style={tdS}><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{c.perfis.map(p => <Badge key={p} type="info">{p}</Badge>)}</div></td>
                    <td style={{ ...tdS, fontFamily: "'Space Mono',monospace", fontWeight: 600, color: T.ac }}>{c.total}</td>
                    <td style={{ ...tdS, fontSize: 12, color: T.t2 }}>{c.por}</td>
                    <td style={{ ...tdS, fontSize: 11, color: T.tm, fontFamily: "'Space Mono',monospace" }}>{c.dt}</td>
                  </tr>
                ))}
                {commHist.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhum comunicado enviado.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>}
      {tab === "usuários" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: T.t2 }}>{users.filter(u => u.role !== "parceiro").length} usuário(s) interno(s)</div>
            <Btn onClick={() => setUserModal(true)}>＋ Adicionar Usuário</Btn>
          </div>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Usuário", "E-mail", "Perfil", "Vínculo", "Status", "Ações"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>{users.filter(u => u.role !== "parceiro").map(u => (
                <tr key={u.id}>
                  <td style={tdS}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: T.ac + "22", color: T.ac, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{u.av || u.name[0]}</div>
                      <span style={{ fontWeight: 600 }}>{u.name}</span>
                    </div>
                  </td>
                  <td style={{ ...tdS, fontSize: 12, color: T.t2 }}>{u.email}</td>
                  <td style={tdS}><Badge type={u.role === "super_admin" ? "accent" : u.role === "executivo" ? "accent" : u.role === "diretor" ? "warning" : "info"}>{RL[u.role]}</Badge></td>
                  <td style={{ ...tdS, fontSize: 12 }}>{u.role === "gerente" ? (users.find(d => d.id === u.dId)?.name || <span style={{ color: T.er, fontSize: 11 }}>⚠ Sem diretor</span>) : u.role === "diretor" ? (users.find(e => e.id === u.eId)?.name || <span style={{ color: T.er, fontSize: 11 }}>⚠ Sem executivo</span>) : <span style={{ color: T.tm }}>—</span>}</td>
                  <td style={tdS}><Badge type="success">Ativo</Badge></td>
                  <td style={tdS}>
                    {u.id === "sa1" ? <span style={{ fontSize: 11, color: T.tm }}>—</span> :
                      delUserConf === u.id ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: T.er }}>Confirmar?</span>
                          <Btn v="danger" sm onClick={() => delUser(u.id)}>Sim</Btn>
                          <Btn v="secondary" sm onClick={() => setDelUserConf(null)}>Não</Btn>
                        </div>
                      ) : (
                        <Btn v="danger" sm onClick={() => setDelUserConf(u.id)}>🗑 Excluir</Btn>
                      )
                    }
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <Modal open={userModal} onClose={() => setUserModal(false)} title="Adicionar Usuário Interno"
            footer={<><Btn v="secondary" onClick={() => setUserModal(false)}>Cancelar</Btn><Btn onClick={addUser} disabled={!uf.name || !uf.email || !uf.pw || (uf.role === "gerente" && !uf.dId) || (uf.role === "diretor" && !uf.eId)}>Adicionar</Btn></>}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Inp label="Nome completo *" value={uf.name} onChange={v => setUf({ ...uf, name: v })} placeholder="Nome" />
              <Inp label="E-mail *" value={uf.email} onChange={v => setUf({ ...uf, email: v })} placeholder="email@somapay.com.br" />
              <Inp label="Senha *" value={uf.pw} onChange={v => setUf({ ...uf, pw: v })} type="password" placeholder="Senha" />
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Perfil *</label>
                <select value={uf.role} onChange={e => setUf({ ...uf, role: e.target.value, dId: "", eId: "" })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                  <option value="gerente">Gerente</option>
                  <option value="diretor">Diretoria</option>
                  <option value="executivo">Executivo</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              {uf.role === "gerente" && (
                <div style={{ gridColumn: "1/-1", padding: 14, background: T.wn + "0A", border: `1px solid ${T.wn}25`, borderRadius: 8 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.wn, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>👤 Diretor Responsável *</label>
                  <select value={uf.dId} onChange={e => setUf({ ...uf, dId: e.target.value })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                    <option value="">Selecione o diretor...</option>
                    {users.filter(u => u.role === "diretor").map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: T.tm, marginTop: 6 }}>ℹ️ Todo gerente deve estar vinculado a um diretor.</div>
                </div>
              )}
              {uf.role === "diretor" && (
                <div style={{ gridColumn: "1/-1", padding: 14, background: T.ac + "0A", border: `1px solid ${T.ac}25`, borderRadius: 8 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.ac, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>🏛️ Executivo Responsável *</label>
                  <select value={uf.eId} onChange={e => setUf({ ...uf, eId: e.target.value })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                    <option value="">Selecione o executivo...</option>
                    {users.filter(u => u.role === "executivo").map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: T.tm, marginTop: 6 }}>ℹ️ Todo diretor deve estar vinculado a um executivo.</div>
                </div>
              )}
            </div>
          </Modal>
        </div>
      )}

      {/* MATERIAIS TAB */}
      {tab === "materiais" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: T.t2 }}>{mats.length} material(is) cadastrado(s)</div>
            <Btn onClick={() => setMatModal(true)}>＋ Adicionar Material</Btn>
          </div>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Tipo", "Título", "Categoria", "Tamanho", "Data", "Ações"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>
                {mats.map(m => (
                  <tr key={m.id}>
                    <td style={tdS}>
                      <div style={{ width: 36, height: 36, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, fontFamily: "'Space Mono',monospace", textTransform: "uppercase", background: (tc[m.tipo] || T.tm) + "22", color: tc[m.tipo] || T.tm }}>{m.tipo}</div>
                    </td>
                    <td style={{ ...tdS, fontWeight: 600 }}>{m.t}</td>
                    <td style={tdS}><Badge type="info">{m.cat}</Badge></td>
                    <td style={{ ...tdS, fontSize: 12, color: T.tm }}>{m.sz}</td>
                    <td style={{ ...tdS, fontSize: 12, color: T.tm }}>{m.dt}</td>
                    <td style={tdS}>
                      {delConf === m.id ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: T.er }}>Confirmar?</span>
                          <Btn v="danger" sm onClick={() => delMat(m.id)}>Sim</Btn>
                          <Btn v="secondary" sm onClick={() => setDelConf(null)}>Não</Btn>
                        </div>
                      ) : (
                        <Btn v="danger" sm onClick={() => setDelConf(m.id)}>🗑 Excluir</Btn>
                      )}
                    </td>
                  </tr>
                ))}
                {mats.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhum material cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>

          <Modal open={matModal} onClose={() => setMatModal(false)} title="Adicionar Material de Apoio"
            footer={<><Btn v="secondary" onClick={() => setMatModal(false)}>Cancelar</Btn><Btn onClick={addMat} disabled={!mf.t}>Adicionar</Btn></>}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <Inp label="Título *" value={mf.t} onChange={v => setMf({ ...mf, t: v })} placeholder="Ex: Manual do Parceiro 2025" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Tipo de Arquivo</label>
                <select value={mf.tipo} onChange={e => setMf({ ...mf, tipo: e.target.value })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                  {["pdf", "xlsx", "docx", "mp4"].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Categoria</label>
                <select value={mf.cat} onChange={e => setMf({ ...mf, cat: e.target.value })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                  {["comercial", "financeiro", "treinamento", "suporte", "legal"].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <Inp label="Tamanho" value={mf.sz} onChange={v => setMf({ ...mf, sz: v })} placeholder="Ex: 2.4 MB" />
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Arquivo</label>
                <div style={{ padding: "20px 14px", background: T.inp, border: `2px dashed ${T.bor}`, borderRadius: 6, textAlign: "center", fontSize: 12, color: T.tm, cursor: "pointer" }}>
                  📎 Clique para anexar arquivo
                </div>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {tab !== "materiais" && <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <Btn onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}>Salvar</Btn>
        {saved && <span style={{ fontSize: 13, color: T.ok }}>✓ Salvo!</span>}
      </div>}
    </div>
  );
}

// ===== FINANCEIRO =====
function fmtBRL(v) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

function FinPage({ comms, setComms, nfes, setNfes, users, notifs, setNotifs }) {
  const { user } = useAuth();
  const isParceiro = user.role === "parceiro";
  const isAdmin = user.role === "super_admin" || user.role === "diretor" || user.role === "executivo";
  const isGerente = user.role === "gerente";
  const [tab, setTab] = useState(isParceiro ? "meusRel" : "relatorios");
  const [commModal, setCommModal] = useState(false);
  const [nfeModal, setNfeModal] = useState(false);
  const [cf, setCf] = useState({ pId: "", titulo: "", periodo: "", valor: "" });
  const [nf, setNf] = useState({ num: "", valor: "", arq: "" });

  // Filter data by role
  const myComms = isParceiro ? comms.filter(r => r.pId === user.id) :
    isGerente ? comms.filter(r => { const p = users.find(u => u.id === r.pId); return p && p.gId === user.id; }) : comms;
  const myNfes = isParceiro ? nfes.filter(n => n.pId === user.id) :
    isGerente ? nfes.filter(n => { const p = users.find(u => u.id === n.pId); return p && p.gId === user.id; }) : nfes;

  const parceiros = isGerente ? users.filter(u => u.role === "parceiro" && u.gId === user.id) : users.filter(u => u.role === "parceiro");

  const addComm = () => {
    if (!cf.pId || !cf.titulo || !cf.periodo || !cf.valor) return;
    const p = users.find(u => u.id === cf.pId);
    setComms(prev => [...prev, {
      id: "c" + Date.now(), pId: cf.pId, titulo: cf.titulo, periodo: cf.periodo,
      valor: parseFloat(cf.valor) || 0, arq: `comissao_${cf.periodo.replace("/", "_")}_${(p?.name || "").split(" ")[0].toLowerCase()}.pdf`,
      dt: new Date().toISOString().split("T")[0], by: user.id
    }]);
    setCommModal(false);
    setCf({ pId: "", titulo: "", periodo: "", valor: "" });
    // Notify parceiro about commission report
    addNotif(setNotifs, { tipo: "financeiro", titulo: "Relatório de comissão", msg: `Novo relatório de comissão: ${cf.titulo} — R$ ${parseFloat(cf.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`, para: cf.pId, de: user.id, link: "fin" });
  };

  const addNfe = () => {
    if (!nf.num || !nf.valor) return;
    setNfes(prev => [...prev, {
      id: "nf" + Date.now(), pId: user.id, num: nf.num,
      valor: parseFloat(nf.valor) || 0, arq: `${nf.num.replace(/\s/g, "_").toLowerCase()}.pdf`,
      dt: new Date().toISOString().split("T")[0], st: "pendente", pgDt: null
    }]);
    setNfeModal(false);
    setNf({ num: "", valor: "", arq: "" });
    // Notify gerente about NFe
    if (user.gId) {
      addNotif(setNotifs, { tipo: "financeiro", titulo: "NFe recebida", msg: `Parceiro ${user.name} enviou ${nf.num} — R$ ${parseFloat(nf.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`, para: user.gId, de: user.id, link: "fin" });
    }
  };

  const markPago = (nfeId) => {
    const nfe = nfes.find(n => n.id === nfeId);
    setNfes(prev => prev.map(n => n.id === nfeId ? { ...n, st: "pago", pgDt: new Date().toISOString().split("T")[0] } : n));
    // Notify parceiro about payment
    if (nfe?.pId) {
      addNotif(setNotifs, { tipo: "financeiro", titulo: "NFe paga", msg: `Sua ${nfe.num} foi marcada como paga.`, para: nfe.pId, de: user.id, link: "fin" });
    }
  };

  const thStyle = { textAlign: "left", padding: "12px 14px", fontSize: 10, fontWeight: 600, color: T.tm, textTransform: "uppercase", borderBottom: `1px solid ${T.bor}`, background: T.bg2 };
  const tdStyle = { padding: "12px 14px", fontSize: 13, borderBottom: `1px solid ${T.bor}` };

  // Stats
  const totalComm = myComms.reduce((s, r) => s + r.valor, 0);
  const totalNfePend = myNfes.filter(n => n.st === "pendente").reduce((s, n) => s + n.valor, 0);
  const totalNfePago = myNfes.filter(n => n.st === "pago").reduce((s, n) => s + n.valor, 0);

  const adminTabs = ["relatorios", "nfes"];
  const parceiroTabs = ["meusRel", "minhasNfes"];
  const tabs = isParceiro ? parceiroTabs : adminTabs;
  const tabLabels = { relatorios: "Relatórios de Comissão", nfes: "NFes Recebidas", meusRel: "Meus Relatórios", minhasNfes: "Minhas NFes" };

  return (
    <div>
      {/* Stats cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 18, borderLeft: `3px solid ${T.ac}` }}>
          <div style={{ fontSize: 11, color: T.tm, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{isParceiro ? "Total Comissões" : "Comissões Enviadas"}</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Space Mono',monospace" }}>{fmtBRL(totalComm)}</div>
          <div style={{ fontSize: 11, color: T.t2, marginTop: 4 }}>{myComms.length} relatório{myComms.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 18, borderLeft: `3px solid ${T.wn}` }}>
          <div style={{ fontSize: 11, color: T.tm, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>NFes Pendentes</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: T.wn }}>{fmtBRL(totalNfePend)}</div>
          <div style={{ fontSize: 11, color: T.t2, marginTop: 4 }}>{myNfes.filter(n => n.st === "pendente").length} pendente{myNfes.filter(n => n.st === "pendente").length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 18, borderLeft: `3px solid ${T.ok}` }}>
          <div style={{ fontSize: 11, color: T.tm, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>NFes Pagas</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: T.ok }}>{fmtBRL(totalNfePago)}</div>
          <div style={{ fontSize: 11, color: T.t2, marginTop: 4 }}>{myNfes.filter(n => n.st === "pago").length} paga{myNfes.filter(n => n.st === "pago").length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.bor}`, marginBottom: 20 }}>
        {tabs.map(t => <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", border: "none", background: "none", color: tab === t ? T.ac : T.tm, fontFamily: "'DM Sans',sans-serif", borderBottom: `2px solid ${tab === t ? T.ac : "transparent"}`, marginBottom: -1 }}>{tabLabels[t]}</button>)}
      </div>

      {/* === ADMIN/GERENTE: Relatórios de Comissão === */}
      {(tab === "relatorios") && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
            <Btn onClick={() => setCommModal(true)}>📤 Enviar Relatório</Btn>
          </div>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Parceiro", "Título", "Período", "Valor", "Arquivo", "Data", "Ações"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {myComms.map(r => {
                  const p = users.find(u => u.id === r.pId);
                  return (
                    <tr key={r.id}>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.ac + "22", color: T.ac, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{p?.av || "?"}</div>
                          <div><div style={{ fontWeight: 600, fontSize: 12 }}>{p?.name || "—"}</div><div style={{ fontSize: 10, color: T.tm }}>{p?.empresa || ""}</div></div>
                        </div>
                      </td>
                      <td style={tdStyle}>{r.titulo}</td>
                      <td style={tdStyle}><Badge type="info">{r.periodo}</Badge></td>
                      <td style={{ ...tdStyle, fontFamily: "'Space Mono',monospace", fontWeight: 600 }}>{fmtBRL(r.valor)}</td>
                      <td style={{ ...tdStyle, fontSize: 11, color: T.t2 }}>📄 {r.arq}</td>
                      <td style={{ ...tdStyle, fontSize: 11, color: T.tm }}>{r.dt}</td>
                      <td style={tdStyle}><Btn v="secondary" sm>⬇ Download</Btn></td>
                    </tr>
                  );
                })}
                {myComms.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhum relatório enviado.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === ADMIN/GERENTE: NFes Recebidas === */}
      {(tab === "nfes") && (
        <div>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Parceiro", "Nº NFe", "Valor", "Arquivo", "Data Envio", "Status", "Dt Pagamento", "Ações"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {myNfes.map(n => {
                  const p = users.find(u => u.id === n.pId);
                  return (
                    <tr key={n.id}>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.ac + "22", color: T.ac, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{p?.av || "?"}</div>
                          <div><div style={{ fontWeight: 600, fontSize: 12 }}>{p?.name || "—"}</div><div style={{ fontSize: 10, color: T.tm }}>{p?.empresa || ""}</div></div>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "'Space Mono',monospace", fontWeight: 600 }}>{n.num}</td>
                      <td style={{ ...tdStyle, fontFamily: "'Space Mono',monospace", fontWeight: 600 }}>{fmtBRL(n.valor)}</td>
                      <td style={{ ...tdStyle, fontSize: 11, color: T.t2 }}>📄 {n.arq}</td>
                      <td style={{ ...tdStyle, fontSize: 11, color: T.tm }}>{n.dt}</td>
                      <td style={tdStyle}>{n.st === "pago" ? <Badge type="success">✓ Pago</Badge> : <Badge type="warning">⏳ Pendente</Badge>}</td>
                      <td style={{ ...tdStyle, fontSize: 11, color: T.tm }}>{n.pgDt || "—"}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Btn v="secondary" sm>⬇</Btn>
                          {n.st === "pendente" && <Btn v="success" sm onClick={() => markPago(n.id)}>💰 Pagar</Btn>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {myNfes.length === 0 && <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhuma NFe recebida.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === PARCEIRO: Meus Relatórios === */}
      {(tab === "meusRel") && (
        <div>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Título", "Período", "Valor", "Arquivo", "Data", "Ações"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {myComms.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{r.titulo}</td>
                    <td style={tdStyle}><Badge type="info">{r.periodo}</Badge></td>
                    <td style={{ ...tdStyle, fontFamily: "'Space Mono',monospace", fontWeight: 600, color: T.ok }}>{fmtBRL(r.valor)}</td>
                    <td style={{ ...tdStyle, fontSize: 11, color: T.t2 }}>📄 {r.arq}</td>
                    <td style={{ ...tdStyle, fontSize: 11, color: T.tm }}>{r.dt}</td>
                    <td style={tdStyle}><Btn v="secondary" sm>⬇ Download</Btn></td>
                  </tr>
                ))}
                {myComms.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhum relatório disponível.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === PARCEIRO: Minhas NFes === */}
      {(tab === "minhasNfes") && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
            <Btn onClick={() => setNfeModal(true)}>📤 Enviar NFe</Btn>
          </div>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Nº NFe", "Valor", "Arquivo", "Data Envio", "Status", "Dt Pagamento"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {myNfes.map(n => (
                  <tr key={n.id}>
                    <td style={{ ...tdStyle, fontFamily: "'Space Mono',monospace", fontWeight: 600 }}>{n.num}</td>
                    <td style={{ ...tdStyle, fontFamily: "'Space Mono',monospace", fontWeight: 600 }}>{fmtBRL(n.valor)}</td>
                    <td style={{ ...tdStyle, fontSize: 11, color: T.t2 }}>📄 {n.arq}</td>
                    <td style={{ ...tdStyle, fontSize: 11, color: T.tm }}>{n.dt}</td>
                    <td style={tdStyle}>{n.st === "pago" ? <Badge type="success">✓ Pago</Badge> : <Badge type="warning">⏳ Pendente</Badge>}</td>
                    <td style={{ ...tdStyle, fontSize: 11, color: n.pgDt ? T.ok : T.tm }}>{n.pgDt || "Aguardando"}</td>
                  </tr>
                ))}
                {myNfes.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhuma NFe enviada. Clique em "Enviar NFe".</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Enviar Relatório de Comissão */}
      <Modal open={commModal} onClose={() => setCommModal(false)} title="Enviar Relatório de Comissão"
        footer={<><Btn v="secondary" onClick={() => setCommModal(false)}>Cancelar</Btn><Btn onClick={addComm} disabled={!cf.pId || !cf.titulo || !cf.periodo || !cf.valor}>Enviar</Btn></>}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1/-1", marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Parceiro *</label>
            <select value={cf.pId} onChange={e => setCf({ ...cf, pId: e.target.value })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
              <option value="">Selecione o parceiro...</option>
              {parceiros.map(p => <option key={p.id} value={p.id}>{p.name} — {p.empresa || "Sem empresa"}</option>)}
            </select>
          </div>
          <Inp label="Título *" value={cf.titulo} onChange={v => setCf({ ...cf, titulo: v })} placeholder="Ex: Comissão Fevereiro 2025" />
          <Inp label="Período *" value={cf.periodo} onChange={v => setCf({ ...cf, periodo: v })} placeholder="Ex: Fev/2025" />
          <Inp label="Valor (R$) *" value={cf.valor} onChange={v => setCf({ ...cf, valor: v })} type="number" placeholder="0.00" />
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Arquivo</label>
            <div style={{ padding: "20px 14px", background: T.inp, border: `2px dashed ${T.bor}`, borderRadius: 6, textAlign: "center", fontSize: 12, color: T.tm, cursor: "pointer" }}>
              📎 Clique para anexar PDF
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal: Enviar NFe */}
      <Modal open={nfeModal} onClose={() => setNfeModal(false)} title="Enviar Nota Fiscal (NFe)"
        footer={<><Btn v="secondary" onClick={() => setNfeModal(false)}>Cancelar</Btn><Btn onClick={addNfe} disabled={!nf.num || !nf.valor}>Enviar NFe</Btn></>}>
        <div style={{ marginBottom: 16, padding: 12, background: T.inp, borderRadius: 6, fontSize: 12, color: T.t2 }}>
          📋 Envie a nota fiscal referente à comissão do período. O pagamento será processado após validação.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Inp label="Número da NFe *" value={nf.num} onChange={v => setNf({ ...nf, num: v })} placeholder="Ex: NFe 001234" />
          <Inp label="Valor (R$) *" value={nf.valor} onChange={v => setNf({ ...nf, valor: v })} type="number" placeholder="0.00" />
          <div style={{ gridColumn: "1/-1", marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Arquivo da NFe</label>
            <div style={{ padding: "24px 14px", background: T.inp, border: `2px dashed ${T.bor}`, borderRadius: 6, textAlign: "center", fontSize: 12, color: T.tm, cursor: "pointer" }}>
              📎 Clique para anexar o PDF da NFe
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ===== NOTIFICAÇÕES BELL =====
function NotifBell({ notifs, setNotifs, userId, setPg }) {
  const [open, setOpen] = useState(false);
  const mine = notifs.filter(n => n.para === userId || n.para === "*");
  const unread = mine.filter(n => !n.lido).length;
  const latest = mine.slice(0, 8);
  const markRead = (id) => setNotifs(prev => prev.map(n => n.id === id ? { ...n, lido: true } : n));
  const markAllRead = () => setNotifs(prev => prev.map(n => (n.para === userId || n.para === "*") ? { ...n, lido: true } : n));

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: T.t2, position: "relative", padding: "6px 8px", borderRadius: 8, transition: "all 0.2s" }}
        onMouseEnter={e => e.currentTarget.style.background = T.ac + "1A"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
        🔔
        {unread > 0 && <span style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, background: T.er, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", fontFamily: "'Space Mono',monospace", animation: "pulse 2s infinite" }}>{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && <>
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 998 }} />
        <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, width: 380, maxHeight: 480, background: T.card, border: `1px solid ${T.bor}`, borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", zIndex: 999, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.bor}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>🔔 Notificações {unread > 0 && <span style={{ fontSize: 11, color: T.ac, fontWeight: 600, marginLeft: 6 }}>{unread} nova{unread > 1 ? "s" : ""}</span>}</div>
            {unread > 0 && <button onClick={markAllRead} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: T.ac, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>✓ Marcar todas</button>}
          </div>
          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", maxHeight: 360 }}>
            {latest.length === 0 && <div style={{ padding: 40, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhuma notificação</div>}
            {latest.map(n => {
              const nt = NOTIF_TYPES[n.tipo] || NOTIF_TYPES.sistema;
              return (
                <div key={n.id} onClick={() => { markRead(n.id); setPg(n.link || "notifs"); setOpen(false); }}
                  style={{ padding: "12px 16px", borderBottom: `1px solid ${T.bor}22`, cursor: "pointer", background: n.lido ? "transparent" : nt.color + "08", transition: "background 0.15s", display: "flex", gap: 10, alignItems: "flex-start" }}
                  onMouseEnter={e => e.currentTarget.style.background = T.ac + "0A"} onMouseLeave={e => e.currentTarget.style.background = n.lido ? "transparent" : nt.color + "08"}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: nt.color + "1A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{nt.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: n.lido ? T.t2 : T.txt }}>{n.titulo}</span>
                      {!n.lido && <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.ac, flexShrink: 0 }} />}
                    </div>
                    <div style={{ fontSize: 11, color: T.tm, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.msg}</div>
                    <div style={{ fontSize: 10, color: T.tm, marginTop: 4, fontFamily: "'Space Mono',monospace" }}>{n.dt}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Footer */}
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${T.bor}`, textAlign: "center" }}>
            <button onClick={() => { setPg("notifs"); setOpen(false); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.ac, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>Ver todas as notificações →</button>
          </div>
        </div>
      </>}
      <style>{`@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }`}</style>
    </div>
  );
}

// ===== CENTRAL DE NOTIFICAÇÕES =====
function NotifsPage({ notifs, setNotifs, users, userId }) {
  const [filtro, setFiltro] = useState("todas");
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const mine = notifs.filter(n => n.para === userId || n.para === "*");
  const filtered = mine.filter(n => {
    if (filtro === "naoLidas" && n.lido) return false;
    if (filtro === "lidas" && !n.lido) return false;
    if (tipoFiltro !== "todos" && n.tipo !== tipoFiltro) return false;
    return true;
  });
  const unread = mine.filter(n => !n.lido).length;
  const markRead = (id) => setNotifs(prev => prev.map(n => n.id === id ? { ...n, lido: true } : n));
  const markAllRead = () => setNotifs(prev => prev.map(n => (n.para === userId || n.para === "*") ? { ...n, lido: true } : n));
  const delNotif = (id) => setNotifs(prev => prev.filter(n => n.id !== id));

  // Group by date
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const groups = {};
  filtered.forEach(n => {
    const d = n.dt.split(" ")[0];
    const label = d === today ? "Hoje" : d === yesterday ? "Ontem" : d;
    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  });

  return (
    <div>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { l: "Total", v: mine.length, c: T.inf, ico: "📬" },
          { l: "Não Lidas", v: unread, c: T.ac, ico: "🔴" },
          { l: "Lidas", v: mine.length - unread, c: T.ok, ico: "✅" },
          { l: "Comunicados", v: mine.filter(n => n.tipo === "comunicado").length, c: T.wn, ico: "📢" },
        ].map((s, i) => (
          <div key={i} style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 16, borderLeft: `3px solid ${s.c}` }}>
            <div style={{ fontSize: 11, color: T.tm, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{s.ico} {s.l}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Filters bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 4, background: T.inp, borderRadius: 8, padding: 3, border: `1px solid ${T.bor}` }}>
          {[{ k: "todas", l: "Todas" }, { k: "naoLidas", l: "Não Lidas" }, { k: "lidas", l: "Lidas" }].map(f => (
            <button key={f.k} onClick={() => setFiltro(f.k)} style={{ padding: "6px 14px", borderRadius: 5, border: "none", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", background: filtro === f.k ? T.ac : "transparent", color: filtro === f.k ? "#fff" : T.tm }}>{f.l}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} style={{ padding: "7px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 12 }}>
            <option value="todos">Todos os tipos</option>
            {Object.entries(NOTIF_TYPES).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
          {unread > 0 && <Btn sm onClick={markAllRead}>✓ Marcar todas como lidas</Btn>}
        </div>
      </div>

      {/* Notification list */}
      {Object.keys(groups).length === 0 && (
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 12, padding: 60, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Nenhuma notificação</div>
          <div style={{ fontSize: 12, color: T.tm }}>Você será notificado sobre atualizações em indicações, financeiro e comunicados.</div>
        </div>
      )}
      {Object.entries(groups).map(([label, items]) => (
        <div key={label} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.tm, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, paddingLeft: 4 }}>{label}</div>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            {items.map((n, idx) => {
              const nt = NOTIF_TYPES[n.tipo] || NOTIF_TYPES.sistema;
              const sender = users.find(u => u.id === n.de);
              return (
                <div key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", borderBottom: idx < items.length - 1 ? `1px solid ${T.bor}22` : "none", background: n.lido ? "transparent" : nt.color + "06", transition: "background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = T.ac + "08"} onMouseLeave={e => e.currentTarget.style.background = n.lido ? "transparent" : nt.color + "06"}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: nt.color + "1A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{nt.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {!n.lido && <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.ac, flexShrink: 0 }} />}
                        <span style={{ fontSize: 13, fontWeight: 600, color: n.lido ? T.t2 : T.txt }}>{n.titulo}</span>
                        <Badge type={n.tipo === "financeiro" ? "warning" : n.tipo === "status" ? "info" : n.tipo === "liberacao" ? "success" : n.tipo === "comunicado" ? "accent" : "muted"}>{nt.label}</Badge>
                      </div>
                      <span style={{ fontSize: 10, color: T.tm, fontFamily: "'Space Mono',monospace", flexShrink: 0 }}>{n.dt.split(" ")[1] || n.dt}</span>
                    </div>
                    <div style={{ fontSize: 12, color: T.t2, lineHeight: 1.5, marginBottom: 4 }}>{n.msg}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: T.tm }}>{sender ? `De: ${sender.name}` : ""}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {!n.lido && <button onClick={() => markRead(n.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: T.ac, fontFamily: "'DM Sans',sans-serif", fontWeight: 500 }}>✓ Lida</button>}
                        <button onClick={() => delNotif(n.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: T.er, fontFamily: "'DM Sans',sans-serif", fontWeight: 500 }}>🗑</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ===== APP =====
const RL = { super_admin: "Super Admin", executivo: "Executivo", diretor: "Diretoria", gerente: "Gerente", parceiro: "Parceiro" };
const NAV = [
  { id: "dash", l: "Dashboard", r: ["super_admin", "executivo", "diretor", "gerente", "parceiro"] },
  { id: "kanban", l: "Kanban", r: ["super_admin", "executivo", "diretor", "gerente"] },
  { id: "inds", l: "Minhas Indicações", r: ["parceiro"] },
  { id: "parcs", l: "Parceiros", r: ["super_admin", "executivo", "diretor", "gerente"] },
  { id: "fin", l: "Financeiro", r: ["super_admin", "executivo", "diretor", "gerente", "parceiro"] },
  { id: "mats", l: "Material de Apoio", r: ["super_admin", "executivo", "diretor", "gerente", "parceiro"] },
  { id: "notifs", l: "Notificações", r: ["super_admin", "executivo", "diretor", "gerente", "parceiro"] },
  { id: "cfg", l: "Configurações", r: ["super_admin"] },
];
const TIT = { dash: "Dashboard", kanban: "Pipeline de Indicações", inds: "Minhas Indicações", parcs: "Parceiros Indicadores", fin: "Financeiro", mats: "Material de Apoio", notifs: "Central de Notificações", cfg: "Configurações" };
const EMO = { dash: "📊", kanban: "📋", inds: "🏢", parcs: "👥", fin: "💰", mats: "📁", notifs: "🔔", cfg: "⚙️" };

export default function App() {
  const [user, setUser] = useState(null);
  const [pg, setPg] = useState("dash");
  const [users, setUsers] = useState([...ALL_USERS]);
  const [inds, setInds] = useState([...INDS0]);
  const [comms, setComms] = useState([...COMMS0]);
  const [nfes, setNfes] = useState([...NFES0]);
  const [mats, setMats] = useState([...MATS]);
  const [notifs, setNotifs] = useState([...NOTIFS0]);
  const [travaDias, setTravaDias] = useState(90);
  const [theme, setThemeState] = useState(null); // null = not chosen yet
  const [collapsed, setCollapsed] = useState(false);
  const [, forceUpdate] = useState(0);

  const applyTheme = (mode) => {
    setTheme(mode);
    setThemeState(mode);
    forceUpdate(n => n + 1);
  };

  // Theme chooser screen (after login, before dashboard)
  if (user && !theme) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0e1a", fontFamily: "'DM Sans',sans-serif", color: "#f1f5f9" }}>
        <style>{fonts}</style>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 80% 60% at 50% 0%, #f9731614 0%, transparent 60%)` }} />
        <div style={{ position: "relative", textAlign: "center", maxWidth: 520, padding: "0 20px" }}>
          <h1 style={{ fontFamily: "'Space Mono',monospace", fontSize: 26, fontWeight: 700, color: "#f97316", marginBottom: 6 }}>SOMAPAY</h1>
          <p style={{ fontSize: 12, color: "#64748b", letterSpacing: 2, textTransform: "uppercase", marginBottom: 32 }}>Escolha sua aparência</p>
          <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 28 }}>Olá, <strong style={{ color: "#f1f5f9" }}>{user.name}</strong>! Como prefere usar o portal?</p>
          <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
            {/* Dark */}
            <button onClick={() => applyTheme("dark")} style={{ cursor: "pointer", border: "2px solid #1e2d4a", borderRadius: 16, overflow: "hidden", background: "none", padding: 0, transition: "border-color 0.2s", width: 220 }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#f97316"} onMouseLeave={e => e.currentTarget.style.borderColor = "#1e2d4a"}>
              <div style={{ background: "#0a0e1a", padding: 20 }}>
                <div style={{ background: "#111827", borderRadius: 8, padding: 14, border: "1px solid #1e2d4a", marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f97316" }} />
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: "#1e2d4a" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ flex: 1, height: 24, borderRadius: 4, background: "#1a2235" }} />
                    <div style={{ flex: 1, height: 24, borderRadius: 4, background: "#1a2235" }} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["#10b981", "#3b82f6", "#f59e0b"].map(c => <div key={c} style={{ flex: 1, height: 6, borderRadius: 3, background: c + "44" }} />)}
                </div>
              </div>
              <div style={{ padding: "12px 0", background: "#111827", borderTop: "1px solid #1e2d4a" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", fontFamily: "'DM Sans',sans-serif" }}>🌙 Modo Escuro</span>
              </div>
            </button>
            {/* Light */}
            <button onClick={() => applyTheme("light")} style={{ cursor: "pointer", border: "2px solid #e2e8f0", borderRadius: 16, overflow: "hidden", background: "none", padding: 0, transition: "border-color 0.2s", width: 220 }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#f97316"} onMouseLeave={e => e.currentTarget.style.borderColor = "#e2e8f0"}>
              <div style={{ background: "#f1f5f9", padding: 20 }}>
                <div style={{ background: "#ffffff", borderRadius: 8, padding: 14, border: "1px solid #e2e8f0", marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f97316" }} />
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: "#e2e8f0" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ flex: 1, height: 24, borderRadius: 4, background: "#f8fafc" }} />
                    <div style={{ flex: 1, height: 24, borderRadius: 4, background: "#f8fafc" }} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["#10b981", "#3b82f6", "#f59e0b"].map(c => <div key={c} style={{ flex: 1, height: 6, borderRadius: 3, background: c + "44" }} />)}
                </div>
              </div>
              <div style={{ padding: "12px 0", background: "#ffffff", borderTop: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", fontFamily: "'DM Sans',sans-serif" }}>☀️ Modo Claro</span>
              </div>
            </button>
          </div>
          <p style={{ fontSize: 11, color: "#64748b", marginTop: 20 }}>Você pode alterar depois no menu lateral</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login onLogin={u => { setUser(u); setPg("dash"); }} />;

  const nav = NAV.filter(n => n.r.includes(user.role));
  const sW = collapsed ? 64 : 240;

  return (
    <AuthCtx.Provider value={{ user }}>
      <style>{fonts}</style>
      <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'DM Sans',sans-serif", background: T.bg, color: T.txt }}>
        <aside style={{ width: sW, background: T.bg2, borderRight: `1px solid ${T.bor}`, display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100, transition: "width 0.2s ease", overflow: "hidden" }}>
          {/* Logo + collapse toggle */}
          <div style={{ padding: collapsed ? "20px 0" : "20px 18px", borderBottom: `1px solid ${T.bor}`, display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between" }}>
            {collapsed
              ? <button onClick={() => setCollapsed(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: T.ac, fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>S</button>
              : <>
                <div>
                  <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 18, fontWeight: 700, color: T.ac }}>SOMAPAY</div>
                  <div style={{ fontSize: 9, color: T.tm, letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>Portal Parceiros</div>
                </div>
                <button onClick={() => setCollapsed(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: T.tm, padding: 4 }}>◀</button>
              </>
            }
          </div>
          {/* Nav */}
          <nav style={{ flex: 1, padding: collapsed ? "12px 6px" : "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
            {nav.map(n => (
              <button key={n.id} onClick={() => setPg(n.id)} title={collapsed ? n.l : undefined}
                style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: collapsed ? 0 : 10, padding: collapsed ? "10px 0" : "10px 12px", borderRadius: 6, color: pg === n.id ? T.ac : T.t2, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "none", background: pg === n.id ? T.ac + "1A" : "transparent", width: "100%", textAlign: "left", fontFamily: "'DM Sans',sans-serif" }}>
                <span style={{ fontSize: collapsed ? 18 : 13 }}>{EMO[n.id]}</span>{!collapsed && <span>{n.l}</span>}
              </button>
            ))}
          </nav>
          {/* User + theme toggle + logout */}
          <div style={{ padding: collapsed ? "10px 6px" : "14px 10px", borderTop: `1px solid ${T.bor}` }}>
            {!collapsed && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: T.ac + "22", color: T.ac, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{user.av || user.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
                  <div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase" }}>{RL[user.role]}</div>
                </div>
              </div>
            )}
            {/* Theme toggle */}
            <button onClick={() => applyTheme(theme === "dark" ? "light" : "dark")} title="Alternar tema"
              style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 10, padding: collapsed ? "10px 0" : "10px 12px", borderRadius: 6, color: T.t2, fontSize: 13, cursor: "pointer", border: "none", background: "transparent", width: "100%", textAlign: "left", fontFamily: "'DM Sans',sans-serif", marginTop: 4 }}>
              <span>{theme === "dark" ? "☀️" : "🌙"}</span>{!collapsed && <span>{theme === "dark" ? "Modo Claro" : "Modo Escuro"}</span>}
            </button>
            <button onClick={() => { setUser(null); setThemeState(null); }} title="Sair"
              style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 10, padding: collapsed ? "10px 0" : "10px 12px", borderRadius: 6, color: T.t2, fontSize: 13, cursor: "pointer", border: "none", background: "transparent", width: "100%", textAlign: "left", fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>
              🚪 {!collapsed && "Sair"}
            </button>
          </div>
        </aside>
        <main style={{ flex: 1, marginLeft: sW, minHeight: "100vh", transition: "margin-left 0.2s ease" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px", borderBottom: `1px solid ${T.bor}`, background: T.bg2, position: "sticky", top: 0, zIndex: 50 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>{TIT[pg]}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <NotifBell notifs={notifs} setNotifs={setNotifs} userId={user.id} setPg={setPg} />
              <Badge type="success">● HubSpot</Badge>
            </div>
          </div>
          <div style={{ padding: "24px 28px" }}>
            {pg === "dash" && <Dash inds={inds} users={users} comms={comms} nfes={nfes} />}
            {pg === "kanban" && <KanbanPage inds={inds} setInds={setInds} users={users} travaDias={travaDias} notifs={notifs} setNotifs={setNotifs} />}
            {pg === "inds" && <MinhasInd inds={inds} setInds={setInds} notifs={notifs} setNotifs={setNotifs} users={users} />}
            {pg === "parcs" && <ParcPage users={users} setUsers={setUsers} inds={inds} />}
            {pg === "fin" && <FinPage comms={comms} setComms={setComms} nfes={nfes} setNfes={setNfes} users={users} notifs={notifs} setNotifs={setNotifs} />}
            {pg === "mats" && <MatsPage mats={mats} />}
            {pg === "notifs" && <NotifsPage notifs={notifs} setNotifs={setNotifs} users={users} userId={user.id} />}
            {pg === "cfg" && <CfgPage mats={mats} setMats={setMats} users={users} setUsers={setUsers} travaDias={travaDias} setTravaDias={setTravaDias} notifs={notifs} setNotifs={setNotifs} />}
          </div>
        </main>
      </div>
    </AuthCtx.Provider>
  );
}
