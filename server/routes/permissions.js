import express from 'express';
import { getDatabase } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Default permissions per role (used when no custom config exists)
const DEFAULT_PERMISSIONS = {
  super_admin: {
    pages: ["dash", "kanban", "negocios", "bi", "parcs", "groups", "diretoria", "fin", "mats", "notifs", "cfg", "prospecting", "landing", "inbox"],
    features: ["criar_usuario", "editar_usuario", "deletar_usuario", "reset_senha",
      "criar_indicacao", "editar_indicacao", "mover_indicacao", "liberar_indicacao",
      "criar_deal", "editar_deal", "mover_deal",
      "criar_proposta", "emitir_contrato", "enviar_clicksign",
      "criar_comissao", "editar_comissao", "criar_nfe", "editar_nfe",
      "enviar_notificacao", "broadcast_notificacao",
      "criar_material", "editar_material", "deletar_material",
      "configurar_integracoes", "gerenciar_equipes", "gerenciar_funis",
      "gerenciar_convenios", "gerenciar_produtos", "gerenciar_propostas", "gerenciar_contratos",
      "ver_auditoria", "ver_bi", "ver_diretoria",
      "enviar_email", "criar_evento", "gerenciar_permissoes",
      "gerenciar_prospecting", "criar_cadence", "enviar_cadence", "ver_landing_pages", "usar_ai_agent"],
  },
  executivo: {
    pages: ["dash", "kanban", "negocios", "bi", "parcs", "groups", "diretoria", "fin", "mats", "notifs", "cfg", "prospecting", "landing", "inbox"],
    features: ["criar_usuario", "editar_usuario", "deletar_usuario", "reset_senha",
      "criar_indicacao", "editar_indicacao", "mover_indicacao", "liberar_indicacao",
      "criar_deal", "editar_deal", "mover_deal",
      "criar_proposta", "emitir_contrato", "enviar_clicksign",
      "criar_comissao", "editar_comissao", "criar_nfe", "editar_nfe",
      "enviar_notificacao", "broadcast_notificacao",
      "criar_material", "editar_material", "deletar_material",
      "gerenciar_equipes", "gerenciar_funis",
      "gerenciar_produtos", "gerenciar_propostas", "gerenciar_contratos",
      "ver_auditoria", "ver_bi", "ver_diretoria",
      "enviar_email", "criar_evento",
      "gerenciar_prospecting", "criar_cadence", "enviar_cadence", "ver_landing_pages", "usar_ai_agent"],
  },
  diretor: {
    pages: ["dash", "kanban", "negocios", "bi", "parcs", "groups", "diretoria", "fin", "mats", "notifs", "prospecting", "inbox"],
    features: ["criar_usuario", "editar_usuario",
      "criar_indicacao", "editar_indicacao", "mover_indicacao", "liberar_indicacao",
      "criar_deal", "editar_deal", "mover_deal",
      "criar_proposta", "emitir_contrato", "enviar_clicksign",
      "criar_comissao", "editar_comissao", "criar_nfe", "editar_nfe",
      "enviar_notificacao",
      "editar_material", "deletar_material",
      "ver_bi", "ver_diretoria",
      "enviar_email", "criar_evento",
      "gerenciar_prospecting", "criar_cadence", "enviar_cadence", "usar_ai_agent"],
  },
  gerente: {
    pages: ["dash", "kanban", "negocios", "bi", "parcs", "groups", "fin", "mats", "notifs", "cfg", "prospecting", "inbox"],
    features: ["criar_usuario",
      "criar_indicacao", "editar_indicacao", "mover_indicacao", "liberar_indicacao",
      "criar_deal", "editar_deal", "mover_deal",
      "criar_proposta", "emitir_contrato", "enviar_clicksign",
      "enviar_notificacao",
      "criar_material",
      "gerenciar_funis",
      "ver_bi",
      "enviar_email", "criar_evento",
      "gerenciar_prospecting", "criar_cadence", "enviar_cadence", "usar_ai_agent"],
  },
  parceiro: {
    pages: ["dash", "inds", "fin", "mats", "notifs"],
    features: ["criar_indicacao"],
  },
  convenio: {
    pages: ["dash", "convenio", "mats", "notifs"],
    features: [],
  },
};

