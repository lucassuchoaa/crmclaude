import { useState, useEffect, useRef, createContext, useContext, useCallback } from "react";
import { authApi, usersApi, indicationsApi, commissionsApi, nfesApi, materialsApi, notificationsApi, hubspotApi, groupsApi, cnpjAgentApi, diretoriaApi, whatsappApi, conveniosApi, setTokens, clearTokens } from "./services/api";
import { useBreakpoint, responsive } from "./hooks/useBreakpoint";

const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

// User data loaded from API - no passwords in frontend code
const ALL_USERS_INITIAL = [];

// Transform API user data to match frontend structure
const transformUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  av: u.avatar || u.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase(),
  empresa: u.empresa,
  tel: u.tel,
  cnpj: u.cnpj,
  comTipo: u.com_tipo,
  comVal: u.com_val,
  eId: u.role === 'diretor' ? u.manager_id : undefined,
  dId: u.role === 'gerente' ? u.manager_id : undefined,
  gId: u.role === 'parceiro' ? u.manager_id : undefined,
  mustChangePassword: !!u.must_change_password,
  lastLogin: u.last_login_at,
});

// Transform API indication data to match frontend structure
const transformIndication = (ind) => {
  // Parse notes JSON for extra data stored there
  let notesData = {};
  try {
    if (ind.notes) notesData = JSON.parse(ind.notes);
  } catch {
    notesData = {};
  }

  return {
    id: ind.id,
    emp: ind.nome_fantasia || ind.razao_social,
    cnpj: ind.cnpj,
    cont: ind.contato_nome,
    tel: ind.contato_telefone,
    em: ind.contato_email,
    nf: notesData.nf || ind.num_funcionarios || ind.value,
    st: notesData.kanbSt || mapStatusToKanban(ind.status),
    pId: ind.owner_id,
    gId: ind.manager_id,
    hsId: notesData.hsId || ind.hubspot_id,
    hsSt: notesData.hsSt || ind.hubspot_status,
    lib: notesData.lib || ind.liberacao_status,
    libDt: notesData.libDt || ind.liberacao_data,
    libExp: notesData.libExp || ind.liberacao_expiry,
    dt: ind.created_at?.split('T')[0] || ind.created_at,
    obs: typeof ind.notes === 'string' && !ind.notes.startsWith('{') ? ind.notes : '',
    razao: ind.razao_social,
    fantasia: ind.nome_fantasia,
    capital: notesData.capital || (ind.capital ? formatCapital(ind.capital) : null),
    abertura: notesData.abertura || ind.abertura,
    cnae: notesData.cnae || ind.cnae,
    endereco: notesData.endereco || ind.endereco,
    hubspotAnalysis: (() => { try { return ind.hubspot_analysis ? JSON.parse(ind.hubspot_analysis) : null; } catch { return null; } })(),
    hist: [],
  };
};

// Map DB status to Kanban status (fallback if kanbSt not in notes)
const mapStatusToKanban = (dbStatus) => {
  const map = {
    'novo': 'nova',
    'em_contato': 'analise',
    'proposta': 'docs',
    'negociacao': 'aprovado',
    'fechado': 'ativo',
    'perdido': 'recusado',
  };
  return map[dbStatus] || 'nova';
};

// Map Kanban status back to DB status
const mapKanbanToDb = (kanbSt) => {
  const map = {
    'nova': 'novo',
    'analise': 'em_contato',
    'prospeccao': 'em_contato',
    'docs': 'proposta',
    'aprovado': 'negociacao',
    'implant': 'negociacao',
    'ativo': 'fechado',
    'recusado': 'perdido',
  };
  return map[kanbSt] || 'novo';
};

// Build notes JSON preserving existing data + updating kanban status
const buildNotesJson = (ind, updates = {}) => {
  let notesData = {};
  try { if (ind.obs && ind.obs.startsWith('{')) notesData = JSON.parse(ind.obs); } catch {}
  return JSON.stringify({ ...notesData, kanbSt: ind.st, ...updates });
};

// Helper to update indication via API (fire-and-forget with local state update)
const updateIndApi = (id, data) => {
  indicationsApi.update(id, data).catch(e => console.error("Erro ao atualizar indicação:", e));
};

const formatCapital = (val) => {
  if (typeof val === 'number') return val.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  return val;
};

const KCOLS = [
  { id: "nova", label: "Nova Indicação", co: "#6366f1" },
  { id: "analise", label: "Em Análise", co: "#f59e0b" },
  { id: "prospeccao", label: "Em Prospecção", co: "#e879f9" },
  { id: "docs", label: "Documentação", co: "#3b82f6" },
  { id: "aprovado", label: "Aprovado", co: "#10b981" },
  { id: "implant", label: "Implantação", co: "#8b5cf6" },
  { id: "ativo", label: "Ativo", co: "#059669" },
  { id: "recusado", label: "Recusado", co: "#ef4444" },
];

// Data is loaded from API - no hardcoded sensitive data

const NOTIF_TYPES = {
  status: { emoji: "📋", label: "Status", color: "#6366f1" },
  financeiro: { emoji: "💰", label: "Financeiro", color: "#f59e0b" },
  liberacao: { emoji: "🔓", label: "Liberação", color: "#10b981" },
  comunicado: { emoji: "📢", label: "Comunicado", color: "#f97316" },
  sistema: { emoji: "⚙️", label: "Sistema", color: "#3b82f6" },
};

const DEFAULT_CADENCE = [
  { id: "cad_status_kanban", ev: "Status alterado (Kanban)", dest: "Parceiro", tipo: "status", ativo: true },
  { id: "cad_indicacao_ativa", ev: "Indicação ativa ou recusada", dest: "Superior hierárquico", tipo: "status", ativo: true },
  { id: "cad_liberacao", ev: "Liberação/Bloqueio", dest: "Parceiro", tipo: "liberacao", ativo: true },
  { id: "cad_interacao", ev: "Nova interação/nota", dest: "Parceiro", tipo: "sistema", ativo: true },
  { id: "cad_comissao", ev: "Relatório de comissão enviado", dest: "Parceiro", tipo: "financeiro", ativo: true },
  { id: "cad_nfe_enviada", ev: "NFe enviada", dest: "Executivo", tipo: "financeiro", ativo: true },
  { id: "cad_nfe_paga", ev: "NFe marcada como paga", dest: "Parceiro", tipo: "financeiro", ativo: true },
  { id: "cad_nova_indicacao", ev: "Nova indicação criada", dest: "Executivo", tipo: "sistema", ativo: true },
];

const isCadenceActive = (cadenceRules, ruleId) => cadenceRules.find(r => r.id === ruleId)?.ativo !== false;

// Notifications loaded from API

function addNotif(setNotifs, { tipo, titulo, msg, para, de, link }) {
  const n = { id: "nt" + Date.now() + Math.random().toString(36).slice(2, 5), tipo, titulo, msg, dt: new Date().toISOString().replace("T", " ").slice(0, 16), lido: false, para, de, link: link || "notifs" };
  setNotifs(prev => [n, ...prev]);
  // Also send via API
  if (para && para !== "*") {
    notificationsApi.send({ user_id: para, title: titulo, message: msg, type: tipo === "liberacao" ? "success" : tipo === "financeiro" ? "warning" : "info", link }).catch(() => {});
  }
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
  const [loading, setLoading] = useState(false);

  const go = async () => {
    if (loading) return;
    setLoading(true);
    setErr("");

    try {
      const response = await authApi.login(em, pw);
      const { user, accessToken, refreshToken } = response.data;
      setTokens(accessToken, refreshToken);
      onLogin(transformUser(user));
    } catch (error) {
      const message = error.response?.data?.error || "E-mail ou senha inválidos";
      setErr(message);
    } finally {
      setLoading(false);
    }
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
        <Btn v="primary" full onClick={go} disabled={loading} style={{ marginTop: 12, padding: 14 }}>{loading ? "Entrando..." : "Entrar"}</Btn>
      </div>
    </div>
  );
}