// All available pages with labels
const ALL_PAGES = [
  { id: "dash", l: "Dashboard" },
  { id: "kanban", l: "Funil/Pipeline" },
  { id: "negocios", l: "Negociações" },
  { id: "bi", l: "BI / Analytics" },
  { id: "inds", l: "Minhas Indicações" },
  { id: "convenio", l: "Meu Convênio" },
  { id: "parcs", l: "Parceiros" },
  { id: "groups", l: "WhatsApp" },
  { id: "diretoria", l: "Visão Diretoria" },
  { id: "fin", l: "Financeiro" },
  { id: "mats", l: "Material de Apoio" },
  { id: "notifs", l: "Notificações" },
  { id: "cfg", l: "Configurações" },
  { id: "prospecting", l: "Prospecção" },
  { id: "landing", l: "Landing Pages" },
  { id: "inbox", l: "Caixa de Entrada" },
];

// All available features grouped
const ALL_FEATURES = [
  { group: "Usuários", items: [
    { id: "criar_usuario", l: "Criar usuário" },
    { id: "editar_usuario", l: "Editar usuário" },
    { id: "deletar_usuario", l: "Deletar usuário" },
    { id: "reset_senha", l: "Resetar senha" },
  ]},
  { group: "Indicações", items: [
    { id: "criar_indicacao", l: "Criar indicação" },
    { id: "editar_indicacao", l: "Editar indicação" },
    { id: "mover_indicacao", l: "Mover no funil" },
    { id: "liberar_indicacao", l: "Liberar/Bloquear" },
  ]},
  { group: "Negociações", items: [
    { id: "criar_deal", l: "Criar deal" },
    { id: "editar_deal", l: "Editar deal" },
    { id: "mover_deal", l: "Mover entre etapas" },
  ]},
  { group: "Propostas e Contratos", items: [
    { id: "criar_proposta", l: "Gerar proposta" },
    { id: "emitir_contrato", l: "Emitir contrato" },
    { id: "enviar_clicksign", l: "Enviar ClickSign" },
  ]},
  { group: "Financeiro", items: [
    { id: "criar_comissao", l: "Criar comissão" },
    { id: "editar_comissao", l: "Editar comissão" },
    { id: "criar_nfe", l: "Criar NF-e" },
    { id: "editar_nfe", l: "Editar NF-e" },
  ]},
  { group: "Notificações", items: [
    { id: "enviar_notificacao", l: "Enviar notificação" },
    { id: "broadcast_notificacao", l: "Broadcast (todos)" },
  ]},
  { group: "Material de Apoio", items: [
    { id: "criar_material", l: "Criar material" },
    { id: "editar_material", l: "Editar material" },
    { id: "deletar_material", l: "Deletar material" },
  ]},
  { group: "Configurações", items: [
    { id: "configurar_integracoes", l: "Configurar integrações" },
    { id: "gerenciar_equipes", l: "Gerenciar equipes" },
    { id: "gerenciar_funis", l: "Gerenciar funis" },
    { id: "gerenciar_convenios", l: "Gerenciar convênios" },
    { id: "gerenciar_produtos", l: "Gerenciar produtos" },
    { id: "gerenciar_propostas", l: "Gerenciar modelos proposta" },
    { id: "gerenciar_contratos", l: "Gerenciar modelos contrato" },
    { id: "gerenciar_permissoes", l: "Gerenciar permissões" },
  ]},
  { group: "Visão e Relatórios", items: [
    { id: "ver_auditoria", l: "Ver auditoria" },
    { id: "ver_bi", l: "Ver BI / Analytics" },
    { id: "ver_diretoria", l: "Visão Diretoria" },
  ]},
  { group: "Comunicação", items: [
    { id: "enviar_email", l: "Enviar email (Google)" },
    { id: "criar_evento", l: "Criar evento (Agenda)" },
  ]},
  { group: "Prospecção", items: [
    { id: "gerenciar_prospecting", l: "Gerenciar prospecção" },
    { id: "criar_cadence", l: "Criar cadência" },
    { id: "enviar_cadence", l: "Enviar cadência" },
    { id: "ver_landing_pages", l: "Ver landing pages" },
    { id: "usar_ai_agent", l: "Usar agente IA" },
  ]},
];