// ===== FORCE CHANGE PASSWORD =====
function ForceChangePassword({ user, onChanged, onLogout }) {
  const [cur, setCur] = useState("");
  const [np, setNp] = useState("");
  const [np2, setNp2] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const go = async () => {
    if (loading) return;
    setErr("");
    if (np.length < 8) return setErr("A nova senha deve ter pelo menos 8 caracteres.");
    if (np !== np2) return setErr("As senhas não coincidem.");
    if (np === cur) return setErr("A nova senha deve ser diferente da atual.");
    setLoading(true);
    try {
      await authApi.changePassword(cur, np);
      onChanged();
    } catch (e) {
      setErr(e.response?.data?.error === "Current password is incorrect" ? "Senha atual incorreta." : "Erro ao alterar senha. Tente novamente.");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, fontFamily: "'DM Sans',sans-serif", color: T.txt }}>
      <style>{fonts}</style>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${T.wn}14 0%, transparent 60%)` }} />
      <div style={{ position: "relative", background: T.card, border: `1px solid ${T.bor}`, borderRadius: 16, padding: "44px 36px", width: 420, maxWidth: "90vw", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ position: "absolute", top: -1, left: "20%", right: "20%", height: 2, background: `linear-gradient(90deg, transparent, ${T.wn}, transparent)` }} />
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔐</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Alterar Senha</h1>
          <p style={{ fontSize: 13, color: T.t2, marginTop: 8 }}>Olá, <strong>{user.name}</strong>. Por segurança, é necessário alterar sua senha no primeiro acesso.</p>
        </div>
        <Inp label="Senha atual" value={cur} onChange={v => { setCur(v); setErr(""); }} type="password" placeholder="Senha fornecida pelo administrador" />
        <Inp label="Nova senha" value={np} onChange={v => { setNp(v); setErr(""); }} type="password" placeholder="Mínimo 8 caracteres" />
        <Inp label="Confirmar nova senha" value={np2} onChange={v => { setNp2(v); setErr(""); }} type="password" placeholder="Repita a nova senha" />
        {err && <p style={{ color: T.er, fontSize: 13, textAlign: "center", margin: "8px 0" }}>{err}</p>}
        <Btn v="primary" full onClick={go} disabled={loading} style={{ marginTop: 12, padding: 14 }}>{loading ? "Alterando..." : "Alterar Senha e Continuar"}</Btn>
        <button onClick={onLogout} style={{ width: "100%", marginTop: 12, padding: 10, background: "transparent", border: `1px solid ${T.bor}`, borderRadius: 6, color: T.tm, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 12 }}>Sair</button>
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

// Multi-select dropdown for parceiros
function MultiSelectParceiro({ parceiros, selected, onToggle, selS }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = parceiros.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const label = selected.length === 0 ? "Todos" : selected.length === 1 ? parceiros.find(p => p.id === selected[0])?.name || "1 selecionado" : `${selected.length} selecionados`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ ...selS, cursor: "pointer", minWidth: 130, textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{label}</span>
        <span style={{ fontSize: 8, color: T.tm }}>▼</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: T.card, border: `1px solid ${T.bor}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", zIndex: 999, minWidth: 220, maxHeight: 280, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${T.bor}` }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar parceiro..." autoFocus
              style={{ width: "100%", padding: "6px 8px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 4, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 11, outline: "none" }} />
          </div>
          <div style={{ overflowY: "auto", maxHeight: 220 }}>
            {selected.length > 0 && (
              <div onClick={() => { selected.forEach(id => onToggle(id)); }} style={{ padding: "7px 12px", fontSize: 11, color: T.er, cursor: "pointer", borderBottom: `1px solid ${T.bor}22`, fontWeight: 600 }}
                onMouseEnter={e => e.currentTarget.style.background = T.er + "11"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                ✕ Limpar seleção
              </div>
            )}
            {filtered.map(p => (
              <div key={p.id} onClick={() => onToggle(p.id)} style={{ padding: "7px 12px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: T.txt }}
                onMouseEnter={e => e.currentTarget.style.background = T.ac + "11"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${selected.includes(p.id) ? T.ac : T.bor}`, background: selected.includes(p.id) ? T.ac : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", flexShrink: 0 }}>
                  {selected.includes(p.id) && "✓"}
                </span>
                <span>{p.name}</span>
                {p.empresa && <span style={{ fontSize: 10, color: T.tm, marginLeft: "auto" }}>{p.empresa}</span>}
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: 12, fontSize: 11, color: T.tm, textAlign: "center" }}>Nenhum parceiro</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== DASHBOARD =====
function Dash({ inds, users, comms, nfes, activity = [] }) {
  const { user } = useAuth();
  const { breakpoint } = useBreakpoint();
  const isParceiro = user.role === "parceiro";
  const isExec = user.role === "executivo";
  const isDiretor = user.role === "diretor" || user.role === "super_admin" || isExec;
  const isGerente = user.role === "gerente";

  // Chain filtering: executivo sees only their directors' chains
  const myDiretores = isExec ? users.filter(u => u.role === "diretor" && u.eId === user.id) : user.role === "super_admin" ? users.filter(u => u.role === "diretor") : [];
  const myDiretorIds = isExec ? myDiretores.map(d => d.id) : [];
  const chainGerenteIds = isExec ? users.filter(u => u.role === "gerente" && myDiretorIds.includes(u.dId)).map(g => g.id) : [];

  const myParceiroIds = isGerente ? users.filter(u => u.role === "parceiro" && u.gId === user.id).map(u => u.id) : [];
  const baseInds = isGerente ? inds.filter(i => i.gId === user.id || myParceiroIds.includes(i.pId))
    : isParceiro ? inds.filter(i => i.pId === user.id)
      : user.role === "diretor" ? inds.filter(i => { const g = users.find(u => u.id === i.gId); return g && g.dId === user.id; })
        : isExec ? inds.filter(i => chainGerenteIds.includes(i.gId))
          : inds;
  const today = new Date().toISOString().split("T")[0];

  // Filters
  const [fSt, setFSt] = useState("todos");
  const [fDtDe, setFDtDe] = useState("");
  const [fDtAte, setFDtAte] = useState("");
  const [fPar, setFPar] = useState([]); // multi-select parceiro ids
  const [fLib, setFLib] = useState("todos");
  const [fGer, setFGer] = useState("todos");
  const [fDir, setFDir] = useState("todos");
  const [fConv, setFConv] = useState("todos");
  const [dashConvenios, setDashConvenios] = useState([]);
  const [dashConvParMap, setDashConvParMap] = useState({}); // convenio_id -> Set of parceiro ids

  useEffect(() => {
    conveniosApi.getAll().then(async r => {
      const convs = (r.data.convenios || []).filter(c => c.is_active);
      setDashConvenios(convs);
      const map = {};
      for (const c of convs) {
        try {
          const pr = await conveniosApi.getParceiros(c.id);
          map[c.id] = new Set((pr.data.parceiros || []).map(p => p.id));
        } catch { map[c.id] = new Set(); }
      }
      setDashConvParMap(map);
    }).catch(() => {});
  }, []);

  const myParceiros = isGerente ? users.filter(u => u.role === "parceiro" && u.gId === user.id)
    : user.role === "diretor" ? users.filter(u => u.role === "parceiro" && users.find(g => g.id === u.gId && g.dId === user.id))
      : isExec ? users.filter(u => u.role === "parceiro" && chainGerenteIds.includes(u.gId))
        : users.filter(u => u.role === "parceiro");
  const myGerentes = isGerente ? []
    : user.role === "diretor" ? users.filter(u => u.role === "gerente" && u.dId === user.id)
      : isExec ? users.filter(u => u.role === "gerente" && myDiretorIds.includes(u.dId))
        : users.filter(u => u.role === "gerente");

  const toggleFPar = (id) => setFPar(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const filtered = baseInds.filter(i => {
    if (fSt !== "todos" && i.st !== fSt) return false;
    if (fDtDe && i.dt < fDtDe) return false;
    if (fDtAte && i.dt > fDtAte) return false;
    if (fPar.length > 0 && !fPar.includes(i.pId)) return false;
    if (fLib === "liberado" && i.lib !== "liberado") return false;
    if (fLib === "bloqueado" && i.lib !== "bloqueado") return false;
    if (fLib === "pendente" && i.lib !== null) return false;
    if (fLib === "vencido" && !(i.lib === "liberado" && i.libExp && i.libExp < today)) return false;
    if (fGer !== "todos" && i.gId !== fGer) return false;
    if (fDir !== "todos") {
      const g = users.find(u => u.id === i.gId);
      if (!g || g.dId !== fDir) return false;
    }
    if (fConv !== "todos") {
      const convParceiros = dashConvParMap[fConv];
      if (!convParceiros || !convParceiros.has(i.pId)) return false;
    }
    return true;
  });
  const hasFilters = fSt !== "todos" || fDtDe || fDtAte || fPar.length > 0 || fLib !== "todos" || fGer !== "todos" || fDir !== "todos" || fConv !== "todos";
  const clearFilters = () => { setFSt("todos"); setFDtDe(""); setFDtAte(""); setFPar([]); setFLib("todos"); setFGer("todos"); setFDir("todos"); setFConv("todos"); };

  // Stats — use filtered data when filters are active, baseInds otherwise
  const statsSource = hasFilters ? filtered : baseInds;
  const total = statsSource.length;
  const pipeline = statsSource.filter(i => ["nova", "analise", "prospeccao", "docs"].includes(i.st)).length;
  const aprovadas = statsSource.filter(i => ["aprovado", "implant", "ativo"].includes(i.st)).length;
  const ativas = statsSource.filter(i => i.st === "ativo").length;
  const recusadas = statsSource.filter(i => i.st === "recusado").length;
  const travasVencidas = statsSource.filter(i => i.lib === "liberado" && i.libExp && i.libExp < today).length;
  const totalFuncionarios = statsSource.reduce((sum, i) => sum + (parseInt(i.nf) || 0), 0);
  const txConversao = total > 0 ? ((ativas / total) * 100).toFixed(1) : "0.0";
  const parcCount = myParceiros.length;

  // Funnel data
  const funnelData = KCOLS.map(col => ({ ...col, count: statsSource.filter(i => i.st === col.id).length }));
  const maxFunnel = Math.max(...funnelData.map(f => f.count), 1);

  // Ranking parceiros
  const parcRanking = myParceiros.map(p => {
    const pi = statsSource.filter(i => i.pId === p.id);
    return { ...p, total: pi.length, ativas: pi.filter(i => i.st === "ativo").length, pipeline: pi.filter(i => ["nova", "analise", "prospeccao", "docs"].includes(i.st)).length, recusadas: pi.filter(i => i.st === "recusado").length, funcionarios: pi.reduce((s, i) => s + (parseInt(i.nf) || 0), 0), tx: pi.length > 0 ? ((pi.filter(i => i.st === "ativo").length / pi.length) * 100).toFixed(0) : "0" };
  }).sort((a, b) => b.ativas - a.ativas);

  // Performance por gerente (só diretor)
  const gerRanking = isDiretor ? myGerentes.map(g => {
    const gi = statsSource.filter(i => i.gId === g.id);
    const gp = users.filter(u => u.role === "parceiro" && u.gId === g.id);
    return { ...g, total: gi.length, ativas: gi.filter(i => i.st === "ativo").length, parceiros: gp.length, tx: gi.length > 0 ? ((gi.filter(i => i.st === "ativo").length / gi.length) * 100).toFixed(0) : "0" };
  }).sort((a, b) => b.ativas - a.ativas) : [];

  // Director ranking for executivo
  const dirRanking = isExec ? myDiretores.map(d => {
    const dGerentes = users.filter(u => u.role === "gerente" && u.dId === d.id);
    const dGerenteIds = dGerentes.map(g => g.id);
    const di = statsSource.filter(i => dGerenteIds.includes(i.gId));
    const dp = users.filter(u => u.role === "parceiro" && dGerenteIds.includes(u.gId));
    return { ...d, gerentes: dGerentes.length, parceiros: dp.length, total: di.length, ativas: di.filter(i => i.st === "ativo").length, tx: di.length > 0 ? ((di.filter(i => i.st === "ativo").length / di.length) * 100).toFixed(0) : "0" };
  }).sort((a, b) => b.ativas - a.ativas) : [];

  // Travas vencidas list
  const travasVencidasList = baseInds.filter(i => i.lib === "liberado" && i.libExp && i.libExp < today).sort((a, b) => a.libExp.localeCompare(b.libExp));

  // Últimas interações (from API activity feed)
  const baseIndIds = new Set(baseInds.map(i => i.id));
  const allHist = activity.filter(a => baseIndIds.has(a.indId)).slice(0, 10);

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

    // Stats — use filtered data when filters active
    const pSource = pHasFilters ? my : all;
    const pTotal = pSource.length;
    const pPipeline = pSource.filter(i => ["nova", "analise", "prospeccao", "docs"].includes(i.st)).length;
    const pAprov = pSource.filter(i => ["aprovado", "implant", "ativo"].includes(i.st)).length;
    const pAtivas = pSource.filter(i => i.st === "ativo").length;
    const pRecusadas = pSource.filter(i => i.st === "recusado").length;
    const pLiberadas = pSource.filter(i => i.lib === "liberado").length;
    const pVencidas = pSource.filter(i => i.lib === "liberado" && i.libExp && i.libExp < today).length;
    const pTotalFunc = pSource.reduce((sum, i) => sum + (parseInt(i.nf) || 0), 0);
    const pTx = pTotal > 0 ? ((pAtivas / pTotal) * 100).toFixed(1) : "0.0";

    // Funnel
    const pFunnel = KCOLS.map(col => ({ ...col, count: pSource.filter(i => i.st === col.id).length }));
    const pMaxFunnel = Math.max(...pFunnel.map(f => f.count), 1);

    // Financial
    const myComms = (comms || []).filter(c => c.pId === user.id);
    const myNfes = (nfes || []).filter(n => n.pId === user.id);
    const totalComm = myComms.reduce((s, c) => s + c.valor, 0);
    const lastComm = myComms.length > 0 ? [...myComms].sort((a, b) => b.dt.localeCompare(a.dt))[0] : null;
    const nfesPendentes = myNfes.filter(n => n.st === "pendente").length;

    // Recent history (from API activity feed)
    const allIds = new Set(all.map(i => i.id));
    const pHist = activity.filter(a => allIds.has(a.indId)).slice(0, 8);

    // Sorted for table
    const pSorted = [...my].sort((a, b) => b.dt.localeCompare(a.dt));

    // View state for detail
    const [pSel, setPSel] = useState(null);
    const selectPInd = async (ind) => {
      setPSel(ind);
      try {
        const res = await indicationsApi.getById(ind.id);
        if (res.data?.hist) {
          setPSel(prev => prev && prev.id === ind.id ? { ...prev, hist: res.data.hist } : prev);
        }
      } catch (e) { console.error("Erro ao carregar histórico:", e); }
    };

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
                <span style={{ color: T.tm }}>Executivo: </span><span style={{ fontWeight: 600 }}>{myGerente?.name || "—"}</span>
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
        <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }), gap: 12, marginBottom: 12 }}>
          {[
            { l: "Total", v: pTotal, co: T.ac, ic: "📋" },
            { l: "Em Andamento", v: pPipeline, co: T.inf, ic: "🔄" },
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
        <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }), gap: 12, marginBottom: 20 }}>
          {[
            { l: "Recusadas", v: pRecusadas, co: T.er, ic: "❌" },
            { l: "Total Funcionários", v: pTotalFunc.toLocaleString('pt-BR'), co: T.inf, ic: "👥" },
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
        <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "1fr 1fr", lg: "1fr 1fr" }), gap: 16, marginBottom: 16 }}>
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
                <div key={ind.id} onClick={() => selectPInd(ind)} style={{ background: T.card, border: `1px solid ${T.er}33`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", flex: "1 1 200px" }}>
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
        <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "1fr", lg: "2fr 1fr" }), gap: 16 }}>
          {/* Indicações */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📋 Minhas Indicações{pHasFilters ? " (Filtradas)" : ""}</h3>
            <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
              <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead><tr>{["Empresa", "Status", "Liberação", "Limite", "Data"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
                <tbody>{pSorted.map(ind => (
                  <tr key={ind.id} onClick={() => selectPInd(ind)} style={{ cursor: "pointer" }}>
                    <td style={{ ...tdS, fontSize: 13, fontWeight: 600 }}>{ind.emp}<div style={{ fontSize: 10, color: T.tm }}>{ind.cnpj}</div></td>
                    <td style={tdS}><Badge type={ind.st === "ativo" ? "success" : ind.st === "recusado" ? "danger" : "info"}>{KCOLS.find(k => k.id === ind.st)?.label}</Badge></td>
                    <td style={tdS}><LibBadge lib={ind.lib} /></td>
                    <td style={tdS}>{ind.lib === "liberado" && ind.libExp ? <span style={{ fontSize: 10, fontWeight: 600, color: ind.libExp < today ? T.er : T.ok }}>{ind.libExp < today ? "⚠ " : ""}{ind.libExp}</span> : <span style={{ color: T.tm, fontSize: 10 }}>—</span>}</td>
                    <td style={{ ...tdS, fontSize: 11, color: T.tm }}>{ind.dt}</td>
                  </tr>
                ))}</tbody>
                {my.length === 0 && <tbody><tr><td colSpan={5} style={{ padding: 30, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhuma indicação{pHasFilters ? " com esses filtros" : ""}.</td></tr></tbody>}
              </table></div>
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
      <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }), gap: 12, marginBottom: 12 }}>
        {[
          { l: "Total Indicações", v: total, co: T.ac, ic: "📋" },
          { l: "Em Andamento", v: pipeline, co: T.inf, ic: "🔄" },
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
      <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }), gap: 12, marginBottom: 20 }}>
        {[
          { l: "Recusadas", v: recusadas, co: T.er, ic: "❌" },
          { l: "Total Funcionários", v: totalFuncionarios.toLocaleString('pt-BR'), co: T.inf, ic: "👥" },
          { l: "Taxa Conversão", v: txConversao + "%", co: parseFloat(txConversao) >= 20 ? T.ok : T.wn, ic: "📈" },
          { l: isExec ? "Gerentes" : isDiretor ? "Executivos" : "Liberadas", v: isExec ? myDiretores.length : isDiretor ? myGerentes.length : baseInds.filter(i => i.lib === "liberado").length, co: T.ac, ic: isExec ? "🏛️" : isDiretor ? "👔" : "🔓" },
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
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>📊 Funil de Indicações</h3>
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
          <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Gerente:</span>
          <select value={fDir} onChange={e => setFDir(e.target.value)} style={selS}><option value="todos">Todos</option>{myDiretores.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </div>}
        {isDiretor && <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Executivo:</span>
          <select value={fGer} onChange={e => setFGer(e.target.value)} style={selS}><option value="todos">Todos</option>{myGerentes.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        </div>}
        {dashConvenios.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Convênio:</span>
          <select value={fConv} onChange={e => setFConv(e.target.value)} style={selS}><option value="todos">Todos</option>{dashConvenios.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>}
        <div style={{ display: "flex", alignItems: "center", gap: 5, position: "relative" }}>
          <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Parceiro:</span>
          <MultiSelectParceiro parceiros={myParceiros} selected={fPar} onToggle={toggleFPar} selS={selS} />
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
      <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "1fr", lg: "2fr 1fr" }), gap: 16, marginBottom: 16 }}>
        {/* Indicações filtradas */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>📋 Indicações {hasFilters ? "(Filtradas)" : "Recentes"}</h3>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
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
            </table></div>
            {sorted.length > 10 && <div style={{ padding: "8px 14px", textAlign: "center", fontSize: 11, color: T.tm, borderTop: `1px solid ${T.bor}` }}>Mostrando 10 de {sorted.length} — veja todas no Funil/Pipeline</div>}
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
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🏛️ Performance dos Gerentes</h3>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead><tr>{["Gerente", "Executivos", "Parceiros", "Indicações", "Ativas", "Conversão"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
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
            </table></div>
          </div>
        </div>
      )}

      {/* ROW 7: Ranking + Gerentes/Deals */}
      <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "1fr 1fr", lg: "1fr 1fr" }), gap: 16 }}>
        {/* Ranking Parceiros */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🏆 Ranking de Parceiros</h3>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead><tr>{["#", "Parceiro", "Total", "Ativas", "Em Andamento", "Funcionários", "Conversão"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
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
                  <td style={{ ...tdS, fontFamily: "'Space Mono',monospace", fontSize: 12, color: T.ac, textAlign: "center" }}>{p.funcionarios.toLocaleString('pt-BR')}</td>
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
              {parcRanking.length === 0 && <tbody><tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: T.tm, fontSize: 12 }}>Nenhum parceiro.</td></tr></tbody>}
            </table></div>
          </div>
        </div>

        {/* Gerentes Performance (Diretor) or HubSpot Deals (Gerente) */}
        {isDiretor ? (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>👔 Performance dos Executivos</h3>
            <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
              <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead><tr>{["Executivo", "Parceiros", "Indicações", "Ativas", "Conversão"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
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
              </table></div>
            </div>
          </div>
        ) : (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🔗 HubSpot Deals</h3>
            <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
              <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead><tr>{["Empresa", "Deal", "Parceiro", "Status"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
                <tbody>{baseInds.filter(i => i.hsId).slice(0, 8).map(ind => (
                  <tr key={ind.id}>
                    <td style={{ ...tdS, fontSize: 12, fontWeight: 600 }}>{ind.emp}</td>
                    <td style={{ ...tdS, fontSize: 10, fontFamily: "'Space Mono',monospace", color: T.tm }}>{ind.hsId}</td>
                    <td style={{ ...tdS, fontSize: 11 }}>{users.find(u => u.id === ind.pId)?.name || "—"}</td>
                    <td style={tdS}><Badge type={ind.hsSt === "won" ? "success" : ind.hsSt === "lost" ? "danger" : "warning"}>{ind.hsSt === "won" ? "Ganho" : ind.hsSt === "lost" ? "Perdido" : "Aberto"}</Badge></td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== KANBAN =====
function KanbanPage({ inds, setInds, users, travaDias, notifs, setNotifs, cadenceRules }) {
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
  const kMyParceiroIds = isGerente ? users.filter(u => u.role === "parceiro" && u.gId === user.id).map(u => u.id) : [];
  const base = user.role === "gerente" ? inds.filter(i => i.gId === user.id || kMyParceiroIds.includes(i.pId))
    : user.role === "parceiro" ? inds.filter(i => i.pId === user.id)
      : user.role === "diretor" ? inds.filter(i => { const g = users.find(u => u.id === i.gId); return g && g.dId === user.id; })
        : user.role === "executivo" ? inds.filter(i => chainGerenteIds.includes(i.gId))
          : inds;

  // Filters (gerente/admin)
  const [fPar, setFPar] = useState([]);
  const [fDtDe, setFDtDe] = useState("");
  const [fDtAte, setFDtAte] = useState("");
  const [fLib, setFLib] = useState("todos"); // todos, liberado, bloqueado, pendente, vencido
  const [kFConv, setKFConv] = useState("todos");
  const [kConvenios, setKConvenios] = useState([]);
  const [kConvParMap, setKConvParMap] = useState({});

  useEffect(() => {
    conveniosApi.getAll().then(async r => {
      const convs = (r.data.convenios || []).filter(c => c.is_active);
      setKConvenios(convs);
      const map = {};
      for (const c of convs) {
        try {
          const pr = await conveniosApi.getParceiros(c.id);
          map[c.id] = new Set((pr.data.parceiros || []).map(p => p.id));
        } catch { map[c.id] = new Set(); }
      }
      setKConvParMap(map);
    }).catch(() => {});
  }, []);

  const toggleFPar = (id) => setFPar(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const today = new Date().toISOString().split("T")[0];
  const fl = base.filter(i => {
    if (fPar.length > 0 && !fPar.includes(i.pId)) return false;
    if (fDtDe && i.dt < fDtDe) return false;
    if (fDtAte && i.dt > fDtAte) return false;
    if (fLib === "liberado" && i.lib !== "liberado") return false;
    if (fLib === "bloqueado" && i.lib !== "bloqueado") return false;
    if (fLib === "pendente" && i.lib !== null) return false;
    if (fLib === "vencido" && !(i.lib === "liberado" && i.libExp && i.libExp < today)) return false;
    if (kFConv !== "todos") {
      const convParceiros = kConvParMap[kFConv];
      if (!convParceiros || !convParceiros.has(i.pId)) return false;
    }
    return true;
  });

  const hasFilters = fPar.length > 0 || fDtDe || fDtAte || fLib !== "todos" || kFConv !== "todos";
  const clearFilters = () => { setFPar([]); setFDtDe(""); setFDtAte(""); setFLib("todos"); setKFConv("todos"); };

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
    // API call - persist trava state and save history
    updateIndApi(id, { liberacao_status: next, liberacao_data: next === "liberado" ? addDays(0) : undefined, liberacao_expiry: expDate });
    indicationsApi.addHistory(id, hEntry.txt, 'liberacao').catch(e => console.error("Erro ao salvar histórico:", e));
    // Auto-create company + deal in HubSpot when liberating
    if (next === "liberado") {
      hubspotApi.createCompanyDeal(id).then(r => {
        if (r.data?.deal_id) {
          setInds(p => p.map(x => x.id === id ? { ...x, hsId: r.data.deal_id, hsSt: r.data.stage } : x));
          if (sel && sel.id === id) setSel(prev => ({ ...prev, hsId: r.data.deal_id, hsSt: r.data.stage }));
          console.log(`[HubSpot] Auto-created deal ${r.data.deal_id} for indication ${id}`);
        }
      }).catch(e => console.warn("[HubSpot] Auto-create skipped:", e.response?.data?.error || e.message));
    }
    // Notify parceiro about liberation/block
    const ind = inds.find(x => x.id === id);
    if (ind?.pId && (next === "liberado" || next === "bloqueado") && isCadenceActive(cadenceRules, "cad_liberacao")) {
      addNotif(setNotifs, { tipo: "liberacao", titulo: next === "liberado" ? "Oportunidade liberada" : "Oportunidade bloqueada", msg: `Sua indicação ${ind.emp} foi ${next === "liberado" ? "liberada. Trava: " + (travaDias || 90) + " dias." : "bloqueada."}`, para: ind.pId, de: user.id, link: "kanban" });
    }
  };

  // Edit libExp
  const editLibExp = (id, newDate) => {
    const td = now();
    const hEntry = { dt: td, autor: user.name, txt: `Limite da trava alterado para ${newDate}.` };
    setInds(p => p.map(x => x.id === id ? { ...x, libExp: newDate, hist: [...(x.hist || []), hEntry] } : x));
    if (sel && sel.id === id) setSel(prev => ({ ...prev, libExp: newDate, hist: [...(prev.hist || []), hEntry] }));
    updateIndApi(id, { liberacao_expiry: newDate });
    indicationsApi.addHistory(id, hEntry.txt, 'liberacao').catch(e => console.error("Erro ao salvar histórico:", e));
  };

  // Edit obs
  const editObs = (id, newObs) => {
    setInds(p => p.map(x => x.id === id ? { ...x, obs: newObs } : x));
    if (sel && sel.id === id) setSel(prev => ({ ...prev, obs: newObs }));
    updateIndApi(id, { obs: newObs });
  };

  // Add interaction
  const [newNote, setNewNote] = useState("");
  const addNote = (id) => {
    if (!newNote.trim()) return;
    const td = now();
    const hEntry = { dt: td, autor: user.name, txt: newNote.trim() };
    setInds(p => p.map(x => x.id === id ? { ...x, hist: [...(x.hist || []), hEntry] } : x));
    if (sel && sel.id === id) setSel(prev => ({ ...prev, hist: [...(prev.hist || []), hEntry] }));
    // Save note to API via history endpoint
    const ind = inds.find(x => x.id === id);
    indicationsApi.addHistory(id, newNote.trim(), 'obs').catch(e => console.error("Erro ao salvar nota:", e));
    // Notify parceiro about new interaction
    if (ind?.pId && ind.pId !== user.id && isCadenceActive(cadenceRules, "cad_interacao")) {
      addNotif(setNotifs, { tipo: "sistema", titulo: "Nova interação", msg: `${user.name} adicionou uma nota em ${ind.emp}.`, para: ind.pId, de: user.id, link: "kanban" });
    }
    setNewNote("");
  };

  // Load history when selecting an indication
  const selectInd = async (ind) => {
    setSel(ind);
    try {
      const res = await indicationsApi.getById(ind.id);
      if (res.data?.hist) {
        const h = res.data.hist;
        setSel(prev => prev && prev.id === ind.id ? { ...prev, hist: h } : prev);
        setInds(p => p.map(x => x.id === ind.id ? { ...x, hist: h } : x));
      }
    } catch (e) { console.error("Erro ao carregar histórico:", e); }
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
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 4, background: T.inp, borderRadius: 6, padding: 3, border: `1px solid ${T.bor}` }}>
          <button onClick={() => setView("kanban")} style={{ padding: "6px 14px", borderRadius: 4, border: "none", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", background: view === "kanban" ? T.ac : "transparent", color: view === "kanban" ? "#fff" : T.tm }}>📊 Funil</button>
          <button onClick={() => setView("list")} style={{ padding: "6px 14px", borderRadius: 4, border: "none", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", background: view === "list" ? T.ac : "transparent", color: view === "list" ? "#fff" : T.tm }}>📋 Lista</button>
        </div>
      </div>

      {/* FILTERS */}
      {canMove && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap", padding: "10px 14px", background: T.card, border: `1px solid ${T.bor}`, borderRadius: 8 }}>
          <span style={{ fontSize: 11, color: T.tm, fontWeight: 600 }}>🔍 Filtros:</span>
          {kConvenios.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Convênio:</span>
            <select value={kFConv} onChange={e => setKFConv(e.target.value)} style={selS}><option value="todos">Todos</option>{kConvenios.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </div>}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Parceiro:</span>
            <MultiSelectParceiro parceiros={myParceiros} selected={fPar} onToggle={toggleFPar} selS={selS} />
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
                    onDrop={canMove ? e => { const id = e.dataTransfer.getData("text/plain"); const ind = inds.find(x => x.id === id); const colLabel = KCOLS.find(c => c.id === col.id)?.label || col.id; setInds(p => p.map(x => x.id === id ? { ...x, st: col.id } : x)); updateIndApi(id, { status: mapKanbanToDb(col.id), notes: JSON.stringify({ kanbSt: col.id }) }); if (ind && ind.pId && isCadenceActive(cadenceRules, "cad_status_kanban")) { addNotif(setNotifs, { tipo: "status", titulo: "Status alterado", msg: `Sua indicação ${ind.emp} foi movida para ${colLabel}.`, para: ind.pId, de: user.id, link: "kanban" }); } if (ind && (col.id === "ativo" || col.id === "recusado") && isCadenceActive(cadenceRules, "cad_indicacao_ativa")) { const gerente = users.find(u => u.id === ind.gId); const superiors = []; if (gerente?.dId) superiors.push(gerente.dId); const dir = users.find(u => u.id === gerente?.dId); if (dir?.eId) superiors.push(dir.eId); superiors.forEach(sId => addNotif(setNotifs, { tipo: "status", titulo: col.id === "ativo" ? "Indicação aprovada" : "Indicação recusada", msg: `Indicação ${ind.emp} foi ${col.id === "ativo" ? "aprovada" : "recusada"} por ${user.name}.`, para: sId, de: user.id, link: "kanban" })); } } : undefined}>
                    {cards.map(ind => (
                      <div key={ind.id} draggable={canMove} onDragStart={canMove ? e => e.dataTransfer.setData("text/plain", ind.id) : undefined}
                        onClick={() => selectInd(ind)}
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
          <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead><tr>{["Empresa", "Contato", "Func.", "Status", "Liberação", "Limite Trava", "Parceiro", "Data"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {[...fl].sort((a, b) => b.dt.localeCompare(a.dt)).map(ind => (
                <tr key={ind.id} onClick={() => selectInd(ind)} style={{ cursor: "pointer" }}>
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
          </table></div>
        </div>
      )}

      <Modal open={!!sel} onClose={() => setSel(null)} title="Detalhes da Indicação" wide footer={canMove && sel ? <>
        <select value={sel.st} onChange={e => { const v = e.target.value; setInds(p => p.map(x => x.id === sel.id ? { ...x, st: v } : x)); setSel({ ...sel, st: v }); updateIndApi(sel.id, { status: mapKanbanToDb(v), notes: JSON.stringify({ kanbSt: v }) }); }}
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
          ["Parceiro", users.find(u => u.id === sel.pId)?.name], ["Executivo", users.find(u => u.id === sel.gId)?.name]
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

          {/* Análise CNPJ / HubSpot */}
          {sel.hubspotAnalysis && (
            <div style={{ marginTop: 12, padding: 14, background: sel.hubspotAnalysis.found ? T.wa + "0A" : T.ok + "0A", borderRadius: 8, border: `1px solid ${sel.hubspotAnalysis.found ? T.wa : T.ok}25` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: sel.hubspotAnalysis.found ? T.wa : T.ok, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>🔍 Análise CNPJ / HubSpot</div>
              <div style={{ display: "flex", padding: "5px 0", borderBottom: `1px solid ${T.bor}22` }}>
                <div style={{ width: 120, fontSize: 10, color: T.tm, textTransform: "uppercase", flexShrink: 0 }}>Status</div>
                <div style={{ fontSize: 12, color: T.t2, fontWeight: 600 }}>{sel.hubspotAnalysis.found ? "Oportunidade existente" : "Sem oportunidades"}</div>
              </div>
              {sel.hubspotAnalysis.company && (
                <div style={{ display: "flex", padding: "5px 0", borderBottom: `1px solid ${T.bor}22` }}>
                  <div style={{ width: 120, fontSize: 10, color: T.tm, textTransform: "uppercase", flexShrink: 0 }}>Empresa HS</div>
                  <div style={{ fontSize: 12, color: T.t2 }}>{sel.hubspotAnalysis.company.name}</div>
                </div>
              )}
              {sel.hubspotAnalysis.deals && sel.hubspotAnalysis.deals.length > 0 && (
                <div style={{ marginTop: 8, padding: 8, background: T.bg2, borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: T.tm, marginBottom: 6 }}>OPORTUNIDADES:</div>
                  {sel.hubspotAnalysis.deals.map((deal, i) => (
                    <div key={i} style={{ fontSize: 11, color: T.t2, padding: "4px 0", borderBottom: i < sel.hubspotAnalysis.deals.length - 1 ? `1px solid ${T.bor}` : 'none' }}>
                      <strong>{deal.name}</strong> — Etapa: {deal.stage || '—'} {deal.amount && `| R$ ${Number(deal.amount).toLocaleString('pt-BR')}`}
                    </div>
                  ))}
                </div>
              )}
              {sel.hubspotAnalysis.lastInteraction && (
                <div style={{ marginTop: 8, padding: 8, background: T.bg2, borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: T.tm, marginBottom: 4 }}>ÚLTIMA INTERAÇÃO:</div>
                  <div style={{ fontSize: 11, color: T.t2 }}>
                    <strong>{sel.hubspotAnalysis.lastInteraction.type}</strong> — {sel.hubspotAnalysis.lastInteraction.date ? new Date(sel.hubspotAnalysis.lastInteraction.date).toLocaleDateString('pt-BR') : '—'}
                  </div>
                  {sel.hubspotAnalysis.lastInteraction.summary && <div style={{ fontSize: 11, color: T.tm, marginTop: 2 }}>{sel.hubspotAnalysis.lastInteraction.summary.slice(0, 200)}{sel.hubspotAnalysis.lastInteraction.summary.length > 200 ? '...' : ''}</div>}
                </div>
              )}
            </div>
          )}

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
                  {isGerente ? `Máx: +60 dias do padrão (${getMaxLibExp(sel)})` : "Gerente: sem limite de data"}
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
  const { breakpoint } = useBreakpoint();
  const [modal, setModal] = useState(false);
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ name: "", email: "", pw: "", empresa: "", tel: "", cnpj: "", gId: user.role === "gerente" ? user.id : "", comTipo: "pct", comVal: "" });
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjInfo, setCnpjInfo] = useState(null);
  const [createdCreds, setCreatedCreds] = useState(null); // { email, password } after creation
  const [editParc, setEditParc] = useState(null); // parceiro being edited
  const [ef, setEf] = useState({ name: "", empresa: "", tel: "", cnpj: "", comTipo: "pct", comVal: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [resetPwResult, setResetPwResult] = useState(null);
  const [allConvenios, setAllConvenios] = useState([]);
  const [selConvIds, setSelConvIds] = useState([]);
  const [editConvIds, setEditConvIds] = useState([]);
  const [parceiroConvMap, setParceiroConvMap] = useState({}); // parceiro_id -> [convenio names]
  const [pfGer, setPfGer] = useState("todos");
  const [pfConv, setPfConv] = useState("todos");
  const [pfConvParMap, setPfConvParMap] = useState({}); // convenio_id -> Set of parceiro ids

  useEffect(() => {
    conveniosApi.getAll().then(async r => {
      const convs = (r.data.convenios || []).filter(c => c.is_active);
      setAllConvenios(convs);
      const map = {};
      const cmap = {};
      for (const c of convs) {
        try {
          const pr = await conveniosApi.getParceiros(c.id);
          const parcList = pr.data.parceiros || [];
          cmap[c.id] = new Set(parcList.map(p => p.id));
          for (const p of parcList) {
            if (!map[p.id]) map[p.id] = [];
            map[p.id].push(c.name);
          }
        } catch { cmap[c.id] = new Set(); }
      }
      setParceiroConvMap(map);
      setPfConvParMap(cmap);
    }).catch(() => {});
  }, []);

  const genPw = () => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; let p = ""; for (let i = 0; i < 8; i++) p += c[Math.floor(Math.random() * c.length)]; return p; };

  const buscarCnpj = async (cnpjVal) => {
    const clean = cnpjVal.replace(/\D/g, '');
    if (clean.length !== 14) return;
    setCnpjLoading(true); setCnpjInfo(null);
    try {
      const res = await cnpjAgentApi.lookup(clean);
      const d = res.data;
      setCnpjInfo(d);
      setF(prev => ({
        ...prev,
        cnpj: clean,
        empresa: d.razao_social || prev.empresa,
        tel: d.telefone || prev.tel,
        email: prev.email || d.email || "",
        name: prev.name || (d.socios?.[0]?.nome) || "",
      }));
    } catch (e) {
      setCnpjInfo({ error: e.response?.data?.error || "CNPJ não encontrado" });
    }
    setCnpjLoading(false);
  };

  const formatCnpj = (v) => {
    const n = v.replace(/\D/g, '').slice(0, 14);
    if (n.length <= 2) return n;
    if (n.length <= 5) return n.replace(/(\d{2})(\d+)/, '$1.$2');
    if (n.length <= 8) return n.replace(/(\d{2})(\d{3})(\d+)/, '$1.$2.$3');
    if (n.length <= 12) return n.replace(/(\d{2})(\d{3})(\d{3})(\d+)/, '$1.$2.$3/$4');
    return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d+)/, '$1.$2.$3/$4-$5');
  };

  const myDirIds = user.role === "executivo" ? users.filter(u => u.role === "diretor" && u.eId === user.id).map(d => d.id) : [];
  const myGerIds = user.role === "executivo" ? users.filter(u => u.role === "gerente" && myDirIds.includes(u.dId)).map(g => g.id) : [];

  const allParcs = (user.role === "gerente" ? users.filter(u => u.role === "parceiro" && u.gId === user.id)
    : user.role === "diretor" ? users.filter(u => u.role === "parceiro" && users.find(g => g.id === u.gId && g.dId === user.id))
      : user.role === "executivo" ? users.filter(u => u.role === "parceiro" && myGerIds.includes(u.gId))
        : users.filter(u => u.role === "parceiro"));

  const parcGerentes = [...new Map(allParcs.map(p => [p.gId, users.find(u => u.id === p.gId)]).filter(([, g]) => g)).values()];

  const parcs = allParcs
    .filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.empresa || "").toLowerCase().includes(q.toLowerCase()))
    .filter(p => pfGer === "todos" || p.gId === pfGer)
    .filter(p => {
      if (pfConv === "todos") return true;
      const convParceiros = pfConvParMap[pfConv];
      return convParceiros && convParceiros.has(p.id);
    });

  const pfHasFilters = pfGer !== "todos" || pfConv !== "todos" || q;
  const pfClearFilters = () => { setPfGer("todos"); setPfConv("todos"); setQ(""); };

  const [adding, setAdding] = useState(false);
  const add = async () => {
    const pw = f.pw || genPw();
    if (!f.name || !f.email || !f.comVal || adding) return;
    setAdding(true);
    try {
      const res = await usersApi.create({
        email: f.email, password: pw, name: f.name, role: "parceiro",
        manager_id: f.gId || user.id, empresa: f.empresa, tel: f.tel,
        com_tipo: f.comTipo, com_val: parseFloat(f.comVal) || 0,
        cnpj: f.cnpj.replace(/\D/g, '') || null,
        convenio_ids: selConvIds
      });
      const u = res.data.user;
      setUsers(prev => [...prev, transformUser(u)]);
      setModal(false);
      setCreatedCreds({ email: f.email, password: pw, name: f.name });
      setF({ name: "", email: "", pw: "", empresa: "", tel: "", cnpj: "", gId: user.role === "gerente" ? user.id : "", comTipo: "pct", comVal: "" });
      setCnpjInfo(null);
      setSelConvIds([]);
    } catch (e) { console.error("Erro ao cadastrar parceiro:", e); alert(e.response?.data?.error || "Erro ao cadastrar"); }
    setAdding(false);
  };

  const saveEditParc = async () => {
    if (!editParc || editSaving) return;
    setEditSaving(true);
    try {
      await usersApi.update(editParc.id, {
        name: ef.name, empresa: ef.empresa, tel: ef.tel, cnpj: ef.cnpj.replace(/\D/g, '') || null,
        com_tipo: ef.comTipo, com_val: parseFloat(ef.comVal) || 0,
        convenio_ids: editConvIds
      });
      setUsers(prev => prev.map(u => u.id === editParc.id ? { ...u, name: ef.name, empresa: ef.empresa, tel: ef.tel, cnpj: ef.cnpj, comTipo: ef.comTipo, comVal: parseFloat(ef.comVal) || 0 } : u));
      setEditParc(null);
    } catch (e) { alert(e.response?.data?.error || "Erro ao salvar"); }
    setEditSaving(false);
  };

  const resetParcPw = async () => {
    if (!editParc) return;
    try {
      const res = await usersApi.resetPassword(editParc.id);
      setResetPwResult(res.data.password);
    } catch (e) { alert(e.response?.data?.error || "Erro ao resetar senha"); }
  };

  const openEditParc = async (p) => {
    setEf({ name: p.name, empresa: p.empresa || "", tel: p.tel || "", cnpj: p.cnpj || "", comTipo: p.comTipo || "pct", comVal: p.comVal != null ? String(p.comVal) : "" });
    setEditParc(p);
    setResetPwResult(null);
    try {
      const r = await conveniosApi.getParceiroConvenios(p.id);
      setEditConvIds((r.data.convenios || []).map(c => c.id));
    } catch { setEditConvIds([]); }
  };

  const thS = { textAlign: "left", padding: "12px 14px", fontSize: 10, fontWeight: 600, color: T.tm, textTransform: "uppercase", borderBottom: `1px solid ${T.bor}`, background: T.bg2 };
  const tdS = { padding: "12px 14px", fontSize: 13, borderBottom: `1px solid ${T.bor}` };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", background: T.card, border: `1px solid ${T.bor}`, borderRadius: 8, flex: 1 }}>
          <span style={{ fontSize: 11, color: T.tm, fontWeight: 600 }}>🔍 Filtros:</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, padding: "5px 10px" }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nome/empresa..." style={{ background: "none", border: "none", color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 12, outline: "none", width: 150 }} />
          </div>
          {parcGerentes.length > 1 && <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Executivo:</span>
            <select value={pfGer} onChange={e => setPfGer(e.target.value)} style={{ padding: "7px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 12, outline: "none" }}>
              <option value="todos">Todos</option>
              {parcGerentes.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>}
          {allConvenios.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Convênio:</span>
            <select value={pfConv} onChange={e => setPfConv(e.target.value)} style={{ padding: "7px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 12, outline: "none" }}>
              <option value="todos">Todos</option>
              {allConvenios.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>}
          {pfHasFilters && <>
            <button onClick={pfClearFilters} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.er}44`, background: T.er + "11", color: T.er, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>✕ Limpar</button>
            <span style={{ fontSize: 11, color: T.t2 }}>{parcs.length} de {allParcs.length}</span>
          </>}
        </div>
        <Btn onClick={() => setModal(true)}>＋ Cadastrar Parceiro</Btn>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {parcs.map(p => {
          const pi = inds.filter(i => i.pId === p.id);
          const pActive = pi.filter(i => i.st === "ativo").length;
          const pPipeline = pi.filter(i => ["em_contato", "proposta", "negociacao"].includes(i.st)).length;
          const pClosed = pi.filter(i => i.st === "fechado").length;
          const pFunc = pi.reduce((s, i) => s + (Number(i.nf) || 0), 0);
          const pConv = pi.length > 0 ? ((pClosed / pi.length) * 100).toFixed(1) : "0.0";
          const lastInd = pi.length > 0 ? pi.reduce((max, i) => (i.dt > max ? i.dt : max), pi[0].dt) : null;
          const convColor = (r) => r >= 30 ? T.ok : r >= 15 ? T.wn : T.er;
          const gerente = users.find(u => u.id === p.gId);
          // Find convênios for this parceiro (from allConvenios which have parceiro lists, or show from user data)
          return (
            <div key={p.id} style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
              <div onClick={() => setDetail(p)} style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}
                onMouseEnter={e => e.currentTarget.style.background = T.ac + "06"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: T.ac + "22", color: T.ac, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{p.av || p.name[0]}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.txt }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: T.tm }}>{p.empresa || "Sem empresa"}</div>
                    <div style={{ display: "flex", gap: 10, marginTop: 2, flexWrap: "wrap" }}>
                      {p.email && <span style={{ fontSize: 10, color: T.t2 }}>✉ {p.email}</span>}
                      {p.tel && <span style={{ fontSize: 10, color: T.t2 }}>📞 {p.tel}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <ComBadge tipo={p.comTipo} val={p.comVal} />
                  {gerente && <span style={{ fontSize: 10, color: T.t2, background: T.bg2, padding: "3px 8px", borderRadius: 4 }}>👤 {gerente.name}</span>}
                  {parceiroConvMap[p.id]?.length > 0 && parceiroConvMap[p.id].map((cn, ci) => (
                    <span key={ci} style={{ fontSize: 10, color: T.inf, background: T.inf + "15", padding: "3px 8px", borderRadius: 4 }}>🤝 {cn}</span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  {[
                    { l: "Total", v: pi.length, co: T.txt },
                    { l: "Ativas", v: pActive, co: T.ok },
                    { l: "Em Andamento", v: pPipeline, co: T.inf },
                    { l: "Func.", v: pFunc.toLocaleString("pt-BR"), co: T.ac },
                    { l: "Conversão", v: `${pConv}%`, co: convColor(parseFloat(pConv)) },
                  ].map((s, i) => (
                    <div key={i} style={{ textAlign: "center", minWidth: 44 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: s.co }}>{s.v}</div>
                      <div style={{ fontSize: 9, color: T.t2 }}>{s.l}</div>
                    </div>
                  ))}
                  <div style={{ textAlign: "center", minWidth: 60 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.t2 }}>{lastInd ? new Date(lastInd).toLocaleDateString("pt-BR") : "—"}</div>
                    <div style={{ fontSize: 9, color: T.t2 }}>Últ. Ind.</div>
                  </div>
                  <Btn sm onClick={(e) => { e.stopPropagation(); openEditParc(p); }}>Editar</Btn>
                </div>
              </div>
            </div>
          );
        })}
        {parcs.length === 0 && <div style={{ padding: 40, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhum parceiro encontrado.</div>}
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
          {[["CNPJ", detail.cnpj ? detail.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : null], ["E-mail", detail.email], ["Telefone", detail.tel], ["Executivo", users.find(u => u.id === detail.gId)?.name]].map(([l, v], i) => (
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
      <Modal open={modal} onClose={() => { setModal(false); setCnpjInfo(null); setSelConvIds([]); }} title="Cadastrar Parceiro" footer={<><Btn v="secondary" onClick={() => { setModal(false); setCnpjInfo(null); setSelConvIds([]); }}>Cancelar</Btn><Btn onClick={add} disabled={!f.name || !f.email || !f.comVal || (allConvenios.length > 0 && selConvIds.length === 0) || adding}>{adding ? "Cadastrando..." : "Cadastrar"}</Btn></>}>
        {/* Campo CNPJ com auto-preenchimento */}
        <div style={{ marginBottom: 14, padding: 14, background: T.bg2, border: `1px solid ${T.bor}`, borderRadius: 8 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>CNPJ do Parceiro</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={f.cnpj} onChange={e => setF({ ...f, cnpj: formatCnpj(e.target.value) })} placeholder="00.000.000/0000-00" style={{ flex: 1, padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: "none" }} />
            <Btn sm onClick={() => buscarCnpj(f.cnpj)} disabled={f.cnpj.replace(/\D/g, '').length !== 14 || cnpjLoading}>{cnpjLoading ? "Buscando..." : "Buscar"}</Btn>
          </div>
          {cnpjInfo && !cnpjInfo.error && (
            <div style={{ marginTop: 10, padding: 10, background: T.ok + "12", border: `1px solid ${T.ok}33`, borderRadius: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.ok, marginBottom: 4 }}>Dados preenchidos automaticamente</div>
              <div style={{ fontSize: 11, color: T.t2 }}>{cnpjInfo.razao_social}</div>
              {cnpjInfo.situacao && <div style={{ fontSize: 10, color: cnpjInfo.situacao === "ATIVA" ? T.ok : T.wn, marginTop: 2 }}>Situação: {cnpjInfo.situacao}</div>}
              {cnpjInfo.cnae_principal && <div style={{ fontSize: 10, color: T.t2, marginTop: 2 }}>CNAE: {cnpjInfo.cnae_principal}</div>}
              {cnpjInfo.endereco?.completo && <div style={{ fontSize: 10, color: T.t2, marginTop: 2 }}>{cnpjInfo.endereco.completo}</div>}
            </div>
          )}
          {cnpjInfo?.error && (
            <div style={{ marginTop: 8, fontSize: 11, color: T.er }}>{cnpjInfo.error}</div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "1fr 1fr", lg: "1fr 1fr" }), gap: 14 }}>
          <Inp label="Nome *" value={f.name} onChange={v => setF({ ...f, name: v })} placeholder="Nome completo" />
          <Inp label="Empresa" value={f.empresa} onChange={v => setF({ ...f, empresa: v })} placeholder="Razão Social" />
          <Inp label="E-mail *" value={f.email} onChange={v => setF({ ...f, email: v })} placeholder="email@ex.com" />
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Senha (auto-gerada se vazio)</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={f.pw} onChange={e => setF({ ...f, pw: e.target.value })} placeholder="Deixe vazio para gerar" style={{ flex: 1, padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: "none" }} />
              <Btn sm onClick={() => setF({ ...f, pw: genPw() })}>Gerar</Btn>
            </div>
          </div>
          <Inp label="Telefone" value={f.tel} onChange={v => setF({ ...f, tel: v })} placeholder="(00) 00000-0000" />
          {user.role !== "gerente" && <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Executivo</label>
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
        {/* Convênios - Multi-select */}
        {allConvenios.length > 0 && (
          <div style={{ marginTop: 14, padding: 14, background: T.bg2, border: `1px solid ${T.bor}`, borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.t2, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>🤝 Convênios *</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {allConvenios.map(c => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, border: `1px solid ${selConvIds.includes(c.id) ? T.ac : T.bor}`, background: selConvIds.includes(c.id) ? T.ac + "15" : T.inp, cursor: "pointer", fontSize: 12, color: selConvIds.includes(c.id) ? T.ac : T.txt, fontWeight: selConvIds.includes(c.id) ? 600 : 400 }}>
                  <input type="checkbox" checked={selConvIds.includes(c.id)} onChange={() => setSelConvIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])} style={{ accentColor: T.ac }} />
                  {c.name}
                </label>
              ))}
            </div>
            {selConvIds.length === 0 && <div style={{ fontSize: 11, color: T.wn, marginTop: 6 }}>Selecione pelo menos um convênio</div>}
          </div>
        )}
      </Modal>

      {/* Credenciais criadas */}
      <Modal open={!!createdCreds} onClose={() => setCreatedCreds(null)} title="Parceiro Cadastrado">
        {createdCreds && <div>
          <div style={{ padding: 16, background: T.ok + "12", border: `1px solid ${T.ok}33`, borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ok, marginBottom: 8 }}>Parceiro criado com sucesso!</div>
            <div style={{ fontSize: 12, color: T.t2 }}>Envie as credenciais abaixo para <strong>{createdCreds.name}</strong>:</div>
          </div>
          <div style={{ padding: 16, background: T.bg2, border: `1px solid ${T.bor}`, borderRadius: 8, fontFamily: "'Space Mono',monospace" }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", marginBottom: 2 }}>E-mail</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{createdCreds.email}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", marginBottom: 2 }}>Senha</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.ac }}>{createdCreds.password}</div>
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <Btn sm onClick={() => { navigator.clipboard.writeText(`E-mail: ${createdCreds.email}\nSenha: ${createdCreds.password}`); }}>Copiar credenciais</Btn>
          </div>
        </div>}
      </Modal>

      {/* Editar Parceiro */}
      <Modal open={!!editParc} onClose={() => { setEditParc(null); setResetPwResult(null); }} title="Editar Parceiro"
        footer={<><Btn v="secondary" onClick={() => { setEditParc(null); setResetPwResult(null); }}>Cancelar</Btn><Btn onClick={saveEditParc} disabled={editSaving}>{editSaving ? "Salvando..." : "Salvar"}</Btn></>}>
        {editParc && <div>
          <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "1fr 1fr", lg: "1fr 1fr" }), gap: 14 }}>
            <Inp label="Nome" value={ef.name} onChange={v => setEf({ ...ef, name: v })} />
            <Inp label="Empresa" value={ef.empresa} onChange={v => setEf({ ...ef, empresa: v })} />
            <Inp label="Telefone" value={ef.tel} onChange={v => setEf({ ...ef, tel: v })} />
            <Inp label="CNPJ" value={ef.cnpj} onChange={v => setEf({ ...ef, cnpj: v })} />
          </div>
          <div style={{ marginTop: 14, padding: 14, background: T.ac + "0A", border: `1px solid ${T.ac}25`, borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.ac, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Condição Comercial</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button onClick={() => setEf({ ...ef, comTipo: "pct" })} style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: `2px solid ${ef.comTipo === "pct" ? T.ac : T.bor}`, background: ef.comTipo === "pct" ? T.ac + "1A" : T.inp, color: ef.comTipo === "pct" ? T.ac : T.tm, fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>% sobre Cashin</button>
              <button onClick={() => setEf({ ...ef, comTipo: "valor" })} style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: `2px solid ${ef.comTipo === "valor" ? T.inf : T.bor}`, background: ef.comTipo === "valor" ? T.inf + "1A" : T.inp, color: ef.comTipo === "valor" ? T.inf : T.tm, fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>R$ por Conta Ativa</button>
            </div>
            <Inp label={ef.comTipo === "pct" ? "Percentual (%)" : "Valor por conta (R$)"} value={ef.comVal} onChange={v => setEf({ ...ef, comVal: v })} type="number" />
          </div>
          {/* Convênios */}
          {allConvenios.length > 0 && (
            <div style={{ marginTop: 14, padding: 14, background: T.bg2, border: `1px solid ${T.bor}`, borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.t2, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>🤝 Convênios</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {allConvenios.map(c => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, border: `1px solid ${editConvIds.includes(c.id) ? T.ac : T.bor}`, background: editConvIds.includes(c.id) ? T.ac + "15" : T.inp, cursor: "pointer", fontSize: 12, color: editConvIds.includes(c.id) ? T.ac : T.txt, fontWeight: editConvIds.includes(c.id) ? 600 : 400 }}>
                    <input type="checkbox" checked={editConvIds.includes(c.id)} onChange={() => setEditConvIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])} style={{ accentColor: T.ac }} />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div style={{ marginTop: 16, padding: 14, background: T.er + "0A", border: `1px solid ${T.er}25`, borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.er, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Senha</div>
            {resetPwResult ? (
              <div>
                <div style={{ padding: 10, background: T.bg2, borderRadius: 6, fontFamily: "'Space Mono',monospace", fontSize: 14, fontWeight: 600, color: T.ac, marginBottom: 8 }}>{resetPwResult}</div>
                <Btn sm onClick={() => navigator.clipboard.writeText(resetPwResult)}>Copiar senha</Btn>
              </div>
            ) : (
              <Btn v="danger" sm onClick={resetParcPw}>Resetar Senha</Btn>
            )}
          </div>
        </div>}
      </Modal>
    </div>
  );
}

// ===== CONVÊNIO PAGE (read-only dashboard for convenio role) =====
function ConvenioPage() {
  const { user } = useAuth();
  const { breakpoint } = useBreakpoint();
  const [convs, setConvs] = useState([]);
  const [sel, setSel] = useState(null);
  const [stats, setStats] = useState(null);
  const [parceiros, setParceiros] = useState([]);
  const [indications, setIndications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("parceiros");

  useEffect(() => {
    conveniosApi.getAll().then(r => {
      const list = r.data.convenios || [];
      setConvs(list);
      if (list.length > 0) setSel(list[0]);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!sel) return;
    Promise.all([
      conveniosApi.getStats(sel.id),
      conveniosApi.getParceiros(sel.id),
      conveniosApi.getIndications(sel.id)
    ]).then(([s, p, i]) => {
      setStats(s.data.stats);
      setParceiros(p.data.parceiros || []);
      setIndications(i.data.indications || []);
    }).catch(console.error);
  }, [sel]);

  const SL = { novo: "Novo", em_contato: "Em Contato", proposta: "Proposta", negociacao: "Negociação", fechado: "Fechado", perdido: "Perdido" };
  const SC = { novo: T.inf, em_contato: T.wn, proposta: T.ac, negociacao: "#f59e0b", fechado: T.ok, perdido: T.er };
  const thS = { textAlign: "left", padding: "10px 14px", fontSize: 10, fontWeight: 600, color: T.tm, textTransform: "uppercase", borderBottom: `1px solid ${T.bor}`, background: T.bg2 };
  const tdS = { padding: "12px 14px", fontSize: 13, borderBottom: `1px solid ${T.bor}08` };

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: T.t2 }}>Carregando...</div>;
  if (convs.length === 0) return <div style={{ textAlign: "center", padding: 60, color: T.t2 }}>Nenhum convênio vinculado.</div>;

  return (
    <div>
      {/* Seletor de convênio */}
      {convs.length > 1 && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: T.t2, textTransform: "uppercase", marginBottom: 6, display: "block" }}>Selecionar Convênio</label>
          <select value={sel?.id || ""} onChange={e => setSel(convs.find(c => c.id === e.target.value))} style={{ padding: "10px 14px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 14, minWidth: 250 }}>
            {convs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr 1fr", sm: "1fr 1fr", md: "repeat(4, 1fr)", lg: "repeat(4, 1fr)" }), gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Parceiros", value: stats.totalParceiros, icon: "👥", color: T.ac },
            { label: "Total Indicações", value: stats.totalIndications, icon: "📋", color: T.inf },
            { label: "Taxa Conversão", value: `${stats.conversionRate}%`, icon: "🎯", color: T.ok },
            { label: "Ativas", value: stats.activeIndications, icon: "🔥", color: T.wn },
          ].map((c, i) => (
            <div key={i} style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: T.t2, textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5 }}>{c.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: c.color, marginTop: 4 }}>{c.value}</div>
                </div>
                <div style={{ fontSize: 28, opacity: 0.5 }}>{c.icon}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Status Distribution */}
      {stats?.statusDistribution?.length > 0 && (
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 18, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Distribuição por Status</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {stats.statusDistribution.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: (SC[s.status] || T.tm) + "15", borderRadius: 8, border: `1px solid ${(SC[s.status] || T.tm)}30` }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: SC[s.status] || T.tm }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: SC[s.status] || T.tm }}>{SL[s.status] || s.status}</span>
                <span style={{ fontSize: 14, fontWeight: 800 }}>{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs: Parceiros / Indicações */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.bor}`, marginBottom: 16 }}>
        {["parceiros", "indicações"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", border: "none", background: "none", color: tab === t ? T.ac : T.tm, fontFamily: "'DM Sans',sans-serif", borderBottom: `2px solid ${tab === t ? T.ac : "transparent"}`, marginBottom: -1, textTransform: "capitalize" }}>{t}</button>
        ))}
      </div>

      {/* Parceiros Table */}
      {tab === "parceiros" && (
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
          <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
            <thead><tr>{["Parceiro", "Empresa", "CNPJ", "Indicações", "Ativas"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {parceiros.length === 0 && <tr><td colSpan={5} style={{ ...tdS, textAlign: "center", color: T.t2 }}>Nenhum parceiro vinculado</td></tr>}
              {parceiros.map(p => (
                <tr key={p.id}>
                  <td style={{ ...tdS, fontWeight: 600 }}>{p.name}</td>
                  <td style={{ ...tdS, color: T.t2 }}>{p.empresa || "—"}</td>
                  <td style={{ ...tdS, fontFamily: "'Space Mono',monospace", fontSize: 11 }}>{p.cnpj || "—"}</td>
                  <td style={tdS}><Badge type="accent">{p.indication_count || 0}</Badge></td>
                  <td style={tdS}><Badge type="warning">{p.active_indications || 0}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Indicações Table */}
      {tab === "indicações" && (
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
          <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead><tr>{["Empresa", "Status", "Parceiro", "Data"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {indications.length === 0 && <tr><td colSpan={4} style={{ ...tdS, textAlign: "center", color: T.t2 }}>Nenhuma indicação</td></tr>}
              {indications.map(ind => (
                <tr key={ind.id}>
                  <td style={{ ...tdS, fontWeight: 600 }}>{ind.nome_fantasia || ind.razao_social}</td>
                  <td style={tdS}><Badge type={ind.status === "fechado" ? "success" : ind.status === "perdido" ? "danger" : "info"}>{SL[ind.status] || ind.status}</Badge></td>
                  <td style={{ ...tdS, color: T.t2 }}>{ind.owner_name}</td>
                  <td style={{ ...tdS, fontSize: 11, color: T.tm }}>{new Date(ind.created_at).toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

// ===== MINHAS INDICAÇÕES =====

function MinhasInd({ inds, setInds, notifs, setNotifs, users, cadenceRules }) {
  const { user } = useAuth();
  const { breakpoint } = useBreakpoint();
  const formatCnpj = (v) => {
    const n = v.replace(/\D/g, '').slice(0, 14);
    if (n.length <= 2) return n;
    if (n.length <= 5) return n.replace(/(\d{2})(\d+)/, '$1.$2');
    if (n.length <= 8) return n.replace(/(\d{2})(\d{3})(\d+)/, '$1.$2.$3');
    if (n.length <= 12) return n.replace(/(\d{2})(\d{3})(\d{3})(\d+)/, '$1.$2.$3/$4');
    return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d+)/, '$1.$2.$3/$4-$5');
  };
  const [modal, setModal] = useState(false);
  const [sel, setSel] = useState(null);
  const [view, setView] = useState("list");
  const [ck, setCk] = useState(false);
  const [hr, setHr] = useState(null);
  const [cnpjData, setCnpjData] = useState(null);
  const [f, setF] = useState({ emp: "", cnpj: "", cont: "", tel: "", em: "", nf: "", obs: "" });
  const myAll = inds.filter(i => i.pId === user.id);
  const today = new Date().toISOString().split("T")[0];

  // Filters
  const [mfSt, setMfSt] = useState("todos");
  const [mfLib, setMfLib] = useState("todos");
  const [mfDtDe, setMfDtDe] = useState("");
  const [mfDtAte, setMfDtAte] = useState("");
  const [mfQ, setMfQ] = useState("");

  const my = myAll.filter(i => {
    if (mfSt !== "todos" && i.st !== mfSt) return false;
    if (mfLib === "liberado" && i.lib !== "liberado") return false;
    if (mfLib === "bloqueado" && i.lib !== "bloqueado") return false;
    if (mfLib === "pendente" && i.lib !== null) return false;
    if (mfLib === "vencido" && !(i.lib === "liberado" && i.libExp && i.libExp < today)) return false;
    if (mfDtDe && i.dt < mfDtDe) return false;
    if (mfDtAte && i.dt > mfDtAte) return false;
    if (mfQ && !(i.emp || "").toLowerCase().includes(mfQ.toLowerCase()) && !(i.cnpj || "").includes(mfQ)) return false;
    return true;
  });
  const mHasFilters = mfSt !== "todos" || mfLib !== "todos" || mfDtDe || mfDtAte || mfQ;
  const mClearFilters = () => { setMfSt("todos"); setMfLib("todos"); setMfDtDe(""); setMfDtAte(""); setMfQ(""); };

  const selectInd = async (ind) => {
    setSel(ind);
    try {
      const res = await indicationsApi.getById(ind.id);
      if (res.data?.hist) {
        setSel(prev => prev && prev.id === ind.id ? { ...prev, hist: res.data.hist } : prev);
      }
    } catch (e) { console.error("Erro ao carregar histórico:", e); }
  };

  const checkHS = async () => {
    if (!f.cnpj || f.cnpj.replace(/\D/g, '').length < 14) {
      setHr({ error: true, message: 'CNPJ deve ter 14 dígitos' });
      return;
    }

    setCk(true); setHr(null); setCnpjData(null);

    try {
      // 1. Consulta CNPJ na Receita Federal via BrasilAPI
      let cnpjResult = null;
      try {
        const cnpjRes = await cnpjAgentApi.lookup(f.cnpj);
        cnpjResult = cnpjRes.data;

        // Formata dados da Receita
        const enrichment = {
          razao: cnpjResult.razao_social,
          fantasia: cnpjResult.nome_fantasia || cnpjResult.razao_social,
          capital: cnpjResult.capital_social?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '—',
          capitalRaw: cnpjResult.capital_social || null,
          abertura: cnpjResult.data_inicio_atividade || '—',
          cnae: `${cnpjResult.cnae_codigo || ''} - ${cnpjResult.cnae_principal || ''}`.trim() || '—',
          endereco: cnpjResult.endereco?.completo || '—',
          telefone: cnpjResult.telefone || '—',
          email: cnpjResult.email || '—',
          situacao: cnpjResult.situacao,
          socios: cnpjResult.socios || []
        };

        setCnpjData(enrichment);
        setF(prev => ({
          ...prev,
          emp: enrichment.razao,
          tel: enrichment.telefone !== '—' ? enrichment.telefone : prev.tel,
          em: enrichment.email !== '—' ? enrichment.email : prev.em
        }));
      } catch (cnpjError) {
        console.error('Erro ao consultar CNPJ:', cnpjError);
        // Se falhar na Receita, ainda tenta consultar HubSpot
        setCnpjData({
          razao: f.emp || 'Não encontrado na Receita',
          fantasia: '—', capital: '—', abertura: '—',
          cnae: '—', endereco: '—', situacao: 'Erro na consulta'
        });
      }

      // 2. Consulta HubSpot para verificar empresa e oportunidades
      try {
        const hsRes = await hubspotApi.search(f.cnpj);
        const hsData = hsRes.data;

        if (hsData.found && hsData.hasOpenDeals) {
          // Empresa encontrada COM oportunidades abertas - BLOQUEIA
          setHr({
            found: true,
            d: hsData.company?.name || 'Empresa',
            deals: hsData.openDeals,
            message: `${hsData.openDeals.length} oportunidade(s) aberta(s)`
          });
        } else if (hsData.found) {
          // Empresa encontrada SEM oportunidades abertas - PERMITE
          setHr({
            found: false,
            company: hsData.company,
            message: 'Empresa no HubSpot sem oportunidades abertas'
          });
        } else {
          // Empresa NÃO encontrada no HubSpot - PERMITE
          setHr({
            found: false,
            localIndication: hsData.localIndication,
            message: hsData.localIndication
              ? 'Indicação já existe no sistema local'
              : 'CNPJ não encontrado no HubSpot - pode indicar'
          });

          // Se já existe indicação local, bloqueia
          if (hsData.localIndication) {
            setHr(prev => ({ ...prev, found: true, d: hsData.localIndication.razao_social }));
          }
        }
      } catch (hsError) {
        console.error('Erro ao consultar HubSpot:', hsError);
        // Se HubSpot falhar, verifica apenas localmente
        const localFound = inds.find(i => i.cnpj.replace(/\D/g, '') === f.cnpj.replace(/\D/g, ''));
        setHr(localFound
          ? { found: true, d: localFound.emp, message: 'Já existe indicação local' }
          : { found: false, message: 'HubSpot indisponível - verificação local OK' }
        );
      }
    } catch (error) {
      console.error('Erro na consulta:', error);
      setHr({ error: true, message: 'Erro na consulta. Tente novamente.' });
    } finally {
      setCk(false);
    }
  };

  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await indicationsApi.create({
        cnpj: f.cnpj,
        razao_social: cnpjData?.razao || f.emp,
        nome_fantasia: cnpjData?.fantasia || f.emp,
        contato_nome: f.cont,
        contato_telefone: f.tel,
        contato_email: f.em,
        num_funcionarios: parseInt(f.nf) || 0,
        manager_id: user.gId,
        capital: cnpjData?.capitalRaw || null,
        abertura: cnpjData?.abertura || null,
        cnae: cnpjData?.cnae || null,
        endereco: cnpjData?.endereco || null,
        notes: f.obs || null,
        hubspot_analysis: hr ? JSON.stringify(hr) : null,
      });
      const newInd = transformIndication(res.data.indication);
      setInds(p => [...p, newInd]);
      setModal(false); setF({ emp: "", cnpj: "", cont: "", tel: "", em: "", nf: "", obs: "" }); setHr(null); setCnpjData(null);
      // Notify gerente about new indication
      if (user.gId && isCadenceActive(cadenceRules, "cad_nova_indicacao")) {
        addNotif(setNotifs, { tipo: "sistema", titulo: "Nova indicação", msg: `Parceiro ${user.name} criou nova indicação: ${f.emp}.`, para: user.gId, de: user.id, link: "kanban" });
      }
    } catch (e) { console.error("Erro ao criar indicação:", e); alert(e.response?.data?.error || "Erro ao criar indicação"); }
    setSubmitting(false);
  };

  const thS = { textAlign: "left", padding: "12px 14px", fontSize: 10, fontWeight: 600, color: T.tm, textTransform: "uppercase", borderBottom: `1px solid ${T.bor}`, background: T.bg2 };
  const tdS = { padding: "12px 14px", fontSize: 13, borderBottom: `1px solid ${T.bor}` };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 4, background: T.inp, borderRadius: 6, padding: 3, border: `1px solid ${T.bor}` }}>
          <button onClick={() => setView("list")} style={{ padding: "6px 14px", borderRadius: 4, border: "none", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", background: view === "list" ? T.ac : "transparent", color: view === "list" ? "#fff" : T.tm }}>📋 Lista</button>
          <button onClick={() => setView("kanban")} style={{ padding: "6px 14px", borderRadius: 4, border: "none", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", background: view === "kanban" ? T.ac : "transparent", color: view === "kanban" ? "#fff" : T.tm }}>📊 Funil</button>
        </div>
        <Btn onClick={() => setModal(true)}>＋ Nova Indicação</Btn>
      </div>

      {/* FILTERS */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap", padding: "10px 14px", background: T.card, border: `1px solid ${T.bor}`, borderRadius: 8 }}>
        <span style={{ fontSize: 11, color: T.tm, fontWeight: 600 }}>🔍 Filtros:</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, padding: "5px 10px" }}>
          <input value={mfQ} onChange={e => setMfQ(e.target.value)} placeholder="Buscar empresa/CNPJ..." style={{ background: "none", border: "none", color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 12, outline: "none", width: 150 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Status:</span>
          <select value={mfSt} onChange={e => setMfSt(e.target.value)} style={{ padding: "7px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 12, outline: "none" }}><option value="todos">Todos</option>{KCOLS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Liberação:</span>
          <select value={mfLib} onChange={e => setMfLib(e.target.value)} style={{ padding: "7px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 12, outline: "none" }}><option value="todos">Todos</option><option value="liberado">🔓 Liberado</option><option value="bloqueado">🔒 Bloqueado</option><option value="pendente">⏳ Pendente</option><option value="vencido">⚠️ Vencido</option></select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>De:</span>
          <input type="date" value={mfDtDe} onChange={e => setMfDtDe(e.target.value)} style={{ padding: "7px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 12, outline: "none" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", fontWeight: 600 }}>Até:</span>
          <input type="date" value={mfDtAte} onChange={e => setMfDtAte(e.target.value)} style={{ padding: "7px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 12, outline: "none" }} />
        </div>
        {mHasFilters && <>
          <button onClick={mClearFilters} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.er}44`, background: T.er + "11", color: T.er, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>✕ Limpar</button>
          <span style={{ fontSize: 11, color: T.t2 }}>{my.length} de {myAll.length}</span>
        </>}
      </div>

      {/* LIST VIEW */}
      {view === "list" && (
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
          <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead><tr>{["Empresa", "Contato", "Func.", "Status", "HubSpot", "Liberação", "Data"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {my.map(ind => (
                <tr key={ind.id} onClick={() => selectInd(ind)} style={{ cursor: "pointer" }}>
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
          </table></div>
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
                    <div key={ind.id} onClick={() => selectInd(ind)} style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 6, padding: 12, cursor: "pointer" }}>
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
      <Modal open={modal} onClose={() => { setModal(false); setHr(null); setCnpjData(null); }} title="Nova Indicação" wide footer={<><Btn v="secondary" onClick={() => { setModal(false); setHr(null); setCnpjData(null); }}>Cancelar</Btn><Btn onClick={submit} disabled={!f.emp || !f.cnpj || !f.cont}>Enviar</Btn></>}>
        <div style={{ marginBottom: 16, padding: 12, background: T.inp, borderRadius: 6, fontSize: 12, color: T.t2 }}>⚠️ Consulte o CNPJ para verificar no HubSpot e preencher dados automaticamente da Receita Federal.</div>
        <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "1fr 1fr", lg: "1fr 1fr" }), gap: 14 }}>
          <div style={{ gridColumn: "1/-1", marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>CNPJ *</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={f.cnpj} onChange={e => { setF({ ...f, cnpj: formatCnpj(e.target.value) }); setHr(null); setCnpjData(null); }} placeholder="00.000.000/0000-00" style={{ flex: 1, padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: "none" }} />
              <Btn v="secondary" sm onClick={checkHS} disabled={!f.cnpj || ck}>{ck ? "⏳ Consultando..." : "🔍 Consultar CNPJ"}</Btn>
            </div>
          </div>

          {/* Resultado HubSpot */}
          {hr && <div style={{ gridColumn: "1/-1", padding: 12, borderRadius: 6, background: hr.error ? T.wa + "11" : hr.found ? T.wa + "11" : T.ok + "11", border: `1px solid ${hr.error ? T.wa : hr.found ? T.wa : T.ok}33`, fontSize: 12 }}>
            {hr.error ? (
              <div style={{ color: T.wa }}>⚠️ {hr.message}</div>
            ) : hr.found ? (
              <div>
                <div style={{ color: T.wa, fontWeight: 600 }}>⚠️ Já existe oportunidade no HubSpot — a análise será enviada para revisão</div>
                <div style={{ color: T.t2, marginTop: 4 }}>{hr.message}</div>
                {hr.deals && hr.deals.length > 0 && (
                  <div style={{ marginTop: 8, padding: 8, background: T.bg2, borderRadius: 4 }}>
                    <div style={{ fontSize: 10, color: T.tm, marginBottom: 6 }}>OPORTUNIDADES ENCONTRADAS:</div>
                    {hr.deals.map((deal, i) => (
                      <div key={i} style={{ fontSize: 11, color: T.t2, padding: "4px 0", borderBottom: i < hr.deals.length - 1 ? `1px solid ${T.bor}` : 'none' }}>
                        <strong>{deal.name}</strong> - {deal.stage} {deal.amount && `(R$ ${Number(deal.amount).toLocaleString('pt-BR')})`}
                      </div>
                    ))}
                  </div>
                )}
                {hr.lastInteraction && (
                  <div style={{ marginTop: 8, padding: 8, background: T.bg2, borderRadius: 4 }}>
                    <div style={{ fontSize: 10, color: T.tm, marginBottom: 4 }}>ÚLTIMA INTERAÇÃO:</div>
                    <div style={{ fontSize: 11, color: T.t2 }}>
                      <strong>{hr.lastInteraction.type}</strong> — {hr.lastInteraction.date ? new Date(hr.lastInteraction.date).toLocaleDateString('pt-BR') : '—'}
                    </div>
                    {hr.lastInteraction.summary && <div style={{ fontSize: 11, color: T.tm, marginTop: 2 }}>{hr.lastInteraction.summary.slice(0, 150)}{hr.lastInteraction.summary.length > 150 ? '...' : ''}</div>}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: T.ok }}>✅ {hr.message || "Pode indicar!"}</div>
            )}
          </div>}

          {/* CNPJ Enrichment Result */}
          {cnpjData && (
            <div style={{ gridColumn: "1/-1", padding: 14, background: T.inp, borderRadius: 8, border: `1px solid ${cnpjData.situacao === 'ATIVA' ? T.ok : T.wa}33` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.inf, textTransform: "uppercase", letterSpacing: 0.5 }}>📋 Dados da Receita Federal</div>
                {cnpjData.situacao && (
                  <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: cnpjData.situacao === 'ATIVA' ? T.ok + '22' : T.wa + '22', color: cnpjData.situacao === 'ATIVA' ? T.ok : T.wa, fontWeight: 600 }}>
                    {cnpjData.situacao}
                  </span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 12 }}>
                {[["Razão Social", cnpjData.razao], ["Nome Fantasia", cnpjData.fantasia], ["Capital Social", `R$ ${cnpjData.capital}`], ["Data Abertura", cnpjData.abertura], ["CNAE", cnpjData.cnae], ["Endereço", cnpjData.endereco], ["Telefone", cnpjData.telefone], ["E-mail", cnpjData.email]].map(([l, v], i) => (
                  <div key={i} style={{ padding: "4px 0" }}>
                    <div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase" }}>{l}</div>
                    <div style={{ color: T.t2, marginTop: 2 }}>{v || '—'}</div>
                  </div>
                ))}
              </div>
              {cnpjData.socios && cnpjData.socios.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.bor}` }}>
                  <div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase", marginBottom: 6 }}>👥 Sócios ({cnpjData.socios.length})</div>
                  {cnpjData.socios.slice(0, 3).map((s, i) => (
                    <div key={i} style={{ fontSize: 11, color: T.t2, padding: "3px 0" }}>
                      {s.nome} <span style={{ color: T.tm }}>({s.qualificacao})</span>
                    </div>
                  ))}
                  {cnpjData.socios.length > 3 && <div style={{ fontSize: 10, color: T.tm }}>+{cnpjData.socios.length - 3} sócio(s)</div>}
                </div>
              )}
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
            <div style={{ marginTop: 12 }}><Btn v="secondary" sm onClick={async () => { try { const res = await materialsApi.download(m.id); if (res.data.type === 'application/json') { const text = await res.data.text(); const err = JSON.parse(text); alert(err.error || "Erro ao baixar arquivo"); return; } const url = window.URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url; a.download = `${m.t}.${m.tipo || 'bin'}`; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url); } catch (e) { console.error("Erro no download:", e); alert("Erro ao baixar arquivo"); } }}>⬇ Download</Btn></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== CONVÊNIOS TAB (inside CfgPage) =====
function ConveniosTab() {
  const [convs, setConvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [delConf, setDelConf] = useState(null);

  const load = async () => {
    try {
      const r = await conveniosApi.getAll();
      setConvs(r.data.convenios || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      if (editModal) {
        const r = await conveniosApi.update(editModal.id, form);
        setConvs(prev => prev.map(c => c.id === editModal.id ? r.data.convenio : c));
        setEditModal(null);
      } else {
        const r = await conveniosApi.create(form);
        setConvs(prev => [...prev, r.data.convenio]);
        setModal(false);
      }
      setForm({ name: "", description: "" });
    } catch (e) { alert(e.response?.data?.error || "Erro ao salvar"); }
    setSaving(false);
  };

  const del = async (id) => {
    try {
      await conveniosApi.delete(id);
      setConvs(prev => prev.map(c => c.id === id ? { ...c, is_active: 0 } : c));
      setDelConf(null);
    } catch (e) { alert(e.response?.data?.error || "Erro ao desativar"); }
  };

  const thS = { padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: T.t2, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `1px solid ${T.bor}` };
  const tdS = { padding: "12px 14px", fontSize: 13, borderBottom: `1px solid ${T.bor}08`, verticalAlign: "middle" };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: T.t2 }}>Carregando...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: T.t2 }}>{convs.length} convênio(s) cadastrado(s)</p>
        <Btn onClick={() => { setForm({ name: "", description: "" }); setModal(true); }}>+ Novo Convênio</Btn>
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${T.bor}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: T.bg }}>
            <th style={thS}>Nome</th>
            <th style={thS}>Descrição</th>
            <th style={thS}>Parceiros</th>
            <th style={thS}>Status</th>
            <th style={thS}>Ações</th>
          </tr></thead>
          <tbody>
            {convs.length === 0 && <tr><td colSpan={5} style={{ ...tdS, textAlign: "center", color: T.t2 }}>Nenhum convênio cadastrado</td></tr>}
            {convs.map(c => (
              <tr key={c.id} style={{ background: T.card }}>
                <td style={{ ...tdS, fontWeight: 600 }}>{c.name}</td>
                <td style={{ ...tdS, color: T.t2 }}>{c.description || "—"}</td>
                <td style={tdS}><Badge type="accent">{c.parceiro_count || 0}</Badge></td>
                <td style={tdS}><Badge type={c.is_active ? "success" : "muted"}>{c.is_active ? "Ativo" : "Inativo"}</Badge></td>
                <td style={tdS}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { setForm({ name: c.name, description: c.description || "" }); setEditModal(c); }} style={{ background: "none", border: `1px solid ${T.bor}`, borderRadius: 6, cursor: "pointer", padding: "4px 8px", color: T.t2, fontSize: 13 }} title="Editar">✏️</button>
                    {c.is_active ? (
                      <button onClick={() => setDelConf(c)} style={{ background: "none", border: `1px solid ${T.er}44`, borderRadius: 6, cursor: "pointer", padding: "4px 8px", color: T.er, fontSize: 13 }} title="Desativar">🗑️</button>
                    ) : (
                      <button onClick={async () => { await conveniosApi.update(c.id, { is_active: true }); load(); }} style={{ background: "none", border: `1px solid ${T.ok}44`, borderRadius: 6, cursor: "pointer", padding: "4px 8px", color: T.ok, fontSize: 13 }} title="Reativar">♻️</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      <Modal open={modal || !!editModal} onClose={() => { setModal(false); setEditModal(null); }} title={editModal ? "Editar Convênio" : "Novo Convênio"} footer={<>
        <Btn v="secondary" onClick={() => { setModal(false); setEditModal(null); }}>Cancelar</Btn>
        <Btn onClick={save} disabled={!form.name.trim() || saving}>{saving ? "Salvando..." : "Salvar"}</Btn>
      </>}>
        <Inp label="Nome" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Nome do convênio" />
        <Inp label="Descrição" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} placeholder="Descrição (opcional)" />
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!delConf} onClose={() => setDelConf(null)} title="Desativar Convênio" footer={<>
        <Btn v="secondary" onClick={() => setDelConf(null)}>Cancelar</Btn>
        <Btn v="danger" onClick={() => del(delConf.id)}>Desativar</Btn>
      </>}>
        <p style={{ fontSize: 14, color: T.txt }}>Tem certeza que deseja desativar o convênio <strong>{delConf?.name}</strong>?</p>
        <p style={{ fontSize: 12, color: T.t2, marginTop: 8 }}>Os parceiros vinculados não serão afetados.</p>
      </Modal>
    </div>
  );
}

// ===== CONFIG =====
function CfgPage({ mats, setMats, users, setUsers, inds, travaDias, setTravaDias, notifs, setNotifs, cadenceRules, setCadenceRules }) {
  const { user } = useAuth();
  const { breakpoint } = useBreakpoint();
  const isSA = user.role === "super_admin";
  const [cfg, setCfg] = useState({ prazo: 5, minF: 20, hsKey: "", hsPipe: "", emOn: true, waOn: false });
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState("geral");
  const [hsStatus, setHsStatus] = useState({ connected: null, message: "" });
  const [hsPipelines, setHsPipelines] = useState([]);
  const [hsLoading, setHsLoading] = useState(false);
  const [hsSaving, setHsSaving] = useState(false);
  const [hsKeyPreview, setHsKeyPreview] = useState(null);

  // Load HubSpot config on mount
  useEffect(() => {
    if (isSA || user.role === "executivo") {
      hubspotApi.getConfig().then(r => {
        const d = r.data;
        setHsKeyPreview(d.apiKeyPreview);
        setCfg(prev => ({ ...prev, hsPipe: d.pipelineId || "", hsKey: "" }));
        if (d.hasApiKey) {
          hubspotApi.test().then(t => setHsStatus(t.data)).catch(() => setHsStatus({ connected: false, message: "Erro ao testar" }));
        }
      }).catch(() => {});
    }
    conveniosApi.getAll().then(async r => {
      const convs = (r.data.convenios || []).filter(c => c.is_active);
      setCfgConvenios(convs);
      const cmap = {};
      for (const c of convs) {
        try {
          const pr = await conveniosApi.getParceiros(c.id);
          cmap[c.id] = new Set((pr.data.parceiros || []).map(p => p.id));
        } catch { cmap[c.id] = new Set(); }
      }
      setCfgConvParMap(cmap);
    }).catch(() => {});
  }, []);
  const [matModal, setMatModal] = useState(false);
  const [mf, setMf] = useState({ t: "", tipo: "pdf", cat: "comercial", sz: "", file: null, fileName: "" });
  const [matSaving, setMatSaving] = useState(false);
  const [delConf, setDelConf] = useState(null);
  const [userModal, setUserModal] = useState(false);
  const [uf, setUf] = useState({ name: "", email: "", pw: "", role: "gerente", dId: "", eId: "" });
  const [ufConvIds, setUfConvIds] = useState([]);
  const [cfgConvenios, setCfgConvenios] = useState([]);
  const [cfgConvParMap, setCfgConvParMap] = useState({});
  const [delUserConf, setDelUserConf] = useState(null);
  const [uSearch, setUSearch] = useState("");
  const [uRoleFilter, setURoleFilter] = useState("");
  const [editUser, setEditUser] = useState(null);
  const [euF, setEuF] = useState({ name: "", role: "", managerId: "", isActive: true });
  const [euSaving, setEuSaving] = useState(false);
  const [euResetPw, setEuResetPw] = useState(null);
  // Parceiros tab state
  const [pSearch, setPSearch] = useState("");
  const [pExecFilter, setPExecFilter] = useState("");
  const [editParcCfg, setEditParcCfg] = useState(null);
  const [epF, setEpF] = useState({ name: "", email: "", empresa: "", cnpj: "", tel: "", comTipo: "pct", comVal: "", managerId: "" });
  const [epSaving, setEpSaving] = useState(false);
  const [epResetPw, setEpResetPw] = useState(null);
  const [delParcCfg, setDelParcCfg] = useState(null);
  const [delParcTransfer, setDelParcTransfer] = useState("");

  // Audit tab state
  const AUDIT_LIMIT = 50;
  const ACTION_LABELS = { created: "Criação", status_change: "Mudança de Status", obs: "Observação", liberacao: "Liberação", transfer: "Transferência", deleted: "Exclusão" };
  const ACTION_BADGE = { created: "success", status_change: "warning", obs: "info", liberacao: "info", transfer: "info", deleted: "danger" };
  const [auditData, setAuditData] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilters, setAuditFilters] = useState({ user_id: "", action: "", date_from: "", date_to: "", search: "" });

  const loadAudit = async (page = 0, filters = auditFilters) => {
    setAuditLoading(true);
    try {
      const params = { limit: AUDIT_LIMIT, offset: page * AUDIT_LIMIT };
      if (filters.user_id) params.user_id = filters.user_id;
      if (filters.action) params.action = filters.action;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.search) params.search = filters.search;
      const res = await indicationsApi.getAudit(params);
      setAuditData(res.data.entries);
      setAuditTotal(res.data.total);
      setAuditPage(page);
    } catch (e) { console.error("Audit load error:", e); }
    setAuditLoading(false);
  };

  const openEditParcCfg = (p) => {
    setEpF({ name: p.name, email: p.email || "", empresa: p.empresa || "", cnpj: p.cnpj || "", tel: p.tel || "", comTipo: p.comTipo || "pct", comVal: p.comVal != null ? String(p.comVal) : "", managerId: p.gId || "" });
    setEditParcCfg(p);
    setEpResetPw(null);
  };

  const saveEditParcCfg = async () => {
    if (!editParcCfg || epSaving) return;
    setEpSaving(true);
    try {
      await usersApi.update(editParcCfg.id, {
        name: epF.name, empresa: epF.empresa, tel: epF.tel, cnpj: epF.cnpj.replace(/\D/g, '') || null,
        com_tipo: epF.comTipo, com_val: parseFloat(epF.comVal) || 0, manager_id: epF.managerId || null
      });
      setUsers(prev => prev.map(u => u.id === editParcCfg.id ? { ...u, name: epF.name, empresa: epF.empresa, tel: epF.tel, cnpj: epF.cnpj, comTipo: epF.comTipo, comVal: parseFloat(epF.comVal) || 0, gId: epF.managerId } : u));
      setEditParcCfg(null);
    } catch (e) { alert(e.response?.data?.error || "Erro ao salvar"); }
    setEpSaving(false);
  };

  const resetParcCfgPw = async () => {
    if (!editParcCfg) return;
    try {
      const res = await usersApi.resetPassword(editParcCfg.id);
      setEpResetPw(res.data.password);
    } catch (e) { alert(e.response?.data?.error || "Erro ao resetar senha"); }
  };

  const delParceiro = async () => {
    if (!delParcCfg) return;
    try {
      const body = delParcTransfer ? { transferTo: delParcTransfer } : undefined;
      await usersApi.delete(delParcCfg.id, body);
      setUsers(prev => prev.filter(u => u.id !== delParcCfg.id));
      setDelParcCfg(null);
      setDelParcTransfer("");
    } catch (e) { alert(e.response?.data?.error || "Erro ao excluir parceiro"); }
  };

  const openEditUser = (u) => {
    setEuF({ name: u.name, role: u.role, managerId: u.dId || u.eId || "", isActive: true });
    setEditUser(u);
    setEuResetPw(null);
  };

  const saveEditUser = async () => {
    if (!editUser || euSaving) return;
    setEuSaving(true);
    try {
      const managerId = euF.role === "gerente" ? euF.managerId : euF.role === "diretor" ? euF.managerId : undefined;
      await usersApi.update(editUser.id, {
        name: euF.name, role: euF.role, manager_id: managerId,
        is_active: euF.isActive
      });
      setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, name: euF.name, role: euF.role, eId: euF.role === "diretor" ? euF.managerId : u.eId, dId: euF.role === "gerente" ? euF.managerId : u.dId } : u));
      setEditUser(null);
    } catch (e) { alert(e.response?.data?.error || "Erro ao salvar"); }
    setEuSaving(false);
  };

  const resetUserPw = async () => {
    if (!editUser) return;
    try {
      const res = await usersApi.resetPassword(editUser.id);
      setEuResetPw(res.data.password);
    } catch (e) { alert(e.response?.data?.error || "Erro ao resetar senha"); }
  };
  // Segmented communication state
  const [commForm, setCommForm] = useState({ titulo: "", msg: "", perfis: [], individuais: [], prioridade: "info", convenio: "" });
  const [commHist, setCommHist] = useState([
    { id: "ch1", titulo: "Atualização de política comercial", msg: "Informamos que a nova política de comissionamento entra em vigor em Março/2025.", perfis: ["parceiro"], dt: "2025-02-01 10:00", por: "Super Admin", total: 4 },
    { id: "ch2", titulo: "Treinamento Plataforma", msg: "Participe do treinamento sobre a nova plataforma dia 15/02 às 14h.", perfis: ["parceiro", "gerente"], dt: "2025-01-28 15:30", por: "Super Admin", total: 7 },
  ]);
  const [commSent, setCommSent] = useState(false);
  const [cadEditModal, setCadEditModal] = useState(null);

  const addMat = async () => {
    if (!mf.t) return;
    setMatSaving(true);
    try {
      const fd = new FormData();
      fd.append("title", mf.t);
      fd.append("category", mf.cat);
      fd.append("file_type", mf.tipo);
      fd.append("roles_allowed", "all");
      if (mf.file) fd.append("file", mf.file);

      const r = await materialsApi.create(fd);
      const m = r.data.material;
      setMats(prev => [...prev, {
        id: m.id, t: m.title, tipo: m.file_type || mf.tipo, cat: m.category,
        sz: mf.file ? (mf.file.size / (1024 * 1024)).toFixed(1) + " MB" : "—",
        dt: new Date().toISOString().split("T")[0], arq: m.file_path
      }]);
      setMatModal(false);
      setMf({ t: "", tipo: "pdf", cat: "comercial", sz: "", file: null, fileName: "" });
    } catch (e) { console.error("Erro ao adicionar material:", e); }
    setMatSaving(false);
  };

  const delMat = async (id) => {
    try {
      await materialsApi.delete(id);
      setMats(prev => prev.filter(m => m.id !== id));
      setDelConf(null);
    } catch (e) { console.error("Erro ao excluir material:", e); alert(e.response?.data?.error || "Erro ao excluir"); }
  };

  const [addingUser, setAddingUser] = useState(false);
  const addUser = async () => {
    if (!uf.name || !uf.email || !uf.pw || addingUser) return;
    if (uf.role === "gerente" && !uf.dId) return;
    if (uf.role === "diretor" && !uf.eId) return;
    if (uf.role === "convenio" && ufConvIds.length === 0) return;
    setAddingUser(true);
    try {
      const managerId = uf.role === "gerente" ? uf.dId : uf.role === "diretor" ? uf.eId : undefined;
      const res = await usersApi.create({
        email: uf.email, password: uf.pw, name: uf.name, role: uf.role,
        manager_id: managerId,
        convenio_ids: uf.role === "convenio" ? ufConvIds : undefined
      });
      const u = res.data.user;
      setUsers(prev => [...prev, transformUser(u)]);
      setUserModal(false);
      setUf({ name: "", email: "", pw: "", role: "gerente", dId: "", eId: "" });
      setUfConvIds([]);
    } catch (e) { console.error("Erro ao criar usuário:", e); alert(e.response?.data?.error || "Erro ao criar usuário"); }
    setAddingUser(false);
  };

  const delUser = async (id) => {
    try {
      await usersApi.delete(id);
      setUsers(prev => prev.filter(u => u.id !== id));
      setDelUserConf(null);
    } catch (e) { console.error("Erro ao excluir usuário:", e); alert(e.response?.data?.error || "Erro ao excluir"); }
  };

  const tc = { pdf: T.er, xlsx: T.ok, docx: T.inf, mp4: "#8b5cf6" };
  const thS = { textAlign: "left", padding: "12px 14px", fontSize: 10, fontWeight: 600, color: T.tm, textTransform: "uppercase", borderBottom: `1px solid ${T.bor}`, background: T.bg2 };
  const tdS = { padding: "12px 14px", fontSize: 13, borderBottom: `1px solid ${T.bor}` };

  return (
    <div>
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.bor}`, marginBottom: 20 }}>
        {["geral", "hubspot", "notificações", "usuários", "parceiros", "convênios", "materiais", "auditoria"].map(t => <button key={t} onClick={() => { setTab(t); if (t === "auditoria" && auditData.length === 0 && !auditLoading) loadAudit(0, auditFilters); }} style={{ padding: "10px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", border: "none", background: "none", color: tab === t ? T.ac : T.tm, fontFamily: "'DM Sans',sans-serif", borderBottom: `2px solid ${tab === t ? T.ac : "transparent"}`, marginBottom: -1, textTransform: "capitalize" }}>{t}</button>)}
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
              <div style={{ fontSize: 11, color: T.tm, marginTop: 2 }}>Ao liberar uma indicação, a trava expira após este período. Executivos podem estender até +60 dias.</div>
            </div>
            <input type="number" value={travaDias} onChange={e => setTravaDias(parseInt(e.target.value) || 90)} style={{ width: 90, textAlign: "right", padding: "8px 10px", background: T.inp, border: `1px solid ${T.ac}44`, borderRadius: 6, color: T.ac, fontFamily: "'Space Mono',monospace", fontSize: 15, fontWeight: 700, outline: "none" }} />
          </div>
        </div>

        {/* Commission Model */}
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>💰 Modelo de Comissionamento</h3>
          <p style={{ fontSize: 12, color: T.tm, marginBottom: 16 }}>Cada parceiro recebe uma condição comercial individual — escolha entre percentual ou valor fixo:</p>
          <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "1fr 1fr", lg: "1fr 1fr" }), gap: 14, marginBottom: 16 }}>
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
            <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead><tr>{["Parceiro", "Empresa", "Tipo", "Valor", "Executivo"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>{users.filter(u => u.role === "parceiro").map(p => (
                <tr key={p.id}>
                  <td style={{ ...tdS, fontWeight: 600 }}>{p.name}</td>
                  <td style={{ ...tdS, fontSize: 12, color: T.t2 }}>{p.empresa || "—"}</td>
                  <td style={tdS}>
                    <select value={p.comTipo || "pct"} onChange={e => { const v = e.target.value; setUsers(prev => prev.map(u => u.id === p.id ? { ...u, comTipo: v } : u)); usersApi.update(p.id, { com_tipo: v }).catch(err => console.error("Erro ao atualizar comTipo:", err)); }}
                      style={{ padding: "5px 8px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 4, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 11, outline: "none" }}>
                      <option value="pct">% Cashin</option>
                      <option value="valor">R$/Conta</option>
                    </select>
                  </td>
                  <td style={tdS}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {p.comTipo === "valor" && <span style={{ fontSize: 11, color: T.tm }}>R$</span>}
                      <input type="number" step={p.comTipo === "pct" ? "0.1" : "0.5"} value={p.comVal ?? ""} onChange={e => { const v = parseFloat(e.target.value) || 0; setUsers(prev => prev.map(u => u.id === p.id ? { ...u, comVal: v } : u)); }} onBlur={e => { usersApi.update(p.id, { com_val: parseFloat(e.target.value) || 0 }).catch(err => console.error("Erro ao atualizar comVal:", err)); }}
                        style={{ width: 80, textAlign: "right", padding: "5px 8px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 4, color: p.comTipo === "pct" ? T.ac : T.inf, fontFamily: "'Space Mono',monospace", fontSize: 12, fontWeight: 700, outline: "none" }} />
                      {p.comTipo === "pct" && <span style={{ fontSize: 11, color: T.tm }}>%</span>}
                    </div>
                  </td>
                  <td style={{ ...tdS, fontSize: 12, color: T.tm }}>{users.find(u => u.id === p.gId)?.name || "—"}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </div>
        </div>
      </div>}
      {tab === "hubspot" && <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Integração HubSpot</h3>

        {/* Status de conexão */}
        {hsStatus.connected !== null && (
          <div style={{ padding: 14, background: hsStatus.connected ? T.ok + "0D" : T.er + "0D", border: `1px solid ${hsStatus.connected ? T.ok : T.er}25`, borderRadius: 6, fontSize: 13, color: hsStatus.connected ? T.ok : T.er, fontWeight: 600, marginBottom: 16 }}>
            {hsStatus.connected ? "✓ Conexão ativa" : "✗ " + hsStatus.message}
          </div>
        )}

        {/* API Key */}
        <div style={{ marginBottom: 12 }}>
          <Inp label={`API Key${hsKeyPreview ? ` (atual: ${hsKeyPreview})` : ""}`} value={cfg.hsKey} onChange={v => setCfg({ ...cfg, hsKey: v })} type="password" placeholder="pat-na1-..." />
          <p style={{ fontSize: 11, color: T.tm, marginTop: 2 }}>Deixe em branco para manter a chave atual</p>
        </div>

        {/* Botão salvar API Key e testar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <Btn v="primary" onClick={async () => {
            if (!cfg.hsKey && !hsKeyPreview) return;
            setHsSaving(true);
            try {
              if (cfg.hsKey) await hubspotApi.saveConfig({ apiKey: cfg.hsKey });
              const t = await hubspotApi.test();
              setHsStatus(t.data);
              if (t.data.connected) {
                setCfg(prev => ({ ...prev, hsKey: "" }));
                const r = await hubspotApi.getConfig();
                setHsKeyPreview(r.data.apiKeyPreview);
              }
            } catch { setHsStatus({ connected: false, message: "Erro ao salvar" }); }
            setHsSaving(false);
          }} disabled={hsSaving}>{hsSaving ? "Salvando..." : cfg.hsKey ? "Salvar e Testar" : "Testar Conexão"}</Btn>
        </div>

        {/* Pipeline */}
        {hsStatus.connected && <>
          <div style={{ borderTop: `1px solid ${T.bor}`, paddingTop: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600 }}>Pipeline de Deals</h4>
              <Btn v="ghost" onClick={async () => {
                setHsLoading(true);
                try {
                  const r = await hubspotApi.getPipelines();
                  setHsPipelines(r.data.pipelines || []);
                } catch { setHsPipelines([]); }
                setHsLoading(false);
              }} disabled={hsLoading}>{hsLoading ? "Carregando..." : "Buscar Pipelines"}</Btn>
            </div>

            {hsPipelines.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: T.t2, marginBottom: 4, display: "block" }}>Selecione o Pipeline</label>
                <select value={cfg.hsPipe} onChange={e => setCfg({ ...cfg, hsPipe: e.target.value })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
                  <option value="">Todos os pipelines</option>
                  {hsPipelines.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            )}

            {/* Mostrar stages do pipeline selecionado */}
            {cfg.hsPipe && hsPipelines.length > 0 && (() => {
              const sel = hsPipelines.find(p => p.id === cfg.hsPipe);
              if (!sel) return null;
              return (
                <div style={{ background: T.bg2, borderRadius: 6, padding: 12, marginBottom: 12 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: T.t2, marginBottom: 8 }}>Stages do pipeline "{sel.label}":</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {sel.stages.map(s => <Badge key={s.id} type="info">{s.label}</Badge>)}
                  </div>
                </div>
              );
            })()}

            {!cfg.hsPipe && <p style={{ fontSize: 12, color: T.tm }}>Nenhum pipeline selecionado — todos os deals serão considerados na verificação.</p>}
          </div>

          {/* Botão salvar Pipeline */}
          <Btn v="primary" onClick={async () => {
            setHsSaving(true);
            try {
              await hubspotApi.saveConfig({ pipelineId: cfg.hsPipe || null });
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            } catch {}
            setHsSaving(false);
          }} disabled={hsSaving}>{hsSaving ? "Salvando..." : "Salvar Pipeline"}</Btn>
          {saved && <span style={{ marginLeft: 10, fontSize: 13, color: T.ok, fontWeight: 600 }}>Salvo!</span>}
        </>}
      </div>}
      {tab === "notificações" && <div>
        {/* Canal Preferences */}
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📡 Canais de Notificação</h3>
          {[{ l: "E-mail", k: "emOn", ico: "📧", desc: "Receba notificações por e-mail" }].map((r, i) => (
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
          <p style={{ fontSize: 12, color: T.tm, marginBottom: 16 }}>Notificações disparadas automaticamente a cada ação no sistema.{isSA && " Clique no toggle para ativar/desativar ou no lápis para editar."}</p>
          <div style={{ background: T.bg2, borderRadius: 8, border: `1px solid ${T.bor}`, overflow: "hidden" }}>
            <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead><tr>{["Evento", "Notifica", "Tipo", "Status", ...(isSA ? ["Ações"] : [])].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>
                {cadenceRules.map((r) => {
                  const nt = NOTIF_TYPES[r.tipo] || NOTIF_TYPES.sistema;
                  return (
                    <tr key={r.id}>
                      <td style={{ ...tdS, fontWeight: 500 }}>{r.ev}</td>
                      <td style={{ ...tdS, fontSize: 12 }}>{r.dest}</td>
                      <td style={tdS}><span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: nt.color + "22", color: nt.color }}>{nt.emoji} {nt.label}</span></td>
                      <td style={tdS}>
                        {isSA ? (
                          <button onClick={() => setCadenceRules(prev => prev.map(x => x.id === r.id ? { ...x, ativo: !x.ativo } : x))} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative", background: r.ativo ? T.ac : T.bor, transition: "background 0.2s" }}>
                            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: r.ativo ? 23 : 3, transition: "all 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
                          </button>
                        ) : (
                          <Badge type={r.ativo ? "success" : "muted"}>{r.ativo ? "✓ Ativo" : "✗ Inativo"}</Badge>
                        )}
                      </td>
                      {isSA && (
                        <td style={tdS}>
                          <button onClick={() => setCadEditModal({ ...r })} style={{ background: "none", border: `1px solid ${T.bor}`, borderRadius: 6, cursor: "pointer", padding: "4px 8px", color: T.t2, fontSize: 13 }} title="Editar regra">✏️</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        </div>

        {/* Cadence Edit Modal */}
        <Modal open={!!cadEditModal} onClose={() => setCadEditModal(null)} title="Editar Regra de Cadência" footer={<>
          <button onClick={() => setCadEditModal(null)} style={{ padding: "8px 18px", borderRadius: 6, border: `1px solid ${T.bor}`, background: "transparent", color: T.t2, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>Cancelar</button>
          <button onClick={() => { setCadenceRules(prev => prev.map(x => x.id === cadEditModal.id ? cadEditModal : x)); setCadEditModal(null); }} style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: T.ac, color: "#fff", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600 }}>Salvar</button>
        </>}>
          {cadEditModal && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Inp label="Evento" value={cadEditModal.ev} onChange={v => setCadEditModal(prev => ({ ...prev, ev: v }))} />
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Destinatário</label>
                <select value={cadEditModal.dest} onChange={e => setCadEditModal(prev => ({ ...prev, dest: e.target.value }))} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                  <option value="Parceiro">Parceiro</option>
                  <option value="Executivo">Executivo</option>
                  <option value="Superior hierárquico">Superior hierárquico</option>
                  <option value="Gerente">Gerente</option>
                </select>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Tipo</label>
                <select value={cadEditModal.tipo} onChange={e => setCadEditModal(prev => ({ ...prev, tipo: e.target.value }))} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                  <option value="status">📋 Status</option>
                  <option value="financeiro">💰 Financeiro</option>
                  <option value="liberacao">🔓 Liberação</option>
                  <option value="sistema">⚙️ Sistema</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: T.txt }}>Ativo</label>
                <button onClick={() => setCadEditModal(prev => ({ ...prev, ativo: !prev.ativo }))} style={{ width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer", position: "relative", background: cadEditModal.ativo ? T.ac : T.bor, transition: "background 0.2s" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: cadEditModal.ativo ? 25 : 3, transition: "all 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
                </button>
              </div>
            </div>
          )}
        </Modal>

        {/* Segmented Communication */}
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>📢 Comunicação Segmentada</h3>
          <p style={{ fontSize: 12, color: T.tm, marginBottom: 16 }}>Envie comunicados direcionados para perfis ou usuários específicos.</p>

          <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "1fr 1fr", lg: "1fr 1fr" }), gap: 14, marginBottom: 16 }}>
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
            <div style={{ fontSize: 11, color: T.tm, marginTop: 6 }}>{commForm.perfis.length > 0 ? `${(() => { let u = users.filter(u => commForm.perfis.includes(u.role)); if (commForm.convenio && cfgConvParMap[commForm.convenio]) { const convSet = cfgConvParMap[commForm.convenio]; u = u.filter(x => x.role !== "parceiro" || convSet.has(x.id)); } return u.length; })()} usuário(s) alcançados` : "Selecione ao menos um perfil"}</div>
          </div>

          {commForm.perfis.includes("parceiro") && cfgConvenios.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Filtrar por convênio (opcional)</label>
              <select value={commForm.convenio} onChange={e => setCommForm(prev => ({ ...prev, convenio: e.target.value, individuais: [] }))} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                <option value="">Todos os convênios</option>
                {cfgConvenios.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {commForm.perfis.includes("parceiro") && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Ou selecione parceiros individuais (opcional)</label>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxHeight: 120, overflowY: "auto", padding: 8, background: T.inp, borderRadius: 6, border: `1px solid ${T.bor}` }}>
                {users.filter(u => u.role === "parceiro").filter(u => !commForm.convenio || !cfgConvParMap[commForm.convenio] || cfgConvParMap[commForm.convenio].has(u.id)).map(p => (
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
            <Btn onClick={async () => {
              if (!commForm.titulo || !commForm.msg || commForm.perfis.length === 0) return;
              let targets;
              if (commForm.individuais.length > 0) {
                targets = commForm.individuais;
              } else {
                let filtered = users.filter(u => commForm.perfis.includes(u.role));
                if (commForm.convenio && cfgConvParMap[commForm.convenio]) {
                  const convSet = cfgConvParMap[commForm.convenio];
                  filtered = filtered.filter(u => u.role !== "parceiro" || convSet.has(u.id));
                }
                targets = filtered.map(u => u.id);
              }
              try {
                const useUserIds = commForm.individuais.length > 0 || commForm.convenio;
                await notificationsApi.broadcast({ title: commForm.titulo, message: commForm.msg, type: 'info', roles: commForm.perfis, user_ids: useUserIds ? targets : undefined });
                targets.forEach(para => addNotif(setNotifs, { tipo: "comunicado", titulo: commForm.titulo, msg: commForm.msg, para, de: user.id, link: "notifs" }));
                setCommHist(prev => [{ id: "ch" + Date.now(), titulo: commForm.titulo, msg: commForm.msg, perfis: [...commForm.perfis], dt: new Date().toISOString().replace("T", " ").slice(0, 16), por: user.name, total: targets.length }, ...prev]);
                setCommForm({ titulo: "", msg: "", perfis: [], individuais: [], prioridade: "info", convenio: "" });
                setCommSent(true); setTimeout(() => setCommSent(false), 3000);
              } catch (e) { console.error("Erro ao enviar comunicado:", e); alert(e.response?.data?.error || "Erro ao enviar"); }
            }} disabled={!commForm.titulo || !commForm.msg || commForm.perfis.length === 0}>📤 Enviar Comunicado</Btn>
            {commSent && <span style={{ fontSize: 13, color: T.ok, fontWeight: 600 }}>✓ Comunicado enviado com sucesso!</span>}
          </div>
        </div>

        {/* Communication History */}
        <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📜 Histórico de Comunicados</h3>
          <div style={{ background: T.bg2, borderRadius: 8, border: `1px solid ${T.bor}`, overflow: "hidden" }}>
            <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
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
            </table></div>
          </div>
        </div>
      </div>}
      {tab === "usuários" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: T.t2 }}>{(() => { const filtered = users.filter(u => u.role !== "parceiro").filter(u => { if (uRoleFilter && u.role !== uRoleFilter) return false; if (uSearch) { const s = uSearch.toLowerCase(); return u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s); } return true; }); return `${filtered.length} usuário(s) interno(s)`; })()}</div>
            <Btn onClick={() => setUserModal(true)}>＋ Adicionar Usuário</Btn>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <input value={uSearch} onChange={e => setUSearch(e.target.value)} placeholder="Buscar por nome ou e-mail..." style={{ flex: 1, minWidth: 180, padding: "8px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }} />
            <select value={uRoleFilter} onChange={e => setURoleFilter(e.target.value)} style={{ padding: "8px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, minWidth: 140 }}>
              <option value="">Todos os perfis</option>
              <option value="super_admin">Super Admin</option>
              <option value="executivo">Diretor</option>
              <option value="diretor">Gerente</option>
              <option value="gerente">Executivo</option>
            </select>
            {(uSearch || uRoleFilter) && <Btn v="secondary" sm onClick={() => { setUSearch(""); setURoleFilter(""); }}>Limpar</Btn>}
          </div>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead><tr>{["Usuário", "E-mail", "Perfil", "Vínculo", "Status", "Último Acesso", "Ações"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>{users.filter(u => u.role !== "parceiro").filter(u => { if (uRoleFilter && u.role !== uRoleFilter) return false; if (uSearch) { const s = uSearch.toLowerCase(); return u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s); } return true; }).map(u => (
                <tr key={u.id}>
                  <td style={tdS}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: T.ac + "22", color: T.ac, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{u.av || u.name[0]}</div>
                      <span style={{ fontWeight: 600 }}>{u.name}</span>
                    </div>
                  </td>
                  <td style={{ ...tdS, fontSize: 12, color: T.t2 }}>{u.email}</td>
                  <td style={tdS}><Badge type={u.role === "super_admin" ? "accent" : u.role === "executivo" ? "accent" : u.role === "diretor" ? "warning" : "info"}>{RL[u.role]}</Badge></td>
                  <td style={{ ...tdS, fontSize: 12 }}>{u.role === "gerente" ? (users.find(d => d.id === u.dId)?.name || <span style={{ color: T.er, fontSize: 11 }}>⚠ Sem gerente</span>) : u.role === "diretor" ? (users.find(e => e.id === u.eId)?.name || <span style={{ color: T.er, fontSize: 11 }}>⚠ Sem diretor</span>) : <span style={{ color: T.tm }}>—</span>}</td>
                  <td style={tdS}><Badge type="success">Ativo</Badge></td>
                  <td style={{ ...tdS, fontSize: 12, color: T.t2 }}>{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : <span style={{ color: T.tm }}>—</span>}</td>
                  <td style={tdS}>
                    {u.id === "sa1" ? <span style={{ fontSize: 11, color: T.tm }}>—</span> :
                      delUserConf === u.id ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: T.er }}>Confirmar?</span>
                          <Btn v="danger" sm onClick={() => delUser(u.id)}>Sim</Btn>
                          <Btn v="secondary" sm onClick={() => setDelUserConf(null)}>Não</Btn>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 6 }}>
                          <Btn sm onClick={() => openEditUser(u)}>Editar</Btn>
                          <Btn v="danger" sm onClick={() => setDelUserConf(u.id)}>Excluir</Btn>
                        </div>
                      )
                    }
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          </div>
          <Modal open={userModal} onClose={() => setUserModal(false)} title="Adicionar Usuário Interno"
            footer={<><Btn v="secondary" onClick={() => setUserModal(false)}>Cancelar</Btn><Btn onClick={addUser} disabled={!uf.name || !uf.email || !uf.pw || (uf.role === "gerente" && !uf.dId) || (uf.role === "diretor" && !uf.eId) || (uf.role === "convenio" && ufConvIds.length === 0)}>Adicionar</Btn></>}>
            <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "1fr 1fr", lg: "1fr 1fr" }), gap: 14 }}>
              <Inp label="Nome completo *" value={uf.name} onChange={v => setUf({ ...uf, name: v })} placeholder="Nome" />
              <Inp label="E-mail *" value={uf.email} onChange={v => setUf({ ...uf, email: v })} placeholder="email@somapay.com.br" />
              <Inp label="Senha *" value={uf.pw} onChange={v => setUf({ ...uf, pw: v })} type="password" placeholder="Senha" />
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Perfil *</label>
                <select value={uf.role} onChange={e => { setUf({ ...uf, role: e.target.value, dId: "", eId: "" }); setUfConvIds([]); }} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                  <option value="gerente">Executivo</option>
                  <option value="diretor">Gerente</option>
                  <option value="executivo">Diretor</option>
                  <option value="convenio">Convênio</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              {uf.role === "gerente" && (
                <div style={{ gridColumn: "1/-1", padding: 14, background: T.wn + "0A", border: `1px solid ${T.wn}25`, borderRadius: 8 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.wn, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>👤 Gerente Responsável *</label>
                  <select value={uf.dId} onChange={e => setUf({ ...uf, dId: e.target.value })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                    <option value="">Selecione o gerente...</option>
                    {users.filter(u => u.role === "diretor").map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: T.tm, marginTop: 6 }}>ℹ️ Todo executivo deve estar vinculado a um gerente.</div>
                </div>
              )}
              {uf.role === "diretor" && (
                <div style={{ gridColumn: "1/-1", padding: 14, background: T.ac + "0A", border: `1px solid ${T.ac}25`, borderRadius: 8 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.ac, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>🏛️ Diretor Responsável *</label>
                  <select value={uf.eId} onChange={e => setUf({ ...uf, eId: e.target.value })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                    <option value="">Selecione o diretor...</option>
                    {users.filter(u => u.role === "executivo").map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: T.tm, marginTop: 6 }}>ℹ️ Todo gerente deve estar vinculado a um diretor.</div>
                </div>
              )}
              {uf.role === "convenio" && cfgConvenios.length > 0 && (
                <div style={{ gridColumn: "1/-1", padding: 14, background: T.bg2, border: `1px solid ${T.bor}`, borderRadius: 8 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>🤝 Convênios Vinculados *</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {cfgConvenios.map(c => (
                      <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, border: `1px solid ${ufConvIds.includes(c.id) ? T.ac : T.bor}`, background: ufConvIds.includes(c.id) ? T.ac + "15" : T.inp, cursor: "pointer", fontSize: 12, color: ufConvIds.includes(c.id) ? T.ac : T.txt, fontWeight: ufConvIds.includes(c.id) ? 600 : 400 }}>
                        <input type="checkbox" checked={ufConvIds.includes(c.id)} onChange={() => setUfConvIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])} style={{ accentColor: T.ac }} />
                        {c.name}
                      </label>
                    ))}
                  </div>
                  {ufConvIds.length === 0 && <div style={{ fontSize: 11, color: T.wn, marginTop: 6 }}>Selecione ao menos um convênio</div>}
                </div>
              )}
            </div>
          </Modal>

          {/* Edit User Modal */}
          <Modal open={!!editUser} onClose={() => { setEditUser(null); setEuResetPw(null); }} title="Editar Usuário"
            footer={<><Btn v="secondary" onClick={() => { setEditUser(null); setEuResetPw(null); }}>Cancelar</Btn><Btn onClick={saveEditUser} disabled={euSaving}>{euSaving ? "Salvando..." : "Salvar"}</Btn></>}>
            {editUser && <div>
              <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "1fr 1fr", lg: "1fr 1fr" }), gap: 14 }}>
                <Inp label="Nome" value={euF.name} onChange={v => setEuF({ ...euF, name: v })} />
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>E-mail</label>
                  <input value={editUser.email} disabled style={{ width: "100%", padding: "10px 12px", background: T.bg2, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.tm, fontFamily: "'DM Sans',sans-serif", fontSize: 13, boxSizing: "border-box" }} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Perfil</label>
                  <select value={euF.role} onChange={e => setEuF({ ...euF, role: e.target.value, managerId: "" })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                    <option value="gerente">Executivo</option>
                    <option value="diretor">Gerente</option>
                    <option value="executivo">Diretor</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Status</label>
                  <select value={euF.isActive ? "1" : "0"} onChange={e => setEuF({ ...euF, isActive: e.target.value === "1" })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                    <option value="1">Ativo</option>
                    <option value="0">Inativo</option>
                  </select>
                </div>
              </div>
              {euF.role === "gerente" && (
                <div style={{ padding: 14, background: T.wn + "0A", border: `1px solid ${T.wn}25`, borderRadius: 8, marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.wn, marginBottom: 8, textTransform: "uppercase" }}>Gerente Responsável</label>
                  <select value={euF.managerId} onChange={e => setEuF({ ...euF, managerId: e.target.value })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                    <option value="">Selecione...</option>
                    {users.filter(u => u.role === "diretor").map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
              {euF.role === "diretor" && (
                <div style={{ padding: 14, background: T.ac + "0A", border: `1px solid ${T.ac}25`, borderRadius: 8, marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.ac, marginBottom: 8, textTransform: "uppercase" }}>Diretor Responsável</label>
                  <select value={euF.managerId} onChange={e => setEuF({ ...euF, managerId: e.target.value })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                    <option value="">Selecione...</option>
                    {users.filter(u => u.role === "executivo").map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              )}
              <div style={{ padding: 14, background: T.er + "0A", border: `1px solid ${T.er}25`, borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.er, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Senha</div>
                {euResetPw ? (
                  <div>
                    <div style={{ padding: 10, background: T.bg2, borderRadius: 6, fontFamily: "'Space Mono',monospace", fontSize: 14, fontWeight: 600, color: T.ac, marginBottom: 8 }}>{euResetPw}</div>
                    <Btn sm onClick={() => navigator.clipboard.writeText(euResetPw)}>Copiar senha</Btn>
                  </div>
                ) : (
                  <Btn v="danger" sm onClick={resetUserPw}>Resetar Senha</Btn>
                )}
              </div>
            </div>}
          </Modal>
        </div>
      )}

      {/* PARCEIROS TAB */}
      {tab === "parceiros" && (() => {
        const formatCnpjDisplay = (v) => { if (!v) return "—"; const n = v.replace(/\D/g, ''); if (n.length !== 14) return v; return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); };
        const executivos = users.filter(u => u.role === "gerente");
        const allParcs = users.filter(u => u.role === "parceiro").filter(p => {
          if (pExecFilter && p.gId !== pExecFilter) return false;
          if (pSearch) { const s = pSearch.toLowerCase(); return p.name.toLowerCase().includes(s) || (p.empresa || "").toLowerCase().includes(s) || (p.cnpj || "").includes(s); }
          return true;
        });
        return <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: T.t2 }}>{allParcs.length} parceiro(s)</div>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <input value={pSearch} onChange={e => setPSearch(e.target.value)} placeholder="Buscar por nome, empresa ou CNPJ..." style={{ flex: 1, minWidth: 200, padding: "8px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }} />
            <select value={pExecFilter} onChange={e => setPExecFilter(e.target.value)} style={{ padding: "8px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, minWidth: 160 }}>
              <option value="">Todos os executivos</option>
              {executivos.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            {(pSearch || pExecFilter) && <Btn v="secondary" sm onClick={() => { setPSearch(""); setPExecFilter(""); }}>Limpar</Btn>}
          </div>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead><tr>{["Parceiro", "Empresa", "CNPJ", "Telefone", "Comissão", "Executivo", "Indicações", "Ações"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>{allParcs.length === 0 ? (
                <tr><td colSpan={8} style={{ ...tdS, textAlign: "center", color: T.tm, padding: 30 }}>Nenhum parceiro encontrado</td></tr>
              ) : allParcs.map(p => {
                const indCount = inds.filter(i => i.pId === p.id).length;
                const exec = users.find(u => u.id === p.gId);
                return <tr key={p.id}>
                  <td style={tdS}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: T.ac + "22", color: T.ac, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{p.av || p.name[0]}</div>
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
                    </div>
                  </td>
                  <td style={{ ...tdS, fontSize: 12, color: T.t2 }}>{p.empresa || "—"}</td>
                  <td style={{ ...tdS, fontSize: 12, fontFamily: "'Space Mono',monospace" }}>{formatCnpjDisplay(p.cnpj)}</td>
                  <td style={{ ...tdS, fontSize: 12 }}>{p.tel || "—"}</td>
                  <td style={tdS}>
                    <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, fontWeight: 700, color: p.comTipo === "pct" ? T.ac : T.inf }}>
                      {p.comTipo === "valor" ? `R$ ${p.comVal ?? 0}` : `${p.comVal ?? 0}%`}
                    </span>
                  </td>
                  <td style={{ ...tdS, fontSize: 12, color: T.tm }}>{exec?.name || "—"}</td>
                  <td style={tdS}><Badge type={indCount > 0 ? "info" : "default"}>{indCount}</Badge></td>
                  <td style={tdS}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn sm onClick={() => openEditParcCfg(p)}>Editar</Btn>
                      <Btn v="danger" sm onClick={() => { setDelParcCfg(p); setDelParcTransfer(""); }}>Excluir</Btn>
                    </div>
                  </td>
                </tr>;
              })}</tbody>
            </table></div>
          </div>

          {/* Edit Parceiro Modal */}
          <Modal open={!!editParcCfg} onClose={() => { setEditParcCfg(null); setEpResetPw(null); }} title="Editar Parceiro"
            footer={<><Btn v="secondary" onClick={() => { setEditParcCfg(null); setEpResetPw(null); }}>Cancelar</Btn><Btn onClick={saveEditParcCfg} disabled={epSaving}>{epSaving ? "Salvando..." : "Salvar"}</Btn></>}>
            {editParcCfg && <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Inp label="Nome" value={epF.name} onChange={v => setEpF({ ...epF, name: v })} />
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>E-mail</label>
                  <input value={editParcCfg.email} disabled style={{ width: "100%", padding: "10px 12px", background: T.bg2, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.tm, fontFamily: "'DM Sans',sans-serif", fontSize: 13, boxSizing: "border-box" }} />
                </div>
                <Inp label="Empresa" value={epF.empresa} onChange={v => setEpF({ ...epF, empresa: v })} />
                <Inp label="CNPJ" value={epF.cnpj} onChange={v => setEpF({ ...epF, cnpj: v })} />
                <Inp label="Telefone" value={epF.tel} onChange={v => setEpF({ ...epF, tel: v })} />
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Executivo</label>
                  <select value={epF.managerId} onChange={e => setEpF({ ...epF, managerId: e.target.value })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                    <option value="">Sem executivo</option>
                    {executivos.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ padding: 14, background: T.ac + "0A", border: `1px solid ${T.ac}25`, borderRadius: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.ac, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Comissão</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <select value={epF.comTipo} onChange={e => setEpF({ ...epF, comTipo: e.target.value })} style={{ padding: "8px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 12 }}>
                    <option value="pct">% Cashin</option>
                    <option value="valor">R$/Conta</option>
                  </select>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {epF.comTipo === "valor" && <span style={{ fontSize: 12, color: T.tm }}>R$</span>}
                    <input type="number" step={epF.comTipo === "pct" ? "0.1" : "0.5"} value={epF.comVal} onChange={e => setEpF({ ...epF, comVal: e.target.value })} style={{ width: 100, textAlign: "right", padding: "8px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: epF.comTipo === "pct" ? T.ac : T.inf, fontFamily: "'Space Mono',monospace", fontSize: 13, fontWeight: 700, outline: "none" }} />
                    {epF.comTipo === "pct" && <span style={{ fontSize: 12, color: T.tm }}>%</span>}
                  </div>
                </div>
              </div>
              <div style={{ padding: 14, background: T.er + "0A", border: `1px solid ${T.er}25`, borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.er, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Senha</div>
                {epResetPw ? (
                  <div>
                    <div style={{ padding: 10, background: T.bg2, borderRadius: 6, fontFamily: "'Space Mono',monospace", fontSize: 14, fontWeight: 600, color: T.ac, marginBottom: 8 }}>{epResetPw}</div>
                    <Btn sm onClick={() => navigator.clipboard.writeText(epResetPw)}>Copiar senha</Btn>
                  </div>
                ) : (
                  <Btn v="danger" sm onClick={resetParcCfgPw}>Resetar Senha</Btn>
                )}
              </div>
            </div>}
          </Modal>

          {/* Delete Parceiro Modal */}
          <Modal open={!!delParcCfg} onClose={() => { setDelParcCfg(null); setDelParcTransfer(""); }} title="Excluir Parceiro"
            footer={<><Btn v="secondary" onClick={() => { setDelParcCfg(null); setDelParcTransfer(""); }}>Cancelar</Btn><Btn v="danger" onClick={delParceiro}>Confirmar Exclusão</Btn></>}>
            {delParcCfg && (() => {
              const parcInds = inds.filter(i => i.pId === delParcCfg.id);
              const otherParcs = users.filter(u => u.role === "parceiro" && u.id !== delParcCfg.id);
              return <div>
                <div style={{ padding: 14, background: T.er + "0A", border: `1px solid ${T.er}25`, borderRadius: 8, marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Desativar "{delParcCfg.name}"</div>
                  <div style={{ fontSize: 12, color: T.t2 }}>O parceiro será desativado e não poderá mais acessar o sistema.</div>
                </div>
                {parcInds.length > 0 ? (
                  <div style={{ padding: 14, background: T.wn + "0A", border: `1px solid ${T.wn}25`, borderRadius: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.wn, marginBottom: 8 }}>Este parceiro possui {parcInds.length} indicação(ões)</div>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", fontSize: 13, cursor: "pointer" }}>
                        <input type="radio" name="transfer" checked={!delParcTransfer} onChange={() => setDelParcTransfer("")} style={{ accentColor: T.ac }} />
                        Excluir sem transferir (indicações permanecem sem dono ativo)
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", fontSize: 13, cursor: "pointer" }}>
                        <input type="radio" name="transfer" checked={!!delParcTransfer} onChange={() => setDelParcTransfer(otherParcs[0]?.id || "")} style={{ accentColor: T.ac }} />
                        Transferir indicações para outro parceiro
                      </label>
                    </div>
                    {delParcTransfer && (
                      <select value={delParcTransfer} onChange={e => setDelParcTransfer(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                        <option value="">Selecione o parceiro destino...</option>
                        {otherParcs.map(p => <option key={p.id} value={p.id}>{p.name}{p.empresa ? ` (${p.empresa})` : ""}</option>)}
                      </select>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: T.tm }}>Este parceiro não possui indicações.</div>
                )}
              </div>;
            })()}
          </Modal>
        </div>;
      })()}

      {/* CONVÊNIOS TAB */}
      {tab === "convênios" && <ConveniosTab />}

      {/* MATERIAIS TAB */}
      {tab === "materiais" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: T.t2 }}>{mats.length} material(is) cadastrado(s)</div>
            <Btn onClick={() => setMatModal(true)}>＋ Adicionar Material</Btn>
          </div>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
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
            </table></div>
          </div>

          <Modal open={matModal} onClose={() => setMatModal(false)} title="Adicionar Material de Apoio"
            footer={<><Btn v="secondary" onClick={() => setMatModal(false)}>Cancelar</Btn><Btn onClick={addMat} disabled={!mf.t || matSaving}>{matSaving ? "Enviando..." : "Adicionar"}</Btn></>}>
            <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "1fr 1fr", lg: "1fr 1fr" }), gap: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <Inp label="Título *" value={mf.t} onChange={v => setMf({ ...mf, t: v })} placeholder="Ex: Manual do Parceiro 2025" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Categoria</label>
                <select value={mf.cat} onChange={e => setMf({ ...mf, cat: e.target.value })} style={{ width: "100%", padding: "10px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
                  {["comercial", "financeiro", "treinamento", "suporte", "legal"].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 5, textTransform: "uppercase" }}>Arquivo</label>
                <label style={{ display: "block", padding: "20px 14px", background: mf.fileName ? T.ok + "0D" : T.inp, border: `2px dashed ${mf.fileName ? T.ok : T.bor}`, borderRadius: 6, textAlign: "center", fontSize: 12, color: mf.fileName ? T.ok : T.tm, cursor: "pointer", transition: "all 0.2s" }}>
                  <input type="file" accept=".pdf,.xlsx,.xls,.docx,.doc,.mp4,.pptx,.ppt,.png,.jpg,.jpeg,.zip" style={{ display: "none" }} onChange={e => {
                    const file = e.target.files[0];
                    if (file) {
                      const ext = file.name.split('.').pop().toLowerCase();
                      setMf({ ...mf, file, fileName: file.name, tipo: ext, sz: (file.size / (1024 * 1024)).toFixed(1) + " MB" });
                    }
                  }} />
                  {mf.fileName ? `✓ ${mf.fileName} (${mf.sz})` : "📎 Clique para anexar arquivo"}
                </label>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {/* AUDITORIA TAB */}
      {tab === "auditoria" && (
        <div>
          {/* Filters */}
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 4, textTransform: "uppercase" }}>Data De</label>
                <input type="date" value={auditFilters.date_from} onChange={e => setAuditFilters(f => ({ ...f, date_from: e.target.value }))} style={{ padding: "8px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 4, textTransform: "uppercase" }}>Data Até</label>
                <input type="date" value={auditFilters.date_to} onChange={e => setAuditFilters(f => ({ ...f, date_to: e.target.value }))} style={{ padding: "8px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 4, textTransform: "uppercase" }}>Usuário</label>
                <select value={auditFilters.user_id} onChange={e => setAuditFilters(f => ({ ...f, user_id: e.target.value }))} style={{ padding: "8px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, minWidth: 150 }}>
                  <option value="">Todos</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 4, textTransform: "uppercase" }}>Ação</label>
                <select value={auditFilters.action} onChange={e => setAuditFilters(f => ({ ...f, action: e.target.value }))} style={{ padding: "8px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, minWidth: 150 }}>
                  <option value="">Todas</option>
                  {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.t2, marginBottom: 4, textTransform: "uppercase" }}>Empresa</label>
                <input type="text" value={auditFilters.search} onChange={e => setAuditFilters(f => ({ ...f, search: e.target.value }))} placeholder="Buscar empresa..." style={{ padding: "8px 10px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, minWidth: 160 }} />
              </div>
              <Btn onClick={() => loadAudit(0, auditFilters)}>Filtrar</Btn>
              <Btn v="secondary" onClick={() => { const empty = { user_id: "", action: "", date_from: "", date_to: "", search: "" }; setAuditFilters(empty); loadAudit(0, empty); }}>Limpar</Btn>
            </div>
          </div>

          {/* Table */}
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            {auditLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: T.tm, fontSize: 13 }}>Carregando...</div>
            ) : (
              <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                <thead><tr>{["Data/Hora", "Usuário", "Ação", "Indicação", "Detalhes", "Valores"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
                <tbody>
                  {auditData.map(e => (
                    <tr key={e.id}>
                      <td style={{ ...tdS, fontSize: 12, whiteSpace: "nowrap" }}>{new Date(e.created_at).toLocaleString("pt-BR")}</td>
                      <td style={{ ...tdS, fontWeight: 500 }}>{e.user_name || "—"}</td>
                      <td style={tdS}><Badge type={ACTION_BADGE[e.action] || "info"}>{ACTION_LABELS[e.action] || e.action}</Badge></td>
                      <td style={{ ...tdS, fontSize: 13 }}>{e.nome_fantasia || e.razao_social || "—"}</td>
                      <td style={{ ...tdS, fontSize: 12, color: T.tm, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.txt || "—"}</td>
                      <td style={{ ...tdS, fontSize: 12, color: T.tm }}>{e.old_value && e.new_value ? `${e.old_value} → ${e.new_value}` : e.new_value || "—"}</td>
                    </tr>
                  ))}
                  {auditData.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhum registro encontrado.</td></tr>}
                </tbody>
              </table></div>
            )}
          </div>

          {/* Pagination */}
          {auditTotal > AUDIT_LIMIT && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 16 }}>
              <Btn v="secondary" sm disabled={auditPage === 0} onClick={() => loadAudit(auditPage - 1, auditFilters)}>← Anterior</Btn>
              <span style={{ fontSize: 13, color: T.tm }}>Página {auditPage + 1} de {Math.ceil(auditTotal / AUDIT_LIMIT)}</span>
              <Btn v="secondary" sm disabled={(auditPage + 1) * AUDIT_LIMIT >= auditTotal} onClick={() => loadAudit(auditPage + 1, auditFilters)}>Próximo →</Btn>
            </div>
          )}
          <div style={{ marginTop: 12, fontSize: 12, color: T.tm, textAlign: "right" }}>{auditTotal} registro(s) encontrado(s)</div>
        </div>
      )}

      {tab !== "materiais" && tab !== "auditoria" && <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <Btn onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}>Salvar</Btn>
        {saved && <span style={{ fontSize: 13, color: T.ok }}>✓ Salvo!</span>}
      </div>}
    </div>
  );
}

// ===== FINANCEIRO =====
function fmtBRL(v) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

function FinPage({ comms, setComms, nfes, setNfes, users, notifs, setNotifs, cadenceRules }) {
  const { user } = useAuth();
  const { breakpoint } = useBreakpoint();
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

  const [commSaving, setCommSaving] = useState(false);
  const addComm = async () => {
    if (!cf.pId || !cf.titulo || !cf.periodo || !cf.valor || commSaving) return;
    setCommSaving(true);
    try {
      // Find an indication for this user to link to (use most recent ativo indication)
      const parcInds = inds.filter(i => i.pId === cf.pId && i.st === "ativo");
      const indId = parcInds.length > 0 ? parcInds[0].id : inds.find(i => i.pId === cf.pId)?.id;
      const res = await commissionsApi.create({
        indication_id: indId || null,
        user_id: cf.pId,
        amount: parseFloat(cf.valor) || 0,
        percentage: 0,
      });
      const c = res.data.commission;
      setComms(prev => [...prev, {
        id: c.id, pId: c.user_id, titulo: cf.titulo, periodo: cf.periodo,
        valor: c.amount, arq: null,
        dt: c.created_at?.split('T')[0] || new Date().toISOString().split("T")[0], by: user.id
      }]);
      setCommModal(false);
      setCf({ pId: "", titulo: "", periodo: "", valor: "" });
      if (isCadenceActive(cadenceRules, "cad_comissao")) {
        addNotif(setNotifs, { tipo: "financeiro", titulo: "Relatório de comissão", msg: `Novo relatório de comissão: ${cf.titulo} — R$ ${parseFloat(cf.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`, para: cf.pId, de: user.id, link: "fin" });
      }
    } catch (e) {
      console.error("Erro ao criar comissão:", e);
      alert(e.response?.data?.error || "Erro ao criar comissão");
    }
    setCommSaving(false);
  };

  const [nfeSaving, setNfeSaving] = useState(false);
  const addNfe = async () => {
    if (!nf.num || !nf.valor || nfeSaving) return;
    setNfeSaving(true);
    try {
      const res = await nfesApi.create({
        number: nf.num,
        value: parseFloat(nf.valor) || 0,
        notes: nf.arq || null,
      });
      const n = res.data.nfe;
      setNfes(prev => [...prev, {
        id: n.id, pId: n.user_id, num: n.number,
        valor: n.value, arq: n.file_path,
        dt: n.created_at?.split('T')[0] || new Date().toISOString().split("T")[0], st: "pendente", pgDt: null
      }]);
      setNfeModal(false);
      setNf({ num: "", valor: "", arq: "" });
      if (user.gId && isCadenceActive(cadenceRules, "cad_nfe_enviada")) {
        addNotif(setNotifs, { tipo: "financeiro", titulo: "NFe recebida", msg: `Parceiro ${user.name} enviou ${nf.num} — R$ ${parseFloat(nf.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`, para: user.gId, de: user.id, link: "fin" });
      }
    } catch (e) {
      console.error("Erro ao enviar NFe:", e);
      alert(e.response?.data?.error || "Erro ao enviar NFe");
    }
    setNfeSaving(false);
  };

  const markPago = async (nfeId) => {
    const nfe = nfes.find(n => n.id === nfeId);
    const pgDt = new Date().toISOString().split("T")[0];
    setNfes(prev => prev.map(n => n.id === nfeId ? { ...n, st: "pago", pgDt } : n));
    try {
      await nfesApi.updateStatus(nfeId, "paid", null);
    } catch (e) { console.error("Erro ao marcar NFe como paga:", e); }
    // Notify parceiro about payment
    if (nfe?.pId && isCadenceActive(cadenceRules, "cad_nfe_paga")) {
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
      <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }), gap: 14, marginBottom: 24 }}>
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
            <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
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
                      <td style={tdStyle}><Btn v="secondary" sm onClick={() => alert("Arquivo de comissão não disponível para download")}>⬇ Download</Btn></td>
                    </tr>
                  );
                })}
                {myComms.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhum relatório enviado.</td></tr>}
              </tbody>
            </table></div>
          </div>
        </div>
      )}

      {/* === ADMIN/GERENTE: NFes Recebidas === */}
      {(tab === "nfes") && (
        <div>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
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
            </table></div>
          </div>
        </div>
      )}

      {/* === PARCEIRO: Meus Relatórios === */}
      {(tab === "meusRel") && (
        <div>
          <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden" }}>
            <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead><tr>{["Título", "Período", "Valor", "Arquivo", "Data", "Ações"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {myComms.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{r.titulo}</td>
                    <td style={tdStyle}><Badge type="info">{r.periodo}</Badge></td>
                    <td style={{ ...tdStyle, fontFamily: "'Space Mono',monospace", fontWeight: 600, color: T.ok }}>{fmtBRL(r.valor)}</td>
                    <td style={{ ...tdStyle, fontSize: 11, color: T.t2 }}>📄 {r.arq}</td>
                    <td style={{ ...tdStyle, fontSize: 11, color: T.tm }}>{r.dt}</td>
                    <td style={tdStyle}><Btn v="secondary" sm onClick={() => alert("Arquivo de comissão não disponível para download")}>⬇ Download</Btn></td>
                  </tr>
                ))}
                {myComms.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhum relatório disponível.</td></tr>}
              </tbody>
            </table></div>
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
            <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
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
            </table></div>
          </div>
        </div>
      )}

      {/* Modal: Enviar Relatório de Comissão */}
      <Modal open={commModal} onClose={() => setCommModal(false)} title="Enviar Relatório de Comissão"
        footer={<><Btn v="secondary" onClick={() => setCommModal(false)}>Cancelar</Btn><Btn onClick={addComm} disabled={!cf.pId || !cf.titulo || !cf.periodo || !cf.valor}>Enviar</Btn></>}>
        <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "1fr 1fr", lg: "1fr 1fr" }), gap: 14 }}>
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
        <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "1fr 1fr", lg: "1fr 1fr" }), gap: 14 }}>
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
  const markRead = (id) => { setNotifs(prev => prev.map(n => n.id === id ? { ...n, lido: true } : n)); notificationsApi.markAsRead(id).catch(e => console.error("Erro markRead:", e)); };
  const markAllRead = () => { setNotifs(prev => prev.map(n => (n.para === userId || n.para === "*") ? { ...n, lido: true } : n)); notificationsApi.markAllAsRead().catch(e => console.error("Erro markAllRead:", e)); };

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
  const { breakpoint } = useBreakpoint();
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const mine = notifs.filter(n => n.para === userId || n.para === "*");
  const filtered = mine.filter(n => {
    if (filtro === "naoLidas" && n.lido) return false;
    if (filtro === "lidas" && !n.lido) return false;
    if (tipoFiltro !== "todos" && n.tipo !== tipoFiltro) return false;
    return true;
  });
  const unread = mine.filter(n => !n.lido).length;
  const markRead = (id) => { setNotifs(prev => prev.map(n => n.id === id ? { ...n, lido: true } : n)); notificationsApi.markAsRead(id).catch(e => console.error("Erro markRead:", e)); };
  const markAllRead = () => { setNotifs(prev => prev.map(n => (n.para === userId || n.para === "*") ? { ...n, lido: true } : n)); notificationsApi.markAllAsRead().catch(e => console.error("Erro markAllRead:", e)); };
  const delNotif = (id) => { setNotifs(prev => prev.filter(n => n.id !== id)); notificationsApi.delete(id).catch(e => console.error("Erro delNotif:", e)); };

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
      <div style={{ display: "grid", gridTemplateColumns: responsive(breakpoint, { xs: "1fr", sm: "1fr", md: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }), gap: 14, marginBottom: 24 }}>
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

// ===== GROUPS PAGE =====
function GroupsPage({ users, inds }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgInput, setMsgInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [cnpjMode, setCnpjMode] = useState(false);
  const [cnpjInput, setCnpjInput] = useState("");
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [lastCnpjResult, setLastCnpjResult] = useState(null);
  // WhatsApp state
  const [waStatus, setWaStatus] = useState("disconnected");
  const [qrCode, setQrCode] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [waLoading, setWaLoading] = useState(false);

  const loadGroups = useCallback(async () => {
    try {
      const res = await groupsApi.getAll();
      setGroups(res.data.groups || []);
    } catch (e) { console.error("Error loading groups:", e); }
    finally { setLoading(false); }
  }, []);

  const loadMessages = useCallback(async () => {
    if (!selectedGroup) return;
    try {
      const res = await groupsApi.getMessages(selectedGroup.gerente_id, selectedGroup.parceiro_id, { limit: 200 });
      setMessages(res.data.messages || []);
    } catch (e) { console.error("Error loading messages:", e); }
  }, [selectedGroup]);

  useEffect(() => { loadGroups(); }, [loadGroups]);
  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Load WhatsApp status on mount (gerente only)
  useEffect(() => {
    if (user.role !== "gerente") return;
    (async () => {
      try {
        const res = await whatsappApi.getStatus();
        setWaStatus(res.data.status || "disconnected");
      } catch {}
    })();
  }, [user.role]);

  // QR polling: every 3s when modal is open
  useEffect(() => {
    if (!showQrModal) return;
    let active = true;
    const poll = async () => {
      try {
        const statusRes = await whatsappApi.getStatus();
        if (!active) return;
        const st = statusRes.data.status || "disconnected";
        setWaStatus(st);
        if (st === "connected") {
          setShowQrModal(false);
          setQrCode(null);
          return;
        }
        // getQr now fetches fresh QR from Evolution API if expired
        const qrRes = await whatsappApi.getQr();
        if (!active) return;
        if (qrRes.data.qr_code) {
          setQrCode(qrRes.data.qr_code);
        } else if (qrRes.data.expired || !qrRes.data.qr_code) {
          // If QR still null after backend tried, re-trigger connect
          const reconn = await whatsappApi.connectInstance();
          if (!active) return;
          if (reconn.data.qr_code) setQrCode(reconn.data.qr_code);
        }
      } catch (e) { console.warn("QR poll error:", e); }
    };
    poll(); // Immediate first poll
    const iv = setInterval(poll, 3000);
    return () => { active = false; clearInterval(iv); };
  }, [showQrModal]);

  // Polling 15s
  useEffect(() => {
    if (!selectedGroup) return;
    const iv = setInterval(loadMessages, 15000);
    return () => clearInterval(iv);
  }, [selectedGroup, loadMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = document.getElementById("chat-messages");
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    if (!msgInput.trim() || !selectedGroup) return;
    try {
      await groupsApi.sendMessage(selectedGroup.gerente_id, selectedGroup.parceiro_id, { content: msgInput });
      setMsgInput("");
      loadMessages();
    } catch (e) { console.error("Send error:", e); }
  };

  const handleWaConnect = async () => {
    setWaLoading(true);
    setQrCode(null);
    try {
      const res = await whatsappApi.connectInstance();
      const st = res.data.status || "connecting";
      setWaStatus(st);
      if (st === "connected") {
        setShowQrModal(false);
        return;
      }
      if (res.data.qr_code) setQrCode(res.data.qr_code);
      setShowQrModal(true);
    } catch (e) { console.error("WA connect error:", e); }
    finally { setWaLoading(false); }
  };

  const handleWaDisconnect = async () => {
    setWaLoading(true);
    try {
      await whatsappApi.disconnect();
      setWaStatus("disconnected");
      setQrCode(null);
    } catch (e) { console.error("WA disconnect error:", e); }
    finally { setWaLoading(false); }
  };

  const handleCnpjCheck = async () => {
    if (!cnpjInput.trim() || !selectedGroup) return;
    setCnpjLoading(true);
    try {
      const res = await cnpjAgentApi.check({
        cnpj: cnpjInput,
        gerente_id: selectedGroup.gerente_id,
        parceiro_id: selectedGroup.parceiro_id
      });
      setLastCnpjResult(res.data);
      setCnpjInput("");
      setCnpjMode(false);
      loadMessages();
    } catch (e) { console.error("CNPJ check error:", e); }
    finally { setCnpjLoading(false); }
  };

  const handleCreateIndication = async (cnpjData) => {
    if (!selectedGroup) return;
    try {
      await cnpjAgentApi.createIndication({
        cnpj: cnpjData.cnpj,
        gerente_id: selectedGroup.gerente_id,
        parceiro_id: selectedGroup.parceiro_id,
        cnpj_data: cnpjData
      });
      loadMessages();
    } catch (e) { console.error("Create indication error:", e); }
  };

  const sourceLabel = (source) => {
    if (source === "whatsapp") return <span style={{ fontSize: 9, background: "#25D36622", color: "#25D366", borderRadius: 4, padding: "1px 5px", marginLeft: 6, fontWeight: 600 }}>via WhatsApp</span>;
    if (source === "crm_to_whatsapp") return <span style={{ fontSize: 9, background: T.inf + "22", color: T.inf, borderRadius: 4, padding: "1px 5px", marginLeft: 6, fontWeight: 600 }}>enviado via WhatsApp</span>;
    return null;
  };

  const renderBotMessage = (msg) => {
    let meta = {};
    try { meta = JSON.parse(msg.metadata || "{}"); } catch {}

    if (msg.message_type === "cnpj_result") {
      const d = meta.cnpj_data || {};
      return (
        <div style={{ background: T.inf + "15", border: `1px solid ${T.inf}33`, borderRadius: 10, padding: 14, maxWidth: 400 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.inf, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>🤖 Agente CNPJ</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txt, marginBottom: 4 }}>{d.razao_social}</div>
          {d.nome_fantasia && d.nome_fantasia !== d.razao_social && <div style={{ fontSize: 11, color: T.t2, marginBottom: 4 }}>Fantasia: {d.nome_fantasia}</div>}
          <div style={{ fontSize: 11, color: T.t2, marginBottom: 2 }}>Situação: <span style={{ color: d.situacao === "ATIVA" ? T.ok : T.wn }}>{d.situacao || "N/A"}</span></div>
          {d.capital_social > 0 && <div style={{ fontSize: 11, color: T.t2, marginBottom: 2 }}>Capital: R$ {Number(d.capital_social).toLocaleString("pt-BR")}</div>}
          {d.cnae_principal && <div style={{ fontSize: 11, color: T.t2, marginBottom: 2 }}>CNAE: {d.cnae_principal}</div>}
          {d.socios?.length > 0 && <div style={{ fontSize: 11, color: T.t2, marginBottom: 2 }}>Sócios: {d.socios.map(s => s.nome).join(", ")}</div>}
          {d.endereco?.completo && <div style={{ fontSize: 11, color: T.t2, marginBottom: 6 }}>Endereço: {d.endereco.completo}</div>}
          {user.role === "gerente" && (
            <Btn sm v="primary" onClick={() => handleCreateIndication(d)} style={{ marginTop: 6 }}>+ Criar Indicação</Btn>
          )}
        </div>
      );
    }

    if (msg.message_type === "cnpj_duplicate") {
      const dup = meta.duplicate || {};
      return (
        <div style={{ background: T.wn + "15", border: `1px solid ${T.wn}33`, borderRadius: 10, padding: 14, maxWidth: 400 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.wn, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>⚠️ CNPJ Duplicado</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txt, marginBottom: 4 }}>{msg.content}</div>
          <div style={{ fontSize: 11, color: T.t2, marginBottom: 2 }}>Status: <Badge type="warning">{dup.status}</Badge></div>
          <div style={{ fontSize: 11, color: T.t2, marginBottom: 2 }}>Responsável: {dup.owner_name}</div>
          <div style={{ fontSize: 11, color: T.t2 }}>Criada em: {dup.created_at ? new Date(dup.created_at).toLocaleDateString("pt-BR") : "N/A"}</div>
        </div>
      );
    }

    if (msg.message_type === "indication_created") {
      return (
        <div style={{ background: T.ok + "15", border: `1px solid ${T.ok}33`, borderRadius: 10, padding: 14, maxWidth: 400 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ok, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>✅ Indicação Criada</div>
          <div style={{ fontSize: 13, color: T.txt }}>{msg.content}</div>
        </div>
      );
    }

    return <div style={{ fontSize: 13, color: T.t2 }}>{msg.content}</div>;
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: T.t2 }}>Carregando conversas...</div>;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 120px)", gap: 0 }}>
      {/* QR Code Modal */}
      {showQrModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowQrModal(false)}>
          <div style={{ background: T.card, borderRadius: 16, padding: 32, maxWidth: 400, textAlign: "center", border: `1px solid ${T.bor}` }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: T.txt, margin: "0 0 8px" }}>Conectar WhatsApp</h3>
            <p style={{ fontSize: 12, color: T.t2, marginBottom: 20 }}>Abra o WhatsApp no celular, vá em Dispositivos Conectados e escaneie o QR code abaixo.</p>
            {qrCode ? (
              <img src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code" style={{ width: 256, height: 256, borderRadius: 8, border: `1px solid ${T.bor}` }} />
            ) : (
              <div style={{ width: 256, height: 256, display: "flex", alignItems: "center", justifyContent: "center", background: T.bg2, borderRadius: 8, margin: "0 auto", color: T.tm, fontSize: 13 }}>Gerando QR code...</div>
            )}
            <p style={{ fontSize: 11, color: T.tm, marginTop: 12 }}>O QR code atualiza automaticamente. A janela fecha ao conectar.</p>
            <Btn sm v="secondary" onClick={() => setShowQrModal(false)} style={{ marginTop: 12 }}>Fechar</Btn>
          </div>
        </div>
      )}

      {/* Sidebar - Lista de Parceiros */}
      <div style={{ width: 300, borderRight: `1px solid ${T.bor}`, overflowY: "auto", background: T.bg2 }}>
        <div style={{ padding: "16px", borderBottom: `1px solid ${T.bor}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: T.txt, margin: 0 }}>📱 Conversas</h3>
            {user.role === "gerente" && (
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: waStatus === "connected" ? "#25D366" : T.er, display: "inline-block" }} title={waStatus === "connected" ? "WhatsApp conectado" : "WhatsApp desconectado"} />
            )}
          </div>
          <span style={{ fontSize: 11, color: T.t2 }}>{groups.length} parceiros</span>
        </div>
        {groups.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: T.tm }}>Nenhum parceiro encontrado</div>}
        {groups.map(g => {
          const isSelected = selectedGroup?.parceiro_id === g.parceiro_id && selectedGroup?.gerente_id === g.gerente_id;
          const displayName = g.parceiro_name;
          const displaySub = g.parceiro_empresa || "Parceiro";
          return (
            <div key={`${g.gerente_id}-${g.parceiro_id}`}
              onClick={() => { setSelectedGroup(g); setCnpjMode(false); }}
              style={{ padding: "12px 16px", cursor: "pointer", borderBottom: `1px solid ${T.bor}22`, background: isSelected ? T.ac + "15" : "transparent", borderLeft: isSelected ? `3px solid ${T.ac}` : "3px solid transparent", transition: "all 0.15s" }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = T.ac + "08"; }} onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: T.ac + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: T.ac }}>
                  {(displayName || "?").substring(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</span>
                    {g.unread_count > 0 && <span style={{ background: T.ac, color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "2px 6px", minWidth: 18, textAlign: "center" }}>{g.unread_count}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: T.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displaySub}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <Badge type="info">{g.indications_count || 0} ind.</Badge>
                <Badge type="success">{g.active_count || 0} ativas</Badge>
              </div>
            </div>
          );
        })}
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg }}>
        {!selectedGroup ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: T.tm, fontSize: 14, gap: 16 }}>
            <span>Selecione um parceiro para ver a conversa</span>
            {user.role === "gerente" && waStatus !== "connected" && (
              <Btn sm v="primary" onClick={handleWaConnect} disabled={waLoading}>
                {waLoading ? "Conectando..." : "Conectar WhatsApp"}
              </Btn>
            )}
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.bor}`, background: T.bg2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.txt }}>{selectedGroup.parceiro_name}</span>
                <span style={{ fontSize: 11, color: T.t2 }}>{selectedGroup.parceiro_empresa || ""}</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {user.role === "gerente" && (
                  <>
                    {/* WhatsApp status indicator */}
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: waStatus === "connected" ? "#25D366" : T.tm, padding: "4px 8px", background: waStatus === "connected" ? "#25D36612" : T.bg, borderRadius: 6, border: `1px solid ${waStatus === "connected" ? "#25D36633" : T.bor}` }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: waStatus === "connected" ? "#25D366" : T.er }} />
                      {waStatus === "connected" ? "WhatsApp" : "Desconectado"}
                    </span>
                    {waStatus === "connected" ? (
                      <Btn sm v="secondary" onClick={handleWaDisconnect} disabled={waLoading}>Desconectar</Btn>
                    ) : (
                      <Btn sm v="primary" onClick={handleWaConnect} disabled={waLoading}>
                        {waLoading ? "..." : "Conectar WA"}
                      </Btn>
                    )}
                    <Btn sm v={cnpjMode ? "danger" : "secondary"} onClick={() => setCnpjMode(!cnpjMode)}>
                      {cnpjMode ? "✕ Cancelar" : "🔍 CNPJ"}
                    </Btn>
                  </>
                )}
              </div>
            </div>

            {/* CNPJ Input bar */}
            {cnpjMode && user.role === "gerente" && (
              <div style={{ padding: "10px 20px", background: T.inf + "0D", borderBottom: `1px solid ${T.inf}22`, display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.inf, fontWeight: 600 }}>🤖 Agente CNPJ:</span>
                <input value={cnpjInput} onChange={e => setCnpjInput(e.target.value)} placeholder="Digite o CNPJ..."
                  onKeyDown={e => e.key === "Enter" && handleCnpjCheck()}
                  style={{ flex: 1, padding: "8px 12px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 6, color: T.txt, fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none" }} />
                <Btn sm v="primary" onClick={handleCnpjCheck} disabled={cnpjLoading || !cnpjInput.trim()}>
                  {cnpjLoading ? "Consultando..." : "Consultar"}
                </Btn>
              </div>
            )}

            {/* Messages */}
            <div id="chat-messages" style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", color: T.tm, fontSize: 12, padding: 40 }}>Nenhuma mensagem ainda. Inicie a conversa!</div>
              )}
              {messages.map(msg => {
                const isMe = msg.sender_id === user.id;
                const isBot = msg.sender_type === "bot";
                return (
                  <div key={msg.id} style={{ display: "flex", justifyContent: isBot ? "center" : isMe ? "flex-end" : "flex-start", marginBottom: 2 }}>
                    <div style={{
                      maxWidth: isBot ? 440 : 360,
                      padding: isBot ? 0 : "10px 14px",
                      borderRadius: 12,
                      background: isBot ? "transparent" : isMe ? T.ac + "22" : T.card,
                      border: isBot ? "none" : isMe ? `1px solid ${T.ac}33` : `1px solid ${T.bor}`,
                    }}>
                      {!isMe && !isBot && <div style={{ fontSize: 10, fontWeight: 700, color: T.ac, marginBottom: 4 }}>{msg.sender_name}</div>}
                      {isBot ? renderBotMessage(msg) : <div style={{ fontSize: 13, color: T.txt, lineHeight: 1.5, wordBreak: "break-word" }}>{msg.content}</div>}
                      <div style={{ fontSize: 9, color: T.tm, marginTop: 4, textAlign: isMe ? "right" : "left", display: "flex", alignItems: "center", justifyContent: isMe ? "flex-end" : "flex-start", gap: 2 }}>
                        {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        {sourceLabel(msg.source)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input - apenas gerente */}
            {user.role === "gerente" && (
              <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.bor}`, background: T.bg2, display: "flex", gap: 8 }}>
                <input value={msgInput} onChange={e => setMsgInput(e.target.value)} placeholder={waStatus === "connected" ? "Mensagem (enviada via WhatsApp)..." : "Mensagem (somente CRM)..."}
                  onKeyDown={e => e.key === "Enter" && sendMessage()}
                  style={{ flex: 1, padding: "10px 14px", background: T.inp, border: `1px solid ${T.bor}`, borderRadius: 8, color: T.txt, fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none" }} />
                <Btn sm v="primary" onClick={sendMessage} disabled={!msgInput.trim()}>Enviar</Btn>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ===== DIRETORIA PAGE =====
function DiretoriaPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const res = await diretoriaApi.getSummary();
        setData(res.data);
      } catch (e) { console.error("Diretoria error:", e); }
      finally { setLoading(false); }
    })();
  }, []);

  const [dirExpanded, setDirExpanded] = useState({});
  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleDirExpand = (id) => setDirExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const convColor = (rate) => rate >= 30 ? T.ok : rate >= 15 ? T.wn : T.er;

  const fmtDate = (d) => {
    if (!d) return "—";
    try { const dt = new Date(d); return dt.toLocaleDateString("pt-BR"); } catch { return "—"; }
  };

  const renderGerenteCard = (item) => {
    const g = item.gerente;
    const isExp = expanded[g.id];
    return (
      <div key={g.id} style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        <div onClick={() => toggleExpand(g.id)} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          onMouseEnter={e => e.currentTarget.style.background = T.ac + "08"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: T.ac + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: T.ac }}>
              {g.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.txt }}>{g.name}</div>
              <div style={{ fontSize: 11, color: T.t2 }}>{item.parceiro_count} parceiros</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.txt }}>{item.total_indications}</div>
              <div style={{ fontSize: 10, color: T.t2 }}>Total</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.ok }}>{item.active_count}</div>
              <div style={{ fontSize: 10, color: T.t2 }}>Ativas</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.inf }}>{item.pipeline_count}</div>
              <div style={{ fontSize: 10, color: T.t2 }}>Em Andamento</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.ac }}>{(item.total_funcionarios || 0).toLocaleString('pt-BR')}</div>
              <div style={{ fontSize: 10, color: T.t2 }}>Funcionários</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: convColor(item.conversion_rate) }}>{item.conversion_rate}%</div>
              <div style={{ fontSize: 10, color: T.t2 }}>Conversão</div>
            </div>
            <span style={{ fontSize: 14, color: T.t2, transition: "transform 0.2s", transform: isExp ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
          </div>
        </div>

        {/* Conversion bar */}
        <div style={{ height: 3, background: T.bor }}>
          <div style={{ height: "100%", width: `${Math.min(item.conversion_rate, 100)}%`, background: convColor(item.conversion_rate), transition: "width 0.3s" }} />
        </div>

        {/* Expanded: parceiros table */}
        {isExp && (
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.bor}` }}>
            {item.parceiros.length === 0 ? (
              <div style={{ fontSize: 12, color: T.tm, textAlign: "center", padding: 12 }}>Nenhum parceiro</div>
            ) : (
              <div className="table-responsive"><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 600 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.bor}` }}>
                    <th style={{ textAlign: "left", padding: "8px 6px", color: T.t2, fontWeight: 600 }}>Parceiro</th>
                    <th style={{ textAlign: "left", padding: "8px 6px", color: T.t2, fontWeight: 600 }}>Empresa</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: T.t2, fontWeight: 600 }}>Total</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: T.t2, fontWeight: 600 }}>Ativas</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: T.t2, fontWeight: 600 }}>Em Andamento</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: T.t2, fontWeight: 600 }}>Funcionários</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: T.t2, fontWeight: 600 }}>Última Indicação</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: T.t2, fontWeight: 600 }}>Conversão</th>
                  </tr>
                </thead>
                <tbody>
                  {item.parceiros.map(p => (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${T.bor}22` }}>
                      <td style={{ padding: "8px 6px", color: T.txt, fontWeight: 500 }}>{p.name}</td>
                      <td style={{ padding: "8px 6px", color: T.t2 }}>{p.empresa || "—"}</td>
                      <td style={{ padding: "8px 6px", color: T.txt, textAlign: "center" }}>{p.total_indications || 0}</td>
                      <td style={{ padding: "8px 6px", color: T.ok, textAlign: "center" }}>{p.active_count || 0}</td>
                      <td style={{ padding: "8px 6px", color: T.inf, textAlign: "center" }}>{p.pipeline_count || 0}</td>
                      <td style={{ padding: "8px 6px", color: T.ac, textAlign: "center" }}>{(p.total_funcionarios || 0).toLocaleString('pt-BR')}</td>
                      <td style={{ padding: "8px 6px", color: T.t2, textAlign: "center", fontSize: 11 }}>{fmtDate(p.last_indication_date)}</td>
                      <td style={{ padding: "8px 6px", textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                          <div style={{ width: 40, height: 4, background: T.bor, borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(p.conversion_rate, 100)}%`, background: convColor(p.conversion_rate), borderRadius: 2 }} />
                          </div>
                          <span style={{ color: convColor(p.conversion_rate), fontWeight: 600 }}>{p.conversion_rate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: T.t2 }}>Carregando dados da diretoria...</div>;
  if (!data) return <div style={{ padding: 40, textAlign: "center", color: T.er }}>Erro ao carregar dados.</div>;

  return (
    <div>
      {data.grouped ? (
        // Executivo view: grouped by director
        (data.summary || []).map(dir => {
          const isDirExp = dirExpanded[dir.diretor_id] !== false; // default expanded
          return (
          <div key={dir.diretor_id} style={{ marginBottom: 24 }}>
            <div style={{ background: T.card, border: `1px solid ${T.bor}`, borderRadius: 10, padding: 16, marginBottom: isDirExp ? 12 : 0, cursor: "pointer" }}
              onClick={() => setDirExpanded(prev => ({ ...prev, [dir.diretor_id]: !isDirExp }))}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, background: T.inf + "22", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: T.inf }}>👔</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: T.txt }}>{dir.diretor_name}</div>
                    <div style={{ fontSize: 11, color: T.t2 }}>{dir.gerentes.length} executivos · {dir.parceiro_count || 0} parceiros</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                  {[
                    { l: "Total", v: dir.total_indications || 0, co: T.txt },
                    { l: "Ativas", v: dir.active_count || 0, co: T.ok },
                    { l: "Em Andamento", v: dir.pipeline_count || 0, co: T.inf },
                    { l: "Funcionários", v: (dir.total_funcionarios || 0).toLocaleString('pt-BR'), co: T.ac },
                    { l: "Conversão", v: `${dir.conversion_rate || 0}%`, co: convColor(dir.conversion_rate || 0) },
                  ].map((s, i) => (
                    <div key={i} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: s.co }}>{s.v}</div>
                      <div style={{ fontSize: 10, color: T.t2 }}>{s.l}</div>
                    </div>
                  ))}
                  <span style={{ fontSize: 14, color: T.t2, transition: "transform 0.2s", transform: isDirExp ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
                </div>
              </div>
            </div>
            {isDirExp && dir.gerentes.map(renderGerenteCard)}
          </div>
        );})
      ) : (
        // Diretor view: flat list
        (data.summary || []).map(renderGerenteCard)
      )}
      {(data.summary || []).length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: T.tm, fontSize: 13 }}>Nenhum dado disponível.</div>
      )}
    </div>
  );
}

// ===== APP =====
const RL = { super_admin: "Super Admin", executivo: "Diretor", diretor: "Gerente", gerente: "Executivo", convenio: "Convênio", parceiro: "Parceiro" };
const NAV = [
  { id: "dash", l: "Dashboard", r: ["super_admin", "executivo", "diretor", "gerente", "parceiro", "convenio"] },
  { id: "kanban", l: "Funil/Pipeline", r: ["super_admin", "executivo", "diretor", "gerente"] },
  { id: "inds", l: "Minhas Indicações", r: ["parceiro"] },
  { id: "convenio", l: "Meu Convênio", r: ["convenio"] },
  { id: "parcs", l: "Parceiros", r: ["super_admin", "executivo", "diretor", "gerente"] },
  { id: "groups", l: "WhatsApp", r: ["super_admin", "executivo", "diretor", "gerente"] },
  { id: "diretoria", l: "Visão Diretoria", r: ["super_admin", "executivo", "diretor"] },
  { id: "fin", l: "Financeiro", r: ["super_admin", "executivo", "diretor", "gerente", "parceiro"] },
  { id: "mats", l: "Material de Apoio", r: ["super_admin", "executivo", "diretor", "gerente", "parceiro", "convenio"] },
  { id: "notifs", l: "Notificações", r: ["super_admin", "executivo", "diretor", "gerente", "parceiro", "convenio"] },
  { id: "cfg", l: "Configurações", r: ["super_admin"] },
];
const TIT = { dash: "Dashboard", kanban: "Funil / Pipeline", inds: "Minhas Indicações", convenio: "Meu Convênio", parcs: "Parceiros Indicadores", groups: "WhatsApp - Conversas", diretoria: "Visão Diretoria", fin: "Financeiro", mats: "Material de Apoio", notifs: "Central de Notificações", cfg: "Configurações" };
const EMO = { dash: "📊", kanban: "📋", inds: "🏢", convenio: "🤝", parcs: "👥", groups: "📱", diretoria: "📈", fin: "💰", mats: "📁", notifs: "🔔", cfg: "⚙️" };

export default function App() {
  const [user, setUser] = useState(null);
  const [pg, setPg] = useState("dash");
  const [users, setUsers] = useState([]);
  const [inds, setInds] = useState([]);
  const [comms, setComms] = useState([]);
  const [nfes, setNfes] = useState([]);
  const [mats, setMats] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [activity, setActivity] = useState([]);
  const [travaDias, setTravaDias] = useState(() => parseInt(localStorage.getItem("crmTravaDias")) || 90);
  const [cadenceRules, setCadenceRules] = useState(() => {
    const saved = localStorage.getItem("cadenceRules");
    return saved ? JSON.parse(saved) : DEFAULT_CADENCE;
  });
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem("crmTheme");
    if (saved && THEMES[saved]) { setTheme(saved); return saved; }
    return null;
  });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [, forceUpdate] = useState(0);
  const { isMobile, isTablet, isDesktop, breakpoint } = useBreakpoint();

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const response = await authApi.me();
          setUser(transformUser(response.data.user));
        } catch {
          clearTokens();
        }
      }
    };
    checkAuth();
  }, []);

  // Load all data when user logs in
  const loadAllData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);

    try {
      // Fetch all data in parallel
      const [usersRes, indsRes, matsRes, notifsRes, activityRes] = await Promise.all([
        usersApi.getAll(),
        indicationsApi.getAll(),
        materialsApi.getAll(),
        notificationsApi.getAll(),
        indicationsApi.getActivity(20).catch(() => ({ data: { activity: [] } })),
      ]);

      // Transform and set users
      const transformedUsers = (usersRes.data.users || usersRes.data || []).map(transformUser);
      setUsers(transformedUsers);

      // Transform and set indications
      const transformedInds = (indsRes.data.indications || indsRes.data || []).map(transformIndication);
      setInds(transformedInds);

      // Set activity feed
      setActivity(activityRes.data?.activity || []);

      // Set materials
      const materials = (matsRes.data.materials || matsRes.data || []).map(m => ({
        id: m.id,
        t: m.title,
        tipo: m.file_type,
        cat: m.category,
        sz: m.description?.match(/Tamanho: ([^|]+)/)?.[1] || "—",
        dt: m.created_at?.split('T')[0] || m.created_at,
      }));
      setMats(materials);

      // Set notifications
      const notifications = (notifsRes.data.notifications || notifsRes.data || []).map(n => ({
        id: n.id,
        tipo: n.type === 'success' ? 'liberacao' : n.type === 'warning' ? 'comunicado' : n.type === 'info' ? 'status' : 'sistema',
        titulo: n.title,
        msg: n.message,
        dt: n.created_at?.replace('T', ' ').slice(0, 16) || n.created_at,
        lido: n.is_read,
        para: n.user_id,
        de: 'sa1',
        link: n.link || 'notifs',
      }));
      setNotifs(notifications);

      // Load commissions and NFes based on role
      if (['super_admin', 'executivo', 'diretor', 'gerente', 'parceiro'].includes(user.role)) {
        try {
          const commsRes = await commissionsApi.getAll();
          const commissions = (commsRes.data.commissions || commsRes.data || []).map(c => ({
            id: c.id,
            pId: c.user_id,
            titulo: `Comissão`,
            periodo: c.created_at?.slice(0, 7) || '',
            valor: c.amount,
            arq: null,
            dt: c.created_at?.split('T')[0] || c.created_at,
            by: c.manager_id || 'g1',
          }));
          setComms(commissions);

          const nfesRes = await nfesApi.getAll();
          const nfesData = (nfesRes.data.nfes || nfesRes.data || []).map(n => ({
            id: n.id,
            pId: n.user_id,
            num: n.number,
            valor: n.value,
            arq: n.file_path,
            dt: n.created_at?.split('T')[0] || n.created_at,
            st: n.status === 'paid' ? 'pago' : 'pendente',
            pgDt: n.payment_date,
          }));
          setNfes(nfesData);
        } catch {
          // Financial data may not be available for all users
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setDataLoading(false);
    }
  }, [user]);

  // Persist cadence rules and travaDias
  useEffect(() => {
    localStorage.setItem("cadenceRules", JSON.stringify(cadenceRules));
  }, [cadenceRules]);
  useEffect(() => {
    localStorage.setItem("crmTravaDias", String(travaDias));
  }, [travaDias]);

  // Load data when user changes
  useEffect(() => {
    if (user) {
      loadAllData();
    }
  }, [user, loadAllData]);

  const applyTheme = (mode) => {
    setTheme(mode);
    setThemeState(mode);
    localStorage.setItem("crmTheme", mode);
    forceUpdate(n => n + 1);
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    } finally {
      clearTokens();
      setUser(null);
      setThemeState(null);
      setUsers([]);
      setInds([]);
      setComms([]);
      setNfes([]);
      setMats([]);
      setNotifs([]);
      setActivity([]);
    }
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

  if (user.mustChangePassword) return <ForceChangePassword user={user} onChanged={() => setUser(u => ({ ...u, mustChangePassword: false }))} onLogout={handleLogout} />;

  const nav = NAV.filter(n => n.r.includes(user.role));
  const useDrawer = isMobile || isTablet;
  const sW = useDrawer ? 280 : (collapsed ? 64 : 240);
  const showSidebar = useDrawer ? mobileMenuOpen : true;

  const handleNavClick = (id) => {
    setPg(id);
    if (useDrawer) setMobileMenuOpen(false);
  };

  return (
    <AuthCtx.Provider value={{ user }}>
      <style>{fonts}</style>
      <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'DM Sans',sans-serif", background: T.bg, color: T.txt }}>
        {/* Mobile overlay */}
        {useDrawer && mobileMenuOpen && (
          <div onClick={() => setMobileMenuOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99 }} />
        )}
        {/* Sidebar / Drawer */}
        {showSidebar && (
          <aside style={{ width: sW, background: T.bg2, borderRight: `1px solid ${T.bor}`, display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100, transition: useDrawer ? "transform 0.2s ease" : "width 0.2s ease", overflow: "hidden" }}>
            {/* Logo + collapse toggle */}
            <div style={{ padding: (!useDrawer && collapsed) ? "20px 0" : "20px 18px", borderBottom: `1px solid ${T.bor}`, display: "flex", alignItems: "center", justifyContent: (!useDrawer && collapsed) ? "center" : "space-between" }}>
              {(!useDrawer && collapsed)
                ? <button onClick={() => setCollapsed(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: T.ac, fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>S</button>
                : <>
                  <div>
                    <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 18, fontWeight: 700, color: T.ac }}>SOMAPAY</div>
                    <div style={{ fontSize: 9, color: T.tm, letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>Portal Parceiros</div>
                  </div>
                  {useDrawer
                    ? <button onClick={() => setMobileMenuOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: T.tm, padding: 4 }}>✕</button>
                    : <button onClick={() => setCollapsed(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: T.tm, padding: 4 }}>◀</button>
                  }
                </>
              }
            </div>
            {/* Nav */}
            <nav style={{ flex: 1, padding: (!useDrawer && collapsed) ? "12px 6px" : "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
              {nav.map(n => (
                <button key={n.id} onClick={() => handleNavClick(n.id)} title={(!useDrawer && collapsed) ? n.l : undefined}
                  style={{ display: "flex", alignItems: "center", justifyContent: (!useDrawer && collapsed) ? "center" : "flex-start", gap: (!useDrawer && collapsed) ? 0 : 10, padding: (!useDrawer && collapsed) ? "10px 0" : "10px 12px", borderRadius: 6, color: pg === n.id ? T.ac : T.t2, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "none", background: pg === n.id ? T.ac + "1A" : "transparent", width: "100%", textAlign: "left", fontFamily: "'DM Sans',sans-serif" }}>
                  <span style={{ fontSize: (!useDrawer && collapsed) ? 18 : 13 }}>{EMO[n.id]}</span>{(!useDrawer && collapsed) ? null : <span>{n.l}</span>}
                </button>
              ))}
            </nav>
            {/* User + theme toggle + logout */}
            <div style={{ padding: (!useDrawer && collapsed) ? "10px 6px" : "14px 10px", borderTop: `1px solid ${T.bor}` }}>
              {(useDrawer || !collapsed) && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: T.ac + "22", color: T.ac, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{user.av || user.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
                    <div style={{ fontSize: 10, color: T.tm, textTransform: "uppercase" }}>{RL[user.role]}</div>
                  </div>
                </div>
              )}
              <button onClick={() => applyTheme(theme === "dark" ? "light" : "dark")} title="Alternar tema"
                style={{ display: "flex", alignItems: "center", justifyContent: (!useDrawer && collapsed) ? "center" : "flex-start", gap: 10, padding: (!useDrawer && collapsed) ? "10px 0" : "10px 12px", borderRadius: 6, color: T.t2, fontSize: 13, cursor: "pointer", border: "none", background: "transparent", width: "100%", textAlign: "left", fontFamily: "'DM Sans',sans-serif", marginTop: 4 }}>
                <span>{theme === "dark" ? "☀️" : "🌙"}</span>{(!useDrawer && collapsed) ? null : <span>{theme === "dark" ? "Modo Claro" : "Modo Escuro"}</span>}
              </button>
              <button onClick={handleLogout} title="Sair"
                style={{ display: "flex", alignItems: "center", justifyContent: (!useDrawer && collapsed) ? "center" : "flex-start", gap: 10, padding: (!useDrawer && collapsed) ? "10px 0" : "10px 12px", borderRadius: 6, color: T.t2, fontSize: 13, cursor: "pointer", border: "none", background: "transparent", width: "100%", textAlign: "left", fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>
                🚪 {(!useDrawer && collapsed) ? null : "Sair"}
              </button>
            </div>
          </aside>
        )}
        <main style={{ flex: 1, marginLeft: useDrawer ? 0 : sW, minHeight: "100vh", transition: "margin-left 0.2s ease", paddingTop: useDrawer ? 0 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "14px 16px 14px 60px" : "14px 28px", borderBottom: `1px solid ${T.bor}`, background: T.bg2, position: "sticky", top: 0, zIndex: 50 }}>
            {useDrawer && (
              <button onClick={() => setMobileMenuOpen(true)} style={{ position: "fixed", left: 12, top: 10, zIndex: 51, background: T.bg2, border: `1px solid ${T.bor}`, borderRadius: 8, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 20, color: T.txt }}>☰</button>
            )}
            <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, letterSpacing: -0.5 }}>{TIT[pg]}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <NotifBell notifs={notifs} setNotifs={setNotifs} userId={user.id} setPg={setPg} />
              {!isMobile && <Badge type="success">● HubSpot</Badge>}
            </div>
          </div>
          <div style={{ padding: isMobile ? "16px 12px" : "24px 28px" }}>
            {pg === "dash" && <Dash inds={inds} users={users} comms={comms} nfes={nfes} activity={activity} />}
            {pg === "kanban" && <KanbanPage inds={inds} setInds={setInds} users={users} travaDias={travaDias} notifs={notifs} setNotifs={setNotifs} cadenceRules={cadenceRules} />}
            {pg === "inds" && <MinhasInd inds={inds} setInds={setInds} notifs={notifs} setNotifs={setNotifs} users={users} cadenceRules={cadenceRules} />}
            {pg === "convenio" && <ConvenioPage />}
            {pg === "parcs" && <ParcPage users={users} setUsers={setUsers} inds={inds} />}
            {pg === "groups" && <GroupsPage users={users} inds={inds} />}
            {pg === "diretoria" && <DiretoriaPage />}
            {pg === "fin" && <FinPage comms={comms} setComms={setComms} nfes={nfes} setNfes={setNfes} users={users} notifs={notifs} setNotifs={setNotifs} cadenceRules={cadenceRules} />}
            {pg === "mats" && <MatsPage mats={mats} />}
            {pg === "notifs" && <NotifsPage notifs={notifs} setNotifs={setNotifs} users={users} userId={user.id} />}
            {pg === "cfg" && <CfgPage mats={mats} setMats={setMats} users={users} setUsers={setUsers} inds={inds} travaDias={travaDias} setTravaDias={setTravaDias} notifs={notifs} setNotifs={setNotifs} cadenceRules={cadenceRules} setCadenceRules={setCadenceRules} />}
          </div>
        </main>
      </div>
    </AuthCtx.Provider>
  );
}