const ROLES = ["super_admin", "executivo", "diretor", "gerente", "parceiro", "convenio"];

// GET /permissions - Get all role permissions
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare('SELECT * FROM role_permissions').all();

    // Build permissions map merging defaults with custom
    const permissions = {};
    for (const role of ROLES) {
      const custom = rows.find(r => r.role === role);
      if (custom) {
        permissions[role] = {
          pages: JSON.parse(custom.pages || '[]'),
          features: JSON.parse(custom.features || '[]'),
          custom: true,
        };
      } else {
        permissions[role] = { ...DEFAULT_PERMISSIONS[role], custom: false };
      }
    }

    res.json({ permissions, allPages: ALL_PAGES, allFeatures: ALL_FEATURES, roles: ROLES });
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ error: 'Failed to get permissions' });
  }
});

// GET /permissions/my - Get current user's permissions (for frontend gating)
router.get('/my', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const custom = await db.prepare('SELECT * FROM role_permissions WHERE role = ?').get(req.user.role);

    let perms;
    if (custom) {
      perms = { pages: JSON.parse(custom.pages || '[]'), features: JSON.parse(custom.features || '[]') };
    } else {
      perms = DEFAULT_PERMISSIONS[req.user.role] || { pages: ["dash", "notifs"], features: [] };
    }

    // super_admin always has full access regardless of config
    if (req.user.role === 'super_admin') {
      perms = DEFAULT_PERMISSIONS.super_admin;
    }

    res.json(perms);
  } catch (error) {
    console.error('Get my permissions error:', error);
    res.status(500).json({ error: 'Failed to get permissions' });
  }
});

// PUT /permissions/:role - Update permissions for a role
router.put('/:role', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Apenas super_admin pode alterar permissões' });
    }

    const { role } = req.params;
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role inválido' });
    }

    // Cannot modify super_admin permissions
    if (role === 'super_admin') {
      return res.status(400).json({ error: 'Não é possível alterar permissões do super_admin' });
    }

    const { pages, features } = req.body;
    const db = getDatabase();

    // Upsert
    const existing = await db.prepare('SELECT id FROM role_permissions WHERE role = ?').get(role);
    if (existing) {
      await db.prepare(`
        UPDATE role_permissions SET pages = ?, features = ?, updated_by = ?, updated_at = ? WHERE role = ?
      `).run(JSON.stringify(pages || []), JSON.stringify(features || []), req.user.id, new Date().toISOString(), role);
    } else {
      await db.prepare(`
        INSERT INTO role_permissions (role, pages, features, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
      `).run(role, JSON.stringify(pages || []), JSON.stringify(features || []), req.user.id, new Date().toISOString());
    }

    res.json({ message: 'Permissões atualizadas', role, pages, features });
  } catch (error) {
    console.error('Update permissions error:', error);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// POST /permissions/reset/:role - Reset role to default permissions
router.post('/reset/:role', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Apenas super_admin pode resetar permissões' });
    }

    const { role } = req.params;
    if (!ROLES.includes(role) || role === 'super_admin') {
      return res.status(400).json({ error: 'Role inválido' });
    }

    const db = getDatabase();
    await db.prepare('DELETE FROM role_permissions WHERE role = ?').run(role);

    res.json({ message: 'Permissões resetadas para o padrão', role, ...DEFAULT_PERMISSIONS[role] });
  } catch (error) {
    console.error('Reset permissions error:', error);
    res.status(500).json({ error: 'Failed to reset permissions' });
  }
});

export default router;
